const http = require('http');

const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL || 'http://127.0.0.1:3000';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || '';
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();
let lastCleanup = 0;

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60000) return;
  lastCleanup = now;
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

function isEnabled() {
  return !!INTERNAL_SECRET;
}

async function validateKey(apiKey) {
  if (!isEnabled()) {
    return { valid: false, error: 'API key auth not configured' };
  }
  cleanup();

  const cached = cache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const body = JSON.stringify({ key: apiKey });
    const result = await new Promise((resolve, reject) => {
      const url = new URL('/api/internal/validate-key', PORTAL_BASE_URL);
      const opts = {
        hostname: url.hostname,
        port: url.port || 3000,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Internal-Secret': INTERNAL_SECRET,
        },
        timeout: 3000,
      };
      const req = http.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error('Invalid JSON from validate-key')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('validate-key timeout')); });
      req.end(body);
    });

    cache.set(apiKey, {
      data: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  } catch (err) {
    console.error('[ApiKeyAuth] Portal unreachable:', err.message);
    return { valid: false, error: 'Auth service unavailable' };
  }
}

function invalidateCache(apiKey) {
  cache.delete(apiKey);
}

function clearCache() {
  cache.clear();
}

module.exports = { validateKey, invalidateCache, clearCache, isEnabled };
