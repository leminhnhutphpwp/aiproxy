const path = require('path');
const fs = require('fs');
const configStore = require('./config-store');
const writeBuffer = require('./write-buffer');
function lc() { return configStore.getSection('logging'); }

const LOGS_DIR = path.join(__dirname, '..', '..', 'config', 'logs');

const fileCache = new Map();

function getCachedFile(fp) {
  try {
    const cached = fileCache.get(fp);
    const mtime = fs.statSync(fp).mtimeMs;
    if (cached && cached.mtime === mtime) return cached.entries;
    const content = fs.readFileSync(fp, 'utf8');
    const entries = [];
    for (const line of content.trim().split('\n').filter(Boolean)) {
      try { entries.push(JSON.parse(line)); } catch (e) { /* skip */ }
    }
    fileCache.set(fp, { entries, mtime });
    return entries;
  } catch (e) { return []; }
}

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function logFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, date + '.jsonl');
}

function saveLogEntry(entry) {
  try {
    if (process.env.AIPROXY_TEST_MODE === 'true') return;
    ensureLogsDir();
    const line = JSON.stringify(entry) + '\n';
    writeBuffer.append(logFilePath(), line);
  } catch (e) {
    // silently fail
  }
}

function loadFromDisk() {
  try {
    ensureLogsDir();
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .slice(-7);

    for (const file of files) {
      const filepath = path.join(LOGS_DIR, file);
      if (!fs.existsSync(filepath)) continue;
      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.statusCode !== undefined) {
            if (entry.statusCode >= 200 && entry.statusCode < 400) totalSuccess++;
            else totalFailure++;
            totalRequests++;
            logs.push(entry);
          }
        } catch (e) {
          // skip malformed
        }
      }
    }

    // Trim to maxEntries
    const maxEntries = lc().maxEntries || 200;
    if (logs.length > maxEntries) {
      logs.splice(0, logs.length - maxEntries);
    }
  } catch (e) {
    // silently fail — no data is OK
  }
}

const logs = [];
let totalRequests = 0;
let totalSuccess = 0;
let totalFailure = 0;

const violationCounters = new Map();

function recordRequest({ method, path, model, provider, alias, status, latencyMs, error, inputTokens, outputTokens, userId, userEmail, violationType, blockedPattern }) {
  totalRequests++;
  if (status >= 200 && status < 400) {
    totalSuccess++;
  } else {
    totalFailure++;
  }
  const entry = {
    ts: new Date().toISOString(),
    method,
    path,
    model,
    provider,
    alias: alias || null,
    statusCode: status,
    latencyMs,
    error: error || null,
    inputTokens: inputTokens || null,
    outputTokens: outputTokens || null,
    userId: userId || null,
    userEmail: userEmail || null,
    violationType: violationType || null,
    blockedPattern: blockedPattern || null,
  };
  logs.push(entry);
  saveLogEntry(entry);
  const maxEntries = lc().maxEntries || 200;
  if (logs.length > maxEntries) {
    logs.shift();
  }
}

const VIOLATION_RATE_LIMIT = 10;
const VIOLATION_WINDOW_MS = 3600000;

function checkViolationRateLimit(userId) {
  if (!userId) return false;
  const now = Date.now();
  const key = String(userId);
  const window = violationCounters.get(key) || { count: 0, windowStart: now, blockedUntil: 0 };
  if (window.blockedUntil > now) return true;
  if (now - window.windowStart > VIOLATION_WINDOW_MS) {
    window.count = 0;
    window.windowStart = now;
    violationCounters.set(key, window);
  }
  return false;
}

function recordViolation(userId) {
  if (!userId) return;
  const now = Date.now();
  const key = String(userId);
  const window = violationCounters.get(key) || { count: 0, windowStart: now, blockedUntil: 0 };
  if (now - window.windowStart > VIOLATION_WINDOW_MS) {
    window.count = 0;
    window.windowStart = now;
  }
  window.count++;
  if (window.count > VIOLATION_RATE_LIMIT) {
    window.blockedUntil = now + 3600000;
  }
  violationCounters.set(key, window);
}

