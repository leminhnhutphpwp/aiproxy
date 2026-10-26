const fs = require('fs');
const path = require('path');

const DIRECT_PROVIDERS_PATH = path.join(__dirname, '..', '..', 'config', 'direct-providers.json');

let cachedProviders = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000;

function readDirectProviders() {
  const now = Date.now();
  if (cachedProviders && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedProviders;
  }
  try {
    cachedProviders = JSON.parse(fs.readFileSync(DIRECT_PROVIDERS_PATH, 'utf8'));
    cacheTimestamp = now;
    return cachedProviders;
  } catch {
    return {};
  }
}

function invalidateCache() {
  cachedProviders = null;
  cacheTimestamp = 0;
}

function getDirectProviderConfig(providerID) {
  const providers = readDirectProviders();
  return providers[providerID] || null;
}

function resolveSecret(providerConfig) {
  if (!providerConfig) return { value: null, source: 'none' };
  if (Array.isArray(providerConfig.keys) && providerConfig.keys.length > 0) {
    const hasAny = providerConfig.keys.some(k => k.env && process.env[k.env]);
    return { value: null, source: hasAny ? 'env' : 'none' };
  }
  if (providerConfig.apiKeyEnv) {
    const envVal = process.env[providerConfig.apiKeyEnv];
    if (envVal) return { value: envVal, source: 'env' };
  }
  if (providerConfig.apiKey) {
    return { value: providerConfig.apiKey, source: 'inline' };
  }
  return { value: null, source: 'none' };
}

function resolveKeyPool(providerConfig) {
  if (!providerConfig) return [];

  if (Array.isArray(providerConfig.keys) && providerConfig.keys.length > 0) {
    return providerConfig.keys.map(k => {
      const envVal = k.env ? process.env[k.env] : null;
      return {
        id: k.env || k.apiKey || 'unknown',
        value: envVal || k.apiKey || null,
        source: envVal ? 'env' : (k.apiKey ? 'inline' : 'none'),
        weight: k.weight || 100,
        rpm: k.rpm || 500,
      };
    }).filter(k => k.value);
  }

  const single = resolveSecret(providerConfig);
  if (single.value) {
    return [{
      id: providerConfig.apiKeyEnv || 'single',
      value: single.value,
      source: single.source,
      weight: 100,
      rpm: 500,
    }];
  }

  return [];
}

function getProviderKeys(providerID) {
  const config = getDirectProviderConfig(providerID);
  return resolveKeyPool(config);
}

module.exports = {
  readDirectProviders,
  getDirectProviderConfig,
  resolveSecret,
  resolveKeyPool,
  getProviderKeys,
  invalidateCache,
};
