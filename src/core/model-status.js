const path = require('path');
const fs = require('fs');
const registry = require('./model-registry');
const writeBuffer = require('./write-buffer');
const configStore = require('./config-store');
function sc() { return configStore.getSection('statusCompute'); }
const STATUS_DIR = path.join(__dirname, '..', '..', 'config', 'status');
const MAX_STATUS_AGE_DAYS = 7;

function ensureStatusDir() {
  if (!fs.existsSync(STATUS_DIR)) {
    fs.mkdirSync(STATUS_DIR, { recursive: true });
  }
}

function statusFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(STATUS_DIR, date + '.jsonl');
}

function saveToDisk(alias, entry) {
  try {
    if (process.env.AIPROXY_TEST_MODE === 'true') return;
    ensureStatusDir();
    const line = JSON.stringify({
      ts: Date.now(),
      alias: entry.alias,
      provider: entry.provider,
      successCount: entry.successCount,
      failureCount: entry.failureCount,
      totalInputTokens: entry.totalInputTokens,
      totalOutputTokens: entry.totalOutputTokens,
      lastRequestAt: entry.lastRequestAt,
      lastRequestOk: entry.lastRequestOk,
      lastSuccessAt: entry.lastSuccessAt,
      lastFailureAt: entry.lastFailureAt,
      peakRps: entry.peakRps,
    }) + '\n';
    writeBuffer.append(statusFilePath(), line);
  } catch (e) {
    // silently fail — disk write should not crash requests
  }
}

function loadFromDisk() {
  try {
    ensureStatusDir();
    const files = fs.readdirSync(STATUS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .slice(-MAX_STATUS_AGE_DAYS);

    for (const file of files) {
      const filepath = path.join(STATUS_DIR, file);
      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (!data.alias) continue;
          const entry = getEntry(data.alias);
          entry.provider = data.provider || entry.provider;
          entry.successCount = Math.max(entry.successCount, data.successCount || 0);
          entry.failureCount = Math.max(entry.failureCount, data.failureCount || 0);
          entry.totalInputTokens = Math.max(entry.totalInputTokens, Math.min(data.totalInputTokens || 0, 1e15));
          entry.totalOutputTokens = Math.max(entry.totalOutputTokens, Math.min(data.totalOutputTokens || 0, 1e15));
          entry.peakRps = Math.max(entry.peakRps, data.peakRps || 0);
          if (data.lastRequestAt && (!entry.lastRequestAt || data.lastRequestAt > entry.lastRequestAt)) {
            entry.lastRequestAt = data.lastRequestAt;
            entry.lastRequestOk = data.lastRequestOk === true;
            entry.lastSuccessAt = data.lastSuccessAt || entry.lastSuccessAt;
            entry.lastFailureAt = data.lastFailureAt || entry.lastFailureAt;
          }
        } catch (e) {
          // skip malformed lines
        }
      }
    }
  } catch (e) {
    // silently fail — no data is OK
  }
}

function _cleanupOldFiles() {
  try {
    ensureStatusDir();
    const cutoff = Date.now() - MAX_STATUS_AGE_DAYS * 86400000;
    const files = fs.readdirSync(STATUS_DIR);
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filepath = path.join(STATUS_DIR, file);
      const stat = fs.statSync(filepath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filepath);
      }
    }
  } catch (e) {
    // silently fail
  }
}

const STATUS = {
  AVAILABLE: 'available',
  DEGRADED: 'degraded',
  OVERLOADED: 'overloaded',
  DOWN: 'down',
  UNKNOWN: 'unknown',
};

const REASON_LABELS = {
  auth_billing: 'Lỗi xác thực / hết credit',
  quota_exhausted: 'Hết quota',
  rate_limit: 'Quá tải yêu cầu',
  timeout: 'Hết thời gian phản hồi',
  provider_unavailable: 'Nhà cung cấp tạm thời không khả dụng',
  provider_error: 'Lỗi nhà cung cấp',
  generic_provider_error: 'Lỗi nhà cung cấp',
  bad_request: 'Yêu cầu không hợp lệ',
  model_not_found: 'Không tìm thấy model',
  no_api_key: 'Thiếu API key',
};

function createEntry(alias, provider = 'unknown') {
  return {
    alias,
    status: STATUS.UNKNOWN,
    reason: null,
    provider,
    candidateCount: 0,
    lastChecked: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    lastProbeAt: null,
    lastProbeOk: null,
    lastProbeReason: null,
    lastProbeFailureAt: null,
    consecutiveProbeSuccess: 0,
    consecutiveProbeFailure: 0,
    lastRequestAt: null,
    lastRequestOk: null,
    lastRequestReason: null,
    successCount: 0,
    failureCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    requestTimestamps: [],
    peakRps: 0,
    trendBuckets: {},       // { "2026-06-27T10": 45, "2026-06-27T11": 120 }
    trendDirection: 'stable', // 'rising' | 'stable' | 'declining'
    popularityScore: 0,
    recentHourCount: 0,
    recentDayCount: 0,
  };
}

