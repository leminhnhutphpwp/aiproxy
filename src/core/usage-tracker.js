const path = require('path');
const fs = require('fs');
const configStore = require('./config-store');
const writeBuffer = require('./write-buffer');

const USAGE_DIR = path.join(__dirname, '..', '..', 'config', 'usage');
let dirChecked = false;

function ensureDir() {
  if (!dirChecked) {
    if (!fs.existsSync(USAGE_DIR)) {
      fs.mkdirSync(USAGE_DIR, { recursive: true });
    }
    dirChecked = true;
  }
}

function getDailyFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(USAGE_DIR, date + '.jsonl');
}

function getEstimatedCost(inputTokens, outputTokens) {
  const pricing = configStore.getSection('pricing') || {};
  const inputRate = pricing.inputPer1k || 0.00015;
  const outputRate = pricing.outputPer1k || 0.0006;
  return ((inputTokens || 0) / 1000) * inputRate + ((outputTokens || 0) / 1000) * outputRate;
}

const statusMap = new Map();
let totalTokensLogged = 0;
let _statsCache = null;
let _statsCacheTime = 0;
const STATS_CACHE_TTL = 60000;

function resetCounters() {
  statusMap.clear();
  totalTokensLogged = 0;
}

function recordUsage({ model, provider, alias, inputTokens, outputTokens, latencyMs, status, group }) {
  const entry = {
    ts: Date.now(),
    model,
    provider,
    alias: alias || model,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    totalTokens: (inputTokens || 0) + (outputTokens || 0),
    costUsd: getEstimatedCost(inputTokens, outputTokens),
    latencyMs: latencyMs || 0,
    status: status || 200,
    group: group || 'chat',
  };

  totalTokensLogged += entry.totalTokens;

  const hourKey = new Date().toISOString().slice(0, 13);
  const stats = statusMap.get(hourKey) || { hour: hourKey, requests: 0, totalTokens: 0, totalCost: 0, errors: 0 };
  stats.requests += 1;
  stats.totalTokens += entry.totalTokens;
  stats.totalCost += entry.costUsd;
  if (status >= 400) stats.errors += 1;
  statusMap.set(hourKey, stats);

  _statsCache = null;
  try {
    ensureDir();
    writeBuffer.append(getDailyFilePath(), JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[UsageTracker] Write error:', err.message);
  }
}

function getUsageStats(hours = 24) {
  const now = Date.now();
  if (_statsCache && (now - _statsCacheTime) < STATS_CACHE_TTL && _statsCache._hours === hours) {
    return _statsCache;
  }
  const cutoff = now - hours * 3600000;
  const entries = [];
  const files = fs.existsSync(USAGE_DIR) ? fs.readdirSync(USAGE_DIR).filter(f => f.endsWith('.jsonl')).sort() : [];

  for (const file of files) {
    const filePath = path.join(USAGE_DIR, file);
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.ts >= cutoff) {
          entries.push(entry);
        }
      } catch (e) {}
    }
  }

  const recentEntries = entries.slice(-1000);
  const totalInput = entries.reduce((sum, e) => sum + (e.inputTokens || 0), 0);
  const totalOutput = entries.reduce((sum, e) => sum + (e.outputTokens || 0), 0);
  const totalCost = entries.reduce((sum, e) => sum + (e.costUsd || 0), 0);
  const totalRequests = entries.length;
  const errors = entries.filter(e => e.status >= 400).length;

  _statsCache = {
    summary: {
      totalRequests,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      totalCostUsd: Math.round(totalCost * 10000) / 10000,
      errorCount: errors,
      errorRate: totalRequests > 0 ? Math.round((errors / totalRequests) * 10000) / 100 : 0,
      periodHours: hours,
    },
    hourly: Array.from(statusMap.values())
      .filter(s => new Date(s.hour).getTime() > cutoff)
      .sort((a, b) => a.hour.localeCompare(b.hour)),
    recent: recentEntries.reverse(),
    _hours: hours,
  };
  _statsCacheTime = now;
  return _statsCache;
}

function getTokenSummary() {
  return { totalTokensLogged };
}

function cleanupOldFiles() {
  try {
    ensureDir();
    const files = fs.readdirSync(USAGE_DIR).filter(f => f.endsWith('.jsonl'));
    const cutoff = Date.now() - 30 * 86400000;
    for (const file of files) {
      const fp = path.join(USAGE_DIR, file);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch (e) { /* silently fail */ }
}

const _reset = () => {
  resetCounters();
};

module.exports = { recordUsage, getUsageStats, getTokenSummary, cleanupOldFiles, _reset };
