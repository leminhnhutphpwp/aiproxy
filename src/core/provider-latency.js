const WINDOW_MS = 300000;
const MAX_SAMPLES = 100;
const latencyMap = new Map();

function getEntry(providerID) {
  if (!latencyMap.has(providerID)) {
    latencyMap.set(providerID, { samples: [] });
  }
  return latencyMap.get(providerID);
}

function trimSamples(entry) {
  const cutoff = Date.now() - WINDOW_MS;
  entry.samples = entry.samples.filter(s => s.ts > cutoff);
  if (entry.samples.length > MAX_SAMPLES) {
    entry.samples = entry.samples.slice(-MAX_SAMPLES);
  }
}

function recordLatency(providerID, latencyMs) {
  if (!providerID || typeof latencyMs !== 'number' || latencyMs < 0) return;
  const entry = getEntry(providerID);
  entry.samples.push({ ts: Date.now(), latencyMs });
  trimSamples(entry);
}

function getAvgLatency(providerID) {
  const entry = latencyMap.get(providerID);
  if (!entry || entry.samples.length === 0) return Infinity;
  const sum = entry.samples.reduce((s, x) => s + x.latencyMs, 0);
  return sum / entry.samples.length;
}

function getProviderStats(providerID) {
  const entry = latencyMap.get(providerID);
  if (!entry || entry.samples.length === 0) return null;
  const values = entry.samples.map(s => s.latencyMs);
  const sum = values.reduce((a, b) => a + b, 0);
  const sorted = [...values].sort((a, b) => a - b);
  return {
    avg: Math.round((sum / values.length) * 10) / 10,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: values.length,
    p50: sorted[Math.floor(0.5 * sorted.length)],
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
    p99: sorted[Math.ceil(0.99 * sorted.length) - 1],
  };
}

function getAllLatencyStats() {
  const result = {};
  for (const [providerID] of latencyMap) {
    const stats = getProviderStats(providerID);
    if (stats) result[providerID] = stats;
  }
  return result;
}

function _reset() {
  latencyMap.clear();
}

module.exports = {
  recordLatency,
  getAvgLatency,
  getProviderStats,
  getAllLatencyStats,
  _reset,
};