function computeSuccessRate(success, failure) {
  const total = success + failure;
  if (total === 0) return null;
  return Math.round((success / total) * 1000) / 10;
}

function recordTimestamp(entry) {
  const now = Date.now();
  entry.requestTimestamps.push(now);
  const cutoff = now - 60000;
  entry.requestTimestamps = entry.requestTimestamps.filter(t => t > cutoff);
  const currentRps = entry.requestTimestamps.length / 60;
  if (currentRps > entry.peakRps) {
    entry.peakRps = Math.round(currentRps * 10) / 10;
  }

  updateTrendBuckets(entry, now);
}

function getHourKey(ts) {
  const d = new Date(ts);
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0') + 'T' +
    String(d.getUTCHours()).padStart(2, '0') + ':00';
}

function updateTrendBuckets(entry, now) {
  const hourKey = getHourKey(now);
  entry.trendBuckets[hourKey] = (entry.trendBuckets[hourKey] || 0) + 1;

  // Compute recent counts
  const oneHourAgo = now - 3600000;
  const oneDayAgo = now - 86400000;
  let hourCount = 0;
  let dayCount = 0;
  for (const [key, count] of Object.entries(entry.trendBuckets)) {
    const keyTs = new Date(key + ':00.000Z').getTime();
    if (keyTs > oneHourAgo) hourCount += count;
    if (keyTs > oneDayAgo) dayCount += count;
    if (keyTs < oneDayAgo) delete entry.trendBuckets[key];
  }
  entry.recentHourCount = hourCount;
  entry.recentDayCount = dayCount;

  // Compute trend direction: compare last completed hour vs the one before it
  const sortedHours = Object.keys(entry.trendBuckets).sort();
  if (sortedHours.length >= 2) {
    const last = sortedHours[sortedHours.length - 1];
    const prev = sortedHours[sortedHours.length - 2];
    const lastCount = entry.trendBuckets[last] || 0;
    const prevCount = entry.trendBuckets[prev] || 1;
    const ratio = lastCount / prevCount;
    if (ratio > 1.2) {
      entry.trendDirection = 'rising';
    } else if (ratio < 0.8) {
      entry.trendDirection = 'declining';
    } else {
      entry.trendDirection = 'stable';
    }
  }

  // Compute popularity score (weighted)
  const sr = computeSuccessRate(entry.successCount, entry.failureCount);
  entry.popularityScore = Math.round(
    (entry.recentHourCount * 10) +
    (entry.peakRps * 5) +
    ((sr || 0) / 10)
  );
}

const statusMap = new Map();
let initialized = false;
let breakerChecker = null;
let providerChecker = null;

function initialize(families) {
  const currentIds = new Set();
  for (const family of (families || [])) {
    currentIds.add(family.id);
    if (!statusMap.has(family.id)) {
      statusMap.set(family.id, createEntry(family.id, family.providerID || 'unknown'));
    }
  }
  for (const alias of statusMap.keys()) {
    if (!currentIds.has(alias)) {
      statusMap.delete(alias);
    }
  }
  initialized = true;
}

function setBreakerChecker(fn) {
  breakerChecker = fn;
}

function setProviderChecker(fn) {
  providerChecker = fn;
}

function getEntry(alias) {
  if (!statusMap.has(alias)) {
    statusMap.set(alias, createEntry(alias));
  }
  return statusMap.get(alias);
}

function recordSuccess(alias, providerID, tokens) {
  const entry = getEntry(alias);
  entry.provider = providerID || entry.provider;
  entry.successCount += 1;
  entry.lastRequestAt = Date.now();
  entry.lastRequestOk = true;
  entry.lastRequestReason = null;
  entry.lastChecked = entry.lastRequestAt;
  entry.lastSuccessAt = entry.lastRequestAt;
  
  // Real user request success acts as a successful probe to build confidence
  entry.consecutiveProbeSuccess += 1;
  entry.consecutiveProbeFailure = 0;

  if (tokens) {
    entry.totalInputTokens += tokens.input || 0;
    entry.totalOutputTokens += tokens.output || 0;
  }
  recordTimestamp(entry);
  saveToDisk(alias, entry);
}

function recordFailure(alias, providerID, error) {
  const entry = getEntry(alias);
  entry.provider = providerID || entry.provider;
  entry.failureCount += 1;
  entry.lastRequestAt = Date.now();
  entry.lastRequestOk = false;
  entry.lastRequestReason = error?.providerErrorType || error?.message || 'provider_error';
  entry.lastFailureAt = entry.lastRequestAt;
  entry.lastFailureReason = entry.lastRequestReason;
  entry.lastChecked = entry.lastRequestAt;

  // Real user request failure resets probe confidence
  entry.consecutiveProbeSuccess = 0;
  entry.consecutiveProbeFailure += 1;

  recordTimestamp(entry);
  saveToDisk(alias, entry);
}

