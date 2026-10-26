const os = require('os');
const path = require('path');
const config = require('../config');

const OPENCODE_URL = config.opencode && config.opencode.url || 'http://127.0.0.1:4096';

// Optional external catalog directory (model metadata overrides + sync script).
// Leave CATALOG_ROOT unset to run without one; the related dashboard actions then no-op.
const CATALOG_ROOT = process.env.CATALOG_ROOT || path.join(__dirname, '..', '..', 'data', 'catalog');
const CATALOG_CONFIG_DIR = path.join(CATALOG_ROOT, 'config');
const CATALOG_SCRIPTS_DIR = path.join(CATALOG_ROOT, 'scripts');

const PATHS = {
  CATALOG_CONFIG_DIR,
  CATALOG_SCRIPTS_DIR,
  MODELS_GENERATED: path.join(CATALOG_CONFIG_DIR, 'models.generated.json'),
  MODELS_OVERRIDE: path.join(CATALOG_CONFIG_DIR, 'models.override.json'),
  SYNC_MODELS: path.join(CATALOG_SCRIPTS_DIR, 'sync-models.js'),
  OPENCODE_CONFIG: process.env.OPENCODE_CONFIG || path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc'),
  PUBLIC_MODELS: path.join(__dirname, '..', '..', 'config', 'public-models.json'),
  DIRECT_PROVIDERS: path.join(__dirname, '..', '..', 'config', 'direct-providers.json'),
};

const DEFAULT_SAFE_MESSAGE = 'Hệ thống gặp sự cố. Vui lòng thử lại sau.';
const ANTHROPIC_VERSION = '2023-06-01';
const CHUNK_SIZE = 20;

module.exports = {
  OPENCODE_URL,
  PATHS,
  DEFAULT_SAFE_MESSAGE,
  ANTHROPIC_VERSION,
  CHUNK_SIZE,
};
