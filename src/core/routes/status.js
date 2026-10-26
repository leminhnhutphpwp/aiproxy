const modelStatus = require('../model-status');
const requestLogger = require('../request-logger');
const registry = require('../model-registry');
const providerLatency = require('../provider-latency');
const usageTracker = require('../usage-tracker');
const tokenSavings = require('../token-savings');
const { PATHS } = require('../constants');
const fs = require('fs');

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/overview', (req, res) => {
    const allStatus = modelStatus.getAllStatus();
    const stats = requestLogger.getStats();
    const totalModels = allStatus.length;
    const available = allStatus.filter(s => s.status === 'available').length;
    const degraded = allStatus.filter(s => s.status === 'degraded').length;
    const overloaded = allStatus.filter(s => s.status === 'overloaded').length;
    const down = allStatus.filter(s => s.status === 'down').length;
    const unknown = allStatus.filter(s => s.status === 'unknown').length;

    // Today's usage
    const usage = usageTracker.getUsageStats(24);
    const todayRequests = usage.summary.totalRequests || 0;
    const todayTokens = usage.summary.totalTokens || 0;
    const todayCost = usage.summary.totalCostUsd || 0;
    const todayErrors = usage.summary.errorCount || 0;

    // Provider latency avg (across all providers)
    const latencyStats = providerLatency.getAllLatencyStats();
    let avgLatency = 0;
    let latencyCount = 0;
    for (const p of Object.values(latencyStats)) {
      if (p.avg > 0) { avgLatency += p.avg; latencyCount++; }
    }
    if (latencyCount > 0) avgLatency = Math.round(avgLatency / latencyCount);

    // Top models by request count
    const topModels = allStatus
      .filter(s => s.successCount > 0 || s.failureCount > 0)
      .sort((a, b) => (b.successCount + b.failureCount) - (a.successCount + a.failureCount))
      .slice(0, 10)
      .map(s => ({
        id: s.alias,
        status: s.status,
        requests: s.successCount + s.failureCount,
        successCount: s.successCount,
        failureCount: s.failureCount,
        successRate: s.successRate,
        tokens: s.totalTokens,
        trendDirection: s.trendDirection || 'stable',
        popularityScore: s.popularityScore || 0,
      }));

    const totalTokensToday = allStatus.reduce((sum, s) => sum + (s.totalTokens || 0), 0);

    dashboardApp.sendJson(res, 200, {
      totalModels,
      available,
      degraded,
      overloaded,
      down,
      unknown,
      uptime: Math.floor(process.uptime()),
      totalRequests: stats.totalRequests,
      totalSuccess: stats.totalSuccess,
      successRate: stats.successRate,
      todayRequests,
      todayTokens,
      todayCost: Math.round(todayCost * 10000) / 10000,
      todayErrors,
      avgLatency,
      totalTokens: totalTokensToday,
      topModels,
    });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/provider-latency', (req, res) => {
    const stats = providerLatency.getAllLatencyStats();
    dashboardApp.sendJson(res, 200, stats);
  });

  dashboardApp.addRoute('GET', '/dashboard/api/status', (req, res) => {
    const allStatus = modelStatus.getAllStatus();
    const body = {
      object: 'list',
      data: allStatus.map(s => ({
        id: s.alias,
        object: 'model.status',
        status: s.status,
        reason: s.reason || null,
        provider: s.provider,
        candidates: s.candidateCount,
        lastChecked: s.lastChecked ? new Date(s.lastChecked).toISOString() : null,
        lastProbeAt: s.lastProbeAt ? new Date(s.lastProbeAt).toISOString() : null,
        lastProbeOk: s.lastProbeOk,
        lastProbeReason: s.lastProbeReason,
        consecutiveProbeSuccess: s.consecutiveProbeSuccess,
        consecutiveProbeFailure: s.consecutiveProbeFailure,
        lastRequestAt: s.lastRequestAt ? new Date(s.lastRequestAt).toISOString() : null,
        lastRequestOk: s.lastRequestOk,
        lastRequestReason: s.lastRequestReason,
        lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : null,
        lastFailureAt: s.lastFailureAt ? new Date(s.lastFailureAt).toISOString() : null,
        successCount: s.successCount,
        failureCount: s.failureCount,
        successRate: s.successRate,
        totalTokens: s.totalTokens,
        peakRps: s.peakRps,
        trendDirection: s.trendDirection || 'stable',
        popularityScore: s.popularityScore || 0,
        recentHourCount: s.recentHourCount || 0,
        recentDayCount: s.recentDayCount || 0,
      })),
    };
    dashboardApp.sendJson(res, 200, body);
  });

  dashboardApp.addRoute('GET', '/dashboard/api/models/:modelId/candidates', (req, res) => {
    const modelId = req.params.modelId;
    const candidates = registry.getModelCandidates(modelId) || [];
    const allStatus = modelStatus.getAllStatus();
    const entry = allStatus.find(s => s.alias === modelId) || {};

    const result = candidates.map(c => {
      const key = c.providerID + '/' + c.modelID;
      const statusEntry = modelStatus.getStatus(modelId);
      const candidateStatus = statusEntry ? {
        status: statusEntry.status,
        reason: statusEntry.reason,
        lastProbeAt: statusEntry.lastProbeAt,
        lastProbeOk: statusEntry.lastProbeOk,
        lastProbeReason: statusEntry.lastProbeReason,
        lastRequestAt: statusEntry.lastRequestAt,
        lastRequestOk: statusEntry.lastRequestOk,
        consecutiveProbeSuccess: statusEntry.consecutiveProbeSuccess,
        consecutiveProbeFailure: statusEntry.consecutiveProbeFailure,
      } : {};
      const connected = registry.isProviderConnected(c.providerID);
      return {
        providerID: c.providerID,
        modelID: c.modelID,
        transport: c.transport || 'opencode',
        matchKind: c.matchKind,
        connected,
        ...candidateStatus,
      };
    });

    dashboardApp.sendJson(res, 200, {
      modelId,
      candidates: result,
      modelEntry: {
        status: entry.status || 'unknown',
        reason: entry.reason || null,
        provider: entry.provider || null,
        candidateCount: entry.candidateCount || candidates.length,
      },
    });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/sync/status', (req, res) => {
    const GENERATED_PATH = PATHS.MODELS_GENERATED;
    const OVERRIDE_PATH = PATHS.MODELS_OVERRIDE;
    const SOURCE_PATH = PATHS.PUBLIC_MODELS;

    const generatedMeta = {};
    try {
      const generated = JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8'));
      if (generated._meta) {
        generatedMeta.version = generated._meta.version;
        generatedMeta.generatedAt = generated._meta.generatedAt;
        generatedMeta.sourceHash = generated._meta.sourceHash;
      }
    } catch {}

    // Compute current source hash for drift check
    let currentHash = null;
    let overrideCount = 0;
    try {
      const sourceContent = fs.readFileSync(SOURCE_PATH, 'utf8');
      const crypto = require('crypto');
      currentHash = crypto.createHash('md5').update(sourceContent).digest('hex');
    } catch {}

    try {
      const overrides = JSON.parse(fs.readFileSync(OVERRIDE_PATH, 'utf8'));
      overrideCount = Object.keys(overrides).length;
    } catch {}

    dashboardApp.sendJson(res, 200, {
      object: 'sync.status',
      synced: !!generatedMeta.generatedAt,
      lastSync: generatedMeta.generatedAt || null,
      version: generatedMeta.version || null,
      sourceHash: generatedMeta.sourceHash || null,
      currentHash: currentHash,
      hasDrift: generatedMeta.sourceHash && currentHash ? generatedMeta.sourceHash !== currentHash : false,
      overrideCount,
    });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/sync/run', (req, res) => {
    const { exec } = require('child_process');
    const syncScript = PATHS.SYNC_MODELS;
    if (!fs.existsSync(syncScript)) {
      dashboardApp.sendJson(res, 200, { ok: false, error: 'Sync script not found' });
      return;
    }
    exec('node ' + syncScript, { timeout: 30000, cwd: PATHS.CATALOG_CONFIG_DIR }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Sync] Run failed:', error.message);
        dashboardApp.sendJson(res, 200, { ok: false, error: error.message });
        return;
      }
      console.log('[Sync] Completed:', stdout.slice(0, 200));
      dashboardApp.sendJson(res, 200, { ok: true, output: stdout.slice(0, 500) });
    });
  });
}

module.exports = { register };
