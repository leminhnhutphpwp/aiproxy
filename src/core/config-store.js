const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'dashboard-config.json');

const DEFAULTS = {
  healthCheck: {
    intervalMs: 60000,
    providerCooldownMs: 60000,
    probeTimeoutMs: 15000,
    sweepProbeTimeoutMs: 8000,
    probeCleanupTimeoutMs: 3000,
    interProbeDelayMs: 1000,
    sweepInterProbeDelayMs: 0,
    firstCheckDelayMs: 10000,
    probeMessage: 'Hi',
    probeMaxTokens: 10,
    probeStaleHealthyMs: 900000,
  },
  circuitBreaker: {
    threshold: 3,
    cooldownMs: 30000,
    requestTimeoutMs: 15000,
  },
  errorCooldowns: {
    authCooldownMs: 600000,
    quotaCooldownMs: 600000,
    rateLimitCooldownMs: 30000,
    timeoutCooldownMs: 15000,
    providerUnavailableCooldownMs: 30000,
  },
  keyPool: {
    selectionStrategy: 'weighted-least-connections',
    halfOpenMaxProbes: 1,
    halfOpenProbeSuccessThreshold: 3,
    halfOpenTrafficRampUpMs: 30000,
    defaultCooldownMs: 30000,
  },
  logging: {
    maxEntries: 1000,
    defaultLimit: 100,
  },
  auth: {
    sessionMaxAgeDefault: 86400,
    sessionMaxAgeRemember: 604800,
    sessionMaxAgeStandard: 3600,
  },
  infra: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    discoveryRefreshMs: 60000,
    staticCacheMaxAge: 86400,
    streamingChunkSize: 20,
  },
  statusCompute: {
    degradedWindowMs: 60000,
    recentSuccessWindowMs: 60000,
    probeConfidenceThreshold: 2,
    recoveryWindowMs: 300000,
  },
  policy: {
    defaultSystemPrompt: '',
    vendorPrompts: {},
  },
  memory: {
    enabled: true,
    extractionEnabled: true,
    defaultBudget: 500,
    maxBudget: 2000,
    maxContentLength: 10000,
    sanitizeInjection: true,
  },
  tokenOptimizer: {
    enabled: true,
    compressThreshold: 0.5,
    maxHistoryPairs: 3,
  },
  pricing: {
    inputPer1k: 0.00015,
    outputPer1k: 0.0006,
  },
  rateLimit: {
    enabled: true,
    chat: { enabled: true, limit: 120, windowMs: 60000 },
    'models-read': { enabled: true, limit: 120, windowMs: 60000 },
    'dashboard-login': { enabled: true, limit: 5, windowMs: 60000 },
    'dashboard-read': { enabled: true, limit: 120, windowMs: 60000 },
    'dashboard-write': { enabled: true, limit: 30, windowMs: 60000 },
    memories: { enabled: true, limit: 60, windowMs: 60000 },
    cleanupIntervalMs: 300000,
  },
  modelAliases: {
    'claude-sonnet-4-5': 'gpt-4o',
    'claude-sonnet-4-6': 'gpt-4o',
    'claude-opus-4-5': 'gpt-4o',
    'claude-opus-4-8': 'gpt-4o',
    'claude-haiku-4-5': 'gpt-4o-mini',
    'claude-3-5-sonnet': 'gpt-4o',
    'claude-3-5-haiku': 'gpt-4o-mini',
    'gemini-2.0-flash': 'gpt-4o',
    'gemini-2.0-flash-lite': 'gpt-4o-mini',
    'gemini-2.5-pro': 'gpt-4o',
    'gemini-2.5-flash': 'gpt-4o',
    'gemini-3.5-flash': 'gpt-4o',
  },
};

let config = null;

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function load() {
  try {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    const fileConfig = JSON.parse(content);
    config = deepMerge(DEFAULTS, fileConfig);
  } catch (e) {
    console.warn('[ConfigStore] Could not load dashboard-config.json, using defaults:', e.message);
    config = JSON.parse(JSON.stringify(DEFAULTS));
  }
  return config;
}

function get() {
  if (!config) load();
  return config;
}

function getSection(section) {
  return get()[section] || {};
}

function update(newConfig) {
  config = deepMerge(config, newConfig);
  save();
  return config;
}

function updateSection(section, sectionConfig) {
  if (!config) load();
  config[section] = deepMerge(config[section] || {}, sectionConfig);
  save();
  return config;
}

function save() {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('[ConfigStore] Failed to save config:', e.message);
  }
}

function reset() {
  config = JSON.parse(JSON.stringify(DEFAULTS));
  save();
  return config;
}

load();

module.exports = { get, getSection, update, updateSection, reset, load, DEFAULTS };
