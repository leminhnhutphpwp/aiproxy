const registry = require('./model-registry');
const modelStatus = require('./model-status');
const opencode = require('../providers/opencode');
const openaiCompatible = require('../providers/openai-compatible');
const configStore = require('./config-store');
const { getDirectProviderConfig, resolveSecret, getProviderKeys } = require('./direct-provider-config');
const keyPool = require('./key-pool');

function hc() { return configStore.getSection('healthCheck'); }

let timer = null;
let running = false;
let sweepDone = false;
let sweepStartTime = null;
let lastProviderProbe = null;
const stats = { totalProbes: 0, successes: 0, failures: 0, lastCycle: null };

function start() {
  if (timer) return;
  lastProviderProbe = new Map();
  sweepDone = false;
  const cfg = hc();
  console.log('[HealthChecker] Starting (interval: ' + (cfg.intervalMs / 1000) + 's)');
  timer = setInterval(runCycle, cfg.intervalMs);
  setTimeout(runCycle, cfg.firstCheckDelayMs);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log('[HealthChecker] Stopped');
}

function pickConnectedCandidate(candidates) {
  return (candidates || []).find(candidate => registry.isProviderConnected(candidate.providerID)) || null;
}

async function runCycle() {
  if (running) return;
  running = true;

  try {
    const families = registry.getPublicModels();
    if (!families || families.length === 0) {
      return;
    }

    if (!sweepDone) {
      sweepStartTime = Date.now();
      console.log('[HealthChecker] Initial sweep: ' + families.length + ' models (fast mode)');
      await runSweep(families);
      sweepDone = true;
      const elapsed = Math.round((Date.now() - sweepStartTime) / 1000);
      console.log('[HealthChecker] Initial sweep done (' + stats.successes + '/' + stats.totalProbes + ' success, ' + stats.failures + ' failures) in ' + elapsed + 's');
    } else {
      console.log('[HealthChecker] Probe cycle: ' + families.length + ' models');
      await runNormalCycle(families);
    }

    stats.lastCycle = Date.now();
  } catch (error) {
    console.error('[HealthChecker] Cycle error:', error?.message || error);
  } finally {
    running = false;
  }
}

async function runSweep(families) {
  const byProvider = new Map();

  for (const family of families) {
    const resolved = registry.resolveModel(family.id);
    if (!resolved) continue;
    const candidates = registry.getModelCandidates(family.id) || [];
    if (candidates.length === 0) continue;
    const candidate = pickConnectedCandidate(candidates);
    if (!candidate) continue;

    if (!byProvider.has(candidate.providerID)) {
      byProvider.set(candidate.providerID, []);
    }
    byProvider.get(candidate.providerID).push({ family, candidates });
  }

  let globalCounter = 0;
  const total = families.length;

  const tasks = [];
  for (const [, models] of byProvider) {
    tasks.push((async () => {
      try {
        for (const { family, candidates } of models) {
          const cfg = hc();
          await probeModel(family.id, candidates, true, cfg.sweepProbeTimeoutMs);
          globalCounter++;
          if (cfg.sweepInterProbeDelayMs > 0) {
            await new Promise(r => setTimeout(r, cfg.sweepInterProbeDelayMs));
          }
        }
      } catch (error) {
        console.error('[HealthChecker] Sweep provider error:', error?.message || error);
      }
    })());
  }

  await Promise.all(tasks);
}

async function runNormalCycle(families) {
  for (const family of families) {
    try {
      const resolved = registry.resolveModel(family.id);
      if (!resolved) continue;

      const candidates = registry.getModelCandidates(family.id) || [];
      if (candidates.length === 0) continue;

      const candidate = pickConnectedCandidate(candidates);
      if (!candidate) continue;
      const cfg = hc();
      const lastTime = lastProviderProbe.get(candidate.providerID) || 0;
      if (Date.now() - lastTime < cfg.providerCooldownMs) continue;

      // Check status to determine if we should probe
      const now = Date.now();
      const statusData = modelStatus.getStatus(family.id);
      const status = statusData.status;
      const lastProbeAt = statusData.lastProbeAt || 0;

      let needProbe = false;
      if (status === 'unknown') {
        needProbe = true;
      } else if (status === 'down' || status === 'degraded') {
        if (now - lastProbeAt >= 60000) {
          needProbe = true;
        }
      } else if (status === 'available') {
        if (now - lastProbeAt >= cfg.probeStaleHealthyMs) {
          needProbe = true;
        }
      }

      if (!needProbe) continue;

      await probeModel(family.id, candidates, false, cfg.probeTimeoutMs);
      lastProviderProbe.set(candidate.providerID, Date.now());
      await new Promise(r => setTimeout(r, cfg.interProbeDelayMs));
    } catch (error) {
      console.error('[HealthChecker] Error probing ' + (family?.id || 'unknown') + ':', error?.message || error);
    }
  }
}

async function probeModel(alias, candidates, logToConsole, timeoutMs) {
  let lastError = null;
  for (const candidate of candidates) {
    let session = null;
    try {
      const cfg = hc();
      if (candidate.transport === 'openai-compatible') {
        const directConfig = getDirectProviderConfig(candidate.providerID);
        if (!directConfig) {
          throw new Error('Direct provider ' + candidate.providerID + ' config not found');
        }

        const hcProviderKeys = getProviderKeys(candidate.providerID);
        const hcSelected = hcProviderKeys.length > 1 ? keyPool.selectKey(hcProviderKeys) : null;
        const hcKeyToUse = hcSelected ? hcSelected.key : hcProviderKeys[0];
        if (!hcKeyToUse) {
          throw new Error('No usable API key for ' + candidate.providerID);
        }
        if (hcSelected) keyPool.markKeyActive(hcKeyToUse.id);

        await openaiCompatible.chatCompletion(
          { baseUrl: directConfig.baseURL, apiKey: hcKeyToUse.value, path: directConfig.path },
          candidate.modelID,
          [{ role: 'user', content: cfg.probeMessage }],
          { timeout: timeoutMs, max_tokens: cfg.probeMaxTokens }
        );
        if (hcSelected) keyPool.recordKeySuccess(hcKeyToUse.id, null);
      } else {
        session = await opencode.createSession({ timeoutMs });

        await opencode.handleSyncResponse(
          null,
          session.id,
          candidate.providerID,
          candidate.modelID,
          alias,
          [{ type: 'text', text: cfg.probeMessage }],
          { timeoutMs, max_tokens: cfg.probeMaxTokens }
        );
      }

      stats.totalProbes += 1;
      stats.successes += 1;
      modelStatus.recordProbeSuccess(alias, candidate.providerID, Date.now());

      if (logToConsole) {
        console.log('[HealthChecker] Sweep ' + alias + ' (' + candidate.providerID + ') ✓');
      }
      return;
    } catch (error) {
      lastError = error;
      if (logToConsole) {
        console.log('[HealthChecker] Sweep ' + alias + ' (' + candidate.providerID + ') ✗');
      }
    } finally {
      if (session && session.id) {
        await opencode.deleteSession(session.id, { timeoutMs: hc().probeCleanupTimeoutMs }).catch(() => {});
      }
    }
  }

  stats.totalProbes += 1;
  stats.failures += 1;
  const lastCandidate = candidates[candidates.length - 1];
  modelStatus.recordProbeFailure(alias, lastCandidate.providerID, lastError?.providerErrorType || lastError?.message || 'provider_error', Date.now());
}

function getStats() {
  return { ...stats, running, sweepDone };
}

module.exports = { start, stop, getStats };