function recordProbeSuccess(alias, providerID, timestamp = Date.now()) {
  const entry = getEntry(alias);
  entry.provider = providerID || entry.provider;
  entry.lastProbeAt = timestamp;
  entry.lastProbeOk = true;
  entry.lastProbeReason = null;
  entry.consecutiveProbeSuccess += 1;
  entry.consecutiveProbeFailure = 0;
}

function recordProbeFailure(alias, providerID, reason = null, timestamp = Date.now()) {
  const entry = getEntry(alias);
  entry.provider = providerID || entry.provider;
  entry.lastProbeAt = timestamp;
  entry.lastProbeOk = false;
  entry.lastProbeReason = reason;
  entry.lastProbeFailureAt = timestamp;
  entry.consecutiveProbeSuccess = Math.max(0, entry.consecutiveProbeSuccess - 1);
  entry.consecutiveProbeFailure += 1;
}

function computeStatus(entry, breakerEntry, providerConnected) {
  const now = Date.now();
  const timeSinceRequest = entry.lastRequestAt ? now - entry.lastRequestAt : Infinity;
  const timeSinceFailure = entry.lastFailureAt ? now - entry.lastFailureAt : Infinity;

  // If the provider is disconnected -> return DOWN.
  if (providerConnected === false) {
    return { status: STATUS.DOWN, reason: 'Nhà cung cấp mất kết nối' };
  }

  // If a real request failed recently, return DOWN with that failure reason.
  if (entry.lastRequestOk === false && timeSinceRequest < sc().degradedWindowMs) {
    return { status: STATUS.DOWN, reason: entry.lastRequestReason || 'Request gần nhất thất bại' };
  }

  // If a real request succeeded recently, return AVAILABLE.
  if (entry.lastRequestOk === true && timeSinceRequest < sc().recentSuccessWindowMs) {
    return { status: STATUS.AVAILABLE, reason: null };
  }

  // If no probe has occurred yet, return UNKNOWN.
  if (!entry.lastProbeAt) {
    return { status: STATUS.UNKNOWN, reason: null };
  }

  // If a breaker is open, use breaker status.
  if (breakerEntry && breakerEntry.openUntil > Date.now()) {
    const reason = breakerEntry.reason || 'provider_error';
    if (reason === 'auth_billing' || reason === 'quota_exhausted') {
      return { status: STATUS.DOWN, reason: REASON_LABELS[reason] };
    }
    if (reason === 'rate_limit') {
      return { status: STATUS.OVERLOADED, reason: 'Quá tải yêu cầu' };
    }
    if (reason === 'provider_unavailable') {
      return { status: STATUS.OVERLOADED, reason: 'Nhà cung cấp tạm thời không khả dụng' };
    }
    if (reason === 'timeout') {
      return { status: STATUS.DEGRADED, reason: 'Hết thời gian phản hồi' };
    }
    return { status: STATUS.DOWN, reason: REASON_LABELS[reason] || 'Lỗi nhà cung cấp' };
  }

  if (entry.lastProbeOk === false) {
    const probeTimeSinceFailure = entry.lastProbeFailureAt ? now - entry.lastProbeFailureAt : Infinity;
    if (probeTimeSinceFailure < sc().recoveryWindowMs) {
      return { status: STATUS.DOWN, reason: entry.lastProbeReason || 'Probe gần nhất thất bại' };
    }
  }

  // If the model is recovering from a recent failure (real or probe), check the confidence threshold:
  const effectiveTimeSinceFailure = entry.lastFailureAt ? timeSinceFailure
    : (entry.lastProbeFailureAt ? (now - entry.lastProbeFailureAt) : Infinity);
  if (effectiveTimeSinceFailure < sc().recoveryWindowMs) {
    if (entry.consecutiveProbeSuccess < sc().probeConfidenceThreshold) {
      return { status: STATUS.DEGRADED, reason: 'Đang xác nhận phục hồi' };
    }
    return { status: STATUS.AVAILABLE, reason: null };
  }

  // If there is no recent failure (it has been more than 5 minutes or lastFailureAt is null), then even a single success (consecutiveProbeSuccess >= 1) should immediately make the model AVAILABLE.
  if (entry.consecutiveProbeSuccess >= 1) {
    return { status: STATUS.AVAILABLE, reason: null };
  }

  // If the latest probe failed but recovery window expired, stay DOWN.
  // Don't auto-recover — wait for an actual probe success.
  if (entry.lastProbeOk === false) {
    return { status: STATUS.DOWN, reason: entry.lastProbeReason || 'Provider không khả dụng' };
  }

  // Probe has run before (lastProbeAt is set) but consecutiveProbeSuccess is 0.
  // Could be caused by a real request failure resetting the counter.
  if (entry.lastProbeAt) {
    return { status: STATUS.DEGRADED, reason: 'Kết nối không ổn định' };
  }

  return { status: STATUS.UNKNOWN, reason: null };
}

