const configStore = require('./config-store');

const ipMap = new Map();
const globalStats = { totalBlocked: 0, byGroup: {} };
let cleanupTimer = null;

const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

function rl() { return configStore.getSection('rateLimit'); }

function getClientIp(req) {
  const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',').map(s => s.trim());
    let clientIp = ips[0];
    if (TRUSTED_PROXIES.has(remoteAddr)) {
      for (let i = ips.length - 1; i >= 0; i--) {
        if (!TRUSTED_PROXIES.has(ips[i])) {
          clientIp = ips[i];
          break;
        }
      }
    }
    return clientIp;
  }
  return remoteAddr;
}

function getEndpointGroup(url, method) {
  if ((url === '/v1/chat/completions' || url === '/v1/messages' || url === '/v1/responses' || url === '/api/chat') && method === 'POST') return 'chat';
  if (url.match(/^\/v1beta\/models\/[^:]+:(generateContent|streamGenerateContent)$/) && method === 'POST') return 'chat';
  if ((url === '/v1/models' || url === '/v1/models/status' || url.startsWith('/v1/catalog/models')) && method === 'GET') return 'models-read';
  if (url.startsWith('/dashboard/')) {
    if (url.startsWith('/dashboard/api/memories')) return 'memories';
    if (url === '/dashboard/api/login' && method === 'POST') return 'dashboard-login';
    if (url.startsWith('/dashboard/api/')) {
      if (method === 'GET') return 'dashboard-read';
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) return 'dashboard-write';
    }
    return null;
  }
  return null;
}

function checkRateLimit(ip, group) {
  const cfg = rl();
  const groupConfig = cfg[group];
  if (!groupConfig || !cfg.enabled || groupConfig.enabled === false) return { allowed: true, limit: 0, remaining: 0, resetAt: 0, retryAfterMs: 0 };

  const now = Date.now();
  if (!ipMap.has(ip)) ipMap.set(ip, {});
  const entries = ipMap.get(ip);
  if (!entries[group]) {
    entries[group] = { count: 0, resetAt: now + groupConfig.windowMs };
  }

  const entry = entries[group];
  if (now >= entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + groupConfig.windowMs;
  }

  entry.count++;

  if (entry.count > groupConfig.limit) {
    globalStats.totalBlocked++;
    globalStats.byGroup[group] = (globalStats.byGroup[group] || 0) + 1;
    return {
      allowed: false,
      limit: groupConfig.limit,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterMs: entry.resetAt - now,
    };
  }

  return {
    allowed: true,
    limit: groupConfig.limit,
    remaining: groupConfig.limit - entry.count,
    resetAt: entry.resetAt,
    retryAfterMs: 0,
  };
}

function cleanup() {
  const now = Date.now();
  for (const [ip, entries] of ipMap) {
    for (const [group, entry] of Object.entries(entries)) {
      if (now >= entry.resetAt) {
        delete entries[group];
      }
    }
    if (Object.keys(entries).length === 0) {
      ipMap.delete(ip);
    }
  }
  if (ipMap.size > 10000) {
    const allEntries = [...ipMap.entries()];
    const toRemove = allEntries.slice(0, allEntries.length - 10000);
    for (const [ipKey] of toRemove) ipMap.delete(ipKey);
  }
}

function start() {
  if (cleanupTimer) return;
  const interval = rl().cleanupIntervalMs || 300000;
  cleanupTimer = setInterval(cleanup, interval);
  cleanupTimer.unref();
}

function stop() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

function reset() {
  ipMap.clear();
  globalStats.totalBlocked = 0;
  for (const key of Object.keys(globalStats.byGroup)) delete globalStats.byGroup[key];
}

function getStats() {
  return {
    totalBlocked: globalStats.totalBlocked,
    byGroup: { ...globalStats.byGroup },
    activeIps: ipMap.size,
  };
}

module.exports = { getClientIp, getEndpointGroup, checkRateLimit, start, stop, reset, getStats };
