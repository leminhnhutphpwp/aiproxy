const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const eqIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIndex).trim();
      const val = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    // .env file is optional
  }
}

loadEnvFile();

if (!process.env.DEMO_PROVIDER_BASE_URL || !process.env.DEMO_PROVIDER_API_KEY) {
  console.warn('[Config] No direct provider credentials found, only OpenCode pool available');
}

let publicModelsFile, providerPools;
try {
  publicModelsFile = require('../config/public-models.json');
} catch (e) {
  console.warn('[Config] No public-models.json found, model discovery will use empty config');
  publicModelsFile = null;
}
try {
  providerPools = require('../config/provider-pools.json');
} catch (e) {
  providerPools = {};
}

const config = {
  port: parseInt(process.env.PORT || '4097', 10),
  hostname: process.env.HOSTNAME || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  opencode: {
    url: process.env.OPENCODE_URL || 'http://127.0.0.1:4096',
    username: process.env.OPENCODE_USERNAME || '',
    password: process.env.OPENCODE_PASSWORD || '',
  },
  publicModels: (publicModelsFile && publicModelsFile.families) || {},
  discoveryRefreshMs: parseInt(process.env.DISCOVERY_REFRESH_MS || '60000', 10),
  providerPools: providerPools,
  dashboard: {
    user: process.env.DASHBOARD_USER || '',
    pass: process.env.DASHBOARD_PASS || '',
  },
  directProviders: {
    demo: {
      type: 'openai-compatible',
      baseUrl: process.env.DEMO_PROVIDER_BASE_URL || '',
      apiKey: process.env.DEMO_PROVIDER_API_KEY || '',
      defaultModelId: process.env.DEMO_PROVIDER_MODEL || 'gpt-4o-mini',
    },
  },
};

module.exports = config;