function getHistory({ days = 7, model, statusMin, statusMax, status, user, violationType, limit = 100, offset = 0 } = {}) {
  try {
    ensureLogsDir();
    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .slice(-days);
    const all = [];
    for (const file of files) {
      const fp = path.join(LOGS_DIR, file);
      const entries = getCachedFile(fp);
      for (const entry of entries) {
        if (cutoff && entry.ts && entry.ts < cutoff) continue;
        if (model && entry.alias !== model && entry.model !== model) continue;
        if (statusMin != null && entry.statusCode < statusMin) continue;
        if (statusMax != null && entry.statusCode > statusMax) continue;
        if (status && entry.statusCode !== parseInt(status, 10)) continue;
        if (violationType && entry.violationType !== violationType) continue;
        if (user) {
          const match = entry.userEmail === user || entry.userId === user || (entry.userEmail && entry.userEmail.includes(user));
          if (!match) continue;
        }
        all.push(entry);
      }
    }
    const total = all.length;
    return { entries: all.slice(offset, offset + limit), total };
  } catch (e) { return { entries: [], total: 0 }; }
}

function getViolationStats({ hours = 24 } = {}) {
  try {
    ensureLogsDir();
    const cutoff = Date.now() - hours * 3600000;
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .slice(-Math.ceil(hours / 24));
    const byType = {};
    const byUser = {};
    const byPattern = {};
    let total = 0;
    for (const file of files) {
      const fp = path.join(LOGS_DIR, file);
      for (const entry of getCachedFile(fp)) {
        if (!entry.violationType) continue;
        const ts = new Date(entry.ts).getTime();
        if (isNaN(ts) || ts < cutoff) continue;
        total++;
        byType[entry.violationType] = (byType[entry.violationType] || 0) + 1;
        byUser[entry.userId || 'anonymous'] = (byUser[entry.userId || 'anonymous'] || 0) + 1;
        if (entry.blockedPattern) {
          byPattern[entry.blockedPattern] = (byPattern[entry.blockedPattern] || 0) + 1;
        }
      }
    }
    return { total, byType, byUser, byPattern, hours };
  } catch (e) { return { total: 0, byType: {}, byUser: {}, byPattern: {}, hours }; }
}

function getLogs({ limit, offset = 0, filter = {} } = {}) {
  if (limit === undefined) limit = lc().defaultLimit;
  let filtered = [...logs];
  if (filter.model) {
    filtered = filtered.filter(e => e.alias === filter.model || e.model === filter.model);
  }
  if (filter.statusMin) {
    filtered = filtered.filter(e => e.statusCode >= filter.statusMin);
  } else if (filter.status) {
    const statusCode = parseInt(filter.status, 10);
    if (!isNaN(statusCode)) {
      filtered = filtered.filter(e => e.statusCode === statusCode);
    }
  }
  const total = filtered.length;
  // Newest first
  filtered.reverse();
  const entries = filtered.slice(offset, offset + limit);
  return { entries, total };
}

function getStats() {
  return {
    totalRequests,
    totalSuccess,
    totalFailure,
    successRate: totalRequests > 0 ? Math.round((totalSuccess / totalRequests) * 1000) / 10 : null,
  };
}

function cleanupOldFiles() {
  try {
    ensureLogsDir();
    const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl'));
    const cutoff = Date.now() - 30 * 86400000;
    for (const file of files) {
      const fp = path.join(LOGS_DIR, file);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch (e) { /* silently fail */ }
}

function _reset() {
  logs.length = 0;
  totalRequests = 0;
  totalSuccess = 0;
  totalFailure = 0;
}

module.exports = { recordRequest, getLogs, getStats, getHistory, loadFromDisk, cleanupOldFiles, getViolationStats, checkViolationRateLimit, recordViolation, _reset };