function getStatus(alias) {
  if (!initialized && registry.getPublicModels) {
    initialize(registry.getPublicModels());
  }
  const entry = getEntry(alias);
  const resolved = registry.resolveModel ? registry.resolveModel(alias) : null;
  if (resolved) {
    entry.candidateCount = (resolved.candidates || []).length;
    entry.provider = resolved.providerID || entry.provider;
  }
  const breakerEntry = breakerChecker ? breakerChecker(alias) : null;
  const providerConnected = providerChecker ? providerChecker(entry.provider) : null;
  return {
    alias: entry.alias,
    ...computeStatus(entry, breakerEntry, providerConnected),
    provider: entry.provider,
    candidateCount: entry.candidateCount,
    lastChecked: entry.lastChecked,
    lastProbeAt: entry.lastProbeAt,
    lastProbeOk: entry.lastProbeOk,
    lastProbeReason: entry.lastProbeReason,
    consecutiveProbeSuccess: entry.consecutiveProbeSuccess,
    consecutiveProbeFailure: entry.consecutiveProbeFailure,
    lastRequestAt: entry.lastRequestAt,
    lastRequestOk: entry.lastRequestOk,
    lastRequestReason: entry.lastRequestReason,
    lastSuccessAt: entry.lastSuccessAt,
    lastFailureAt: entry.lastFailureAt,
    successCount: entry.successCount,
    failureCount: entry.failureCount,
    successRate: computeSuccessRate(entry.successCount, entry.failureCount),
    totalTokens: entry.totalInputTokens + entry.totalOutputTokens,
    peakRps: entry.peakRps,
    recentHourCount: entry.recentHourCount,
    recentDayCount: entry.recentDayCount,
    trendDirection: entry.trendDirection,
    popularityScore: entry.popularityScore,
  };
}

function getAllStatus() {
  if (!initialized && registry.getPublicModels) {
    initialize(registry.getPublicModels());
  }
  const families = registry.getPublicModels ? registry.getPublicModels() : [];
  for (const family of families) {
    if (!statusMap.has(family.id)) {
      statusMap.set(family.id, createEntry(family.id, family.providerID || 'unknown'));
    }
  }

  const result = [];
  for (const [alias, entry] of statusMap) {
    const resolved = registry.resolveModel ? registry.resolveModel(alias) : null;
    if (resolved) {
      entry.candidateCount = (resolved.candidates || []).length;
      entry.provider = resolved.providerID || entry.provider;
    }
    const breakerEntry = breakerChecker ? breakerChecker(alias) : null;
    const providerConnected = providerChecker ? providerChecker(entry.provider) : null;
    const status = computeStatus(entry, breakerEntry, providerConnected);
    result.push({
      alias: entry.alias,
      ...status,
      provider: entry.provider,
      candidateCount: entry.candidateCount,
      lastChecked: entry.lastChecked,
      lastProbeAt: entry.lastProbeAt,
      lastProbeOk: entry.lastProbeOk,
      lastProbeReason: entry.lastProbeReason,
      consecutiveProbeSuccess: entry.consecutiveProbeSuccess,
      consecutiveProbeFailure: entry.consecutiveProbeFailure,
      lastRequestAt: entry.lastRequestAt,
      lastRequestOk: entry.lastRequestOk,
      lastRequestReason: entry.lastRequestReason,
      lastSuccessAt: entry.lastSuccessAt,
      lastFailureAt: entry.lastFailureAt,
      lastFailureReason: entry.lastFailureReason,
      successCount: entry.successCount,
      failureCount: entry.failureCount,
      successRate: computeSuccessRate(entry.successCount, entry.failureCount),
      totalTokens: entry.totalInputTokens + entry.totalOutputTokens,
      peakRps: entry.peakRps,
      recentHourCount: entry.recentHourCount,
      recentDayCount: entry.recentDayCount,
      trendDirection: entry.trendDirection,
      popularityScore: entry.popularityScore,
    });
  }
  return result;
}

function _reset() {
  statusMap.clear();
  initialized = false;
}

module.exports = {
  initialize,
  recordSuccess,
  recordFailure,
  recordProbeSuccess,
  recordProbeFailure,
  getStatus,
  getAllStatus,
  setBreakerChecker,
  setProviderChecker,
  STATUS,
  computeSuccessRate,
  loadFromDisk,
  _cleanupOldFiles,
  _reset,
};
