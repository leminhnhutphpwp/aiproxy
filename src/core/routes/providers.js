const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { execFile } = require('child_process');
const registry = require('../model-registry');
const modelStatus = require('../model-status');
const { readDirectProviders, resolveSecret } = require('../direct-provider-config');

const { OPENCODE_URL, PATHS } = require('../constants');
const OPENCODE_CONFIG_PATH = PATHS.OPENCODE_CONFIG;

function writeDirectProviders(data) {
  const DIRECT_PROVIDERS_PATH = path.join(__dirname, '..', '..', '..', 'config', 'direct-providers.json');
  const dir = path.dirname(DIRECT_PROVIDERS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DIRECT_PROVIDERS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function redactSecrets(content) {
  if (typeof content !== 'string') return content;
  return content
    .replace(/("apiKey"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/("api_key"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/("password"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/("secret"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/("token"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/("bearer"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');
}

function cleanJSONC(content) {
  let out = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i+1];
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        out += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (char === '"' && content[i-1] !== '\\') {
        inString = false;
      }
      out += char;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    out += char;
  }
  // Trim trailing commas inside objects/arrays
  return out.replace(/,\s*(?=[}\]])/g, '');
}

function readOpenCodeConfig() {
  try {
    const raw = fs.readFileSync(OPENCODE_CONFIG_PATH, 'utf8');
    return { raw, parsed: JSON.parse(cleanJSONC(raw)) };
  } catch (e) {
    return { raw: '', parsed: null, error: e.message };
  }
}

function validateAndFixJSONC(content) {
  try {
    JSON.parse(cleanJSONC(content));
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

async function fetchOpenCodeProviderData() {
  const url = new URL('/provider', OPENCODE_URL);
  const lib = url.protocol === 'https:' ? https : http;
  const config = require('../../config');
  const auth = Buffer.from(config.opencode.username + ':' + config.opencode.password).toString('base64');

  return new Promise((resolve) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + auth },
    }, (res2) => {
      let data = '';
      res2.on('data', chunk => data += chunk);
      res2.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log('[Providers] OpenCode fetch OK: ' + (parsed.all || []).length + ' total, ' + (parsed.connected || []).length + ' connected');
          resolve(parsed);
        } catch (e) {
          console.error('[Providers] OpenCode fetch parse error:', data.slice(0, 200));
          resolve(null);
        }
      });
    });
    req.on('error', (err) => {
      console.error('[Providers] OpenCode fetch error:', err.message);
      resolve(null);
    });
    req.setTimeout(5000, () => { console.error('[Providers] OpenCode fetch timeout'); req.destroy(); resolve(null); });
    req.end();
  });
}

function isSafeUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return false;
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false;
    if (hostname.startsWith('172.') && /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (hostname === '169.254.169.254') return false;
    if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.lan')) return false;
    return true;
  } catch {
    return false;
  }
}

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/providers', (req, res) => {
    const providers = registry.getConnectedProviders() || [];
    const allStatus = modelStatus.getAllStatus();
    const result = providers.map(id => {
      const modelCount = allStatus.filter(s => s.provider === id).length;
      return { id, connected: registry.isProviderConnected(id), modelCount };
    });
    dashboardApp.sendJson(res, 200, result);
  });

  dashboardApp.addRoute('GET', '/dashboard/api/providers/all', async (req, res) => {
    const providerData = await fetchOpenCodeProviderData();
    console.log('[Providers] fetchOpenCodeProviderData result:', providerData ? 'ok (' + (providerData.all || []).length + ' providers)' : 'null');
    const connectedSet = new Set((providerData && providerData.connected) || []);
    const allProviders = (providerData && providerData.all) || [];

    const opencodeList = allProviders.filter(p => connectedSet.has(p.id)).map(p => {
      const modelKeys = Object.keys(p.models || {});
      console.log('[Providers] Provider ' + p.id + ': ' + modelKeys.length + ' model keys, first key:', modelKeys[0], 'value:', JSON.stringify(p.models[modelKeys[0]]).slice(0, 100));
      const models = modelKeys.map(mid => ({ id: mid, name: (p.models[mid] && p.models[mid].name) || mid }));
      return {
        id: p.id,
        type: 'opencode',
        source: p.source || 'api',
        env: p.env || [],
        connected: true,
        baseURL: (p.options && p.options.baseURL) || null,
        modelCount: models.length,
        models,
      };
    });

    const directData = readDirectProviders();
    const directList = Object.entries(directData).map(([id, cfg]) => {
      const secret = resolveSecret(cfg);
      const models = Object.keys(cfg.models || {}).map(mid => ({ id: mid, name: (cfg.models[mid] && cfg.models[mid].name) || mid }));
      const keyEnvs = Array.isArray(cfg.keys) ? cfg.keys.map(k => k.env).filter(Boolean) : (cfg.apiKeyEnv ? [cfg.apiKeyEnv] : []);
      return {
        id,
        name: cfg.name || id,
        type: 'direct',
        baseURL: cfg.baseURL || '',
        connected: true,
        modelCount: models.length,
        models,
        hasApiKey: secret.value !== null,
        authSource: secret.source,
        apiKeyEnv: cfg.apiKeyEnv || null,
        keys: Array.isArray(cfg.keys) ? cfg.keys : null
      };
    });

    dashboardApp.sendJson(res, 200, { opencode: opencodeList, direct: directList });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/providers/opencode', (req, res) => {
    const opcProviders = registry.getConnectedProviders() || [];
    const allStatus = modelStatus.getAllStatus();
    const result = opcProviders.map(id => {
      const models = allStatus.filter(s => s.provider === id).map(s => ({ id: s.id, status: s.status }));
      return { id, type: 'opencode', connected: registry.isProviderConnected(id), modelCount: models.length, models };
    });
    dashboardApp.sendJson(res, 200, result);
  });

  dashboardApp.addRoute('GET', '/dashboard/api/providers/direct', (req, res) => {
    const data = readDirectProviders();
    const result = Object.entries(data).map(([id, cfg]) => {
      const secret = resolveSecret(cfg);
      return { id, name: cfg.name || id, baseURL: cfg.baseURL || '', connected: true,
        hasApiKey: secret.value !== null, authSource: secret.source, apiKeyEnv: cfg.apiKeyEnv || null,
        modelCount: Object.keys(cfg.models || {}).length };
    });
    dashboardApp.sendJson(res, 200, result);
  });

  dashboardApp.addRoute('POST', '/dashboard/api/providers/direct', (req, res) => {
    const { id, name, baseURL, apiKey, apiKeyEnv } = req.body || {};
    if (!id || !baseURL) { dashboardApp.sendError(res, 400, 'Provider ID and Base URL are required'); return; }
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) { dashboardApp.sendError(res, 400, 'Provider ID must start with a letter and contain only lowercase, numbers, hyphens, underscores'); return; }

    const data = readDirectProviders();
    if (data[id]) { dashboardApp.sendError(res, 409, 'Provider "' + id + '" already exists'); return; }

    const entry = { name: name || id, baseURL, models: {} };
    const trimmedEnv = apiKeyEnv ? apiKeyEnv.trim() : '';
    if (trimmedEnv !== '') {
      entry.apiKeyEnv = trimmedEnv;
    } else if (apiKey) {
      entry.apiKey = apiKey;
    }

    data[id] = entry;
    writeDirectProviders(data);
    console.log('[Providers] Added direct provider: ' + id);
    const secret = resolveSecret(entry);
    const response = { ok: true, id, authSource: secret.source };
    if (secret.source === 'inline') response.deprecationWarning = 'Inline apiKey is deprecated. Use apiKeyEnv for better security.';
    dashboardApp.sendJson(res, 200, response);
  });

  dashboardApp.addRoute('PUT', '/dashboard/api/providers/direct/:id', (req, res) => {
    const oldId = req.params.id;
    const { id, name, baseURL, apiKey, apiKeyEnv } = req.body || {};
    if (!baseURL) { dashboardApp.sendError(res, 400, 'Base URL is required'); return; }

    const data = readDirectProviders();
    if (!data[oldId]) { dashboardApp.sendError(res, 404, 'Provider "' + oldId + '" not found'); return; }

    const newId = id || oldId;
    if (newId !== oldId && data[newId]) { dashboardApp.sendError(res, 409, 'Provider "' + newId + '" already exists'); return; }

    const models = data[oldId].models || {};
    const oldEntry = data[oldId];
    if (oldId !== newId) delete data[oldId];

    const entry = {
      name: name || oldEntry?.name || newId,
      baseURL,
      models,
    };

    const trimmedEnv = apiKeyEnv ? apiKeyEnv.trim() : '';
    if (trimmedEnv !== '') {
      entry.apiKeyEnv = trimmedEnv;
    } else if (apiKey !== undefined && apiKey !== '********') {
      entry.apiKey = apiKey;
    } else {
      if (oldEntry.apiKeyEnv) {
        entry.apiKeyEnv = oldEntry.apiKeyEnv;
      } else if (oldEntry.apiKey) {
        entry.apiKey = oldEntry.apiKey;
      }
    }

    data[newId] = entry;
    writeDirectProviders(data);
    console.log('[Providers] Updated direct provider: ' + oldId + (oldId !== newId ? ' -> ' + newId : ''));

    const secret = resolveSecret(entry);
    const response = { ok: true, id: newId, authSource: secret.source };
    if (secret.source === 'inline') response.deprecationWarning = 'Inline apiKey is deprecated. Use apiKeyEnv for better security.';
    dashboardApp.sendJson(res, 200, response);
  });

  dashboardApp.addRoute('DELETE', '/dashboard/api/providers/direct/:id', (req, res) => {
    const id = req.params.id;
    const data = readDirectProviders();
    if (!data[id]) { dashboardApp.sendError(res, 404, 'Provider "' + id + '" not found'); return; }
    delete data[id];
    writeDirectProviders(data);
    console.log('[Providers] Deleted direct provider: ' + id);
    dashboardApp.sendJson(res, 200, { ok: true });
  });

  // Auto-detect API format: tries multiple API formats and detects the correct one
  function detectApiFormat(baseURL, apiKey, timeoutMs = 10000) {
    const formats = [
      { name: 'openai', path: '/v1/chat/completions', body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }) },
      { name: 'openai2', path: '/v1/chat/completions', body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }) },
      { name: 'anthropic', path: '/v1/messages', body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }), headers: { 'anthropic-version': '2023-06-01' } },
      { name: 'responses', path: '/v1/responses', body: JSON.stringify({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 }) },
    ];

    return Promise.any(formats.map(fmt => new Promise((resolve, reject) => {
      try {
        const url = new URL(fmt.path, baseURL);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        const hdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(fmt.body) };
        if (fmt.headers) Object.assign(hdrs, fmt.headers);

        const timer = setTimeout(() => { r2.destroy(); reject(new Error('timeout')); }, timeoutMs);
        const r2 = lib.request({ hostname: url.hostname, port: url.port || (isHttps ? 443 : 80), path: url.pathname, method: 'POST', headers: hdrs }, (res2) => {
          clearTimeout(timer);
          let data = '';
          res2.on('data', c => data += c);
          res2.on('end', () => {
            if (res2.statusCode >= 400) return reject(new Error('HTTP ' + res2.statusCode));
            resolve({ format: fmt.name, path: fmt.path, statusCode: res2.statusCode, data: data });
          });
        });
        r2.on('error', (e) => { clearTimeout(timer); reject(e); });
        r2.write(fmt.body);
        r2.end();
      } catch (e) { reject(e); }
    }))).then(function(r) { r.ok = true; return r; }).catch(function(e) { return { ok: false, error: e.message }; });
  }

  // Fetch available models from a provider API
  function fetchProviderModels(baseURL, apiKey, format, timeoutMs = 10000) {
    const endpoints = {
      openai: { path: '/v1/models', headers: {} },
      anthropic: { path: '/v1/models', headers: { 'anthropic-version': '2023-06-01' } },
    };
    const ep = endpoints[format] || endpoints.openai;
    return new Promise((resolve) => {
      try {
        const url = new URL(ep.path, baseURL);
        const isHttps = url.protocol === 'https:';
        const lib = isHttps ? https : http;
        const timer = setTimeout(() => { req.destroy(); resolve([]); }, timeoutMs);
        const req = lib.get({ hostname: url.hostname, port: url.port || (isHttps ? 443 : 80), path: url.pathname, method: 'GET', headers: { 'Authorization': 'Bearer ' + apiKey, ...ep.headers } }, (res) => {
          clearTimeout(timer);
          let data = '';
          res.on('data', c => data += c);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const models = format === 'anthropic'
                ? (parsed.data || []).map(m => ({ id: m.id, name: m.display_name || m.id }))
                : (parsed.data || []).map(m => ({ id: m.id, name: m.id }));
              resolve(models);
            } catch { resolve([]); }
          });
        });
        req.on('error', () => { clearTimeout(timer); resolve([]); });
        req.end();
      } catch { resolve([]); }
    });
  }

  dashboardApp.addRoute('POST', '/dashboard/api/providers/auto-detect', async (req, res) => {
    const { baseURL, apiKey, apiKeyEnv } = req.body || {};
    if (!baseURL) { dashboardApp.sendError(res, 400, 'Base URL is required'); return; }
    if (!isSafeUrl(baseURL)) { dashboardApp.sendError(res, 400, 'Invalid base URL'); return; }

    const key = apiKey || (apiKeyEnv ? process.env[apiKeyEnv] : '') || '';
    if (!key) { dashboardApp.sendError(res, 400, 'API key is required (provide directly or via env var)'); return; }

    const detection = await detectApiFormat(baseURL, key);
    if (!detection.ok) { dashboardApp.sendJson(res, 200, { ok: false, error: 'Could not connect: ' + detection.error }); return; }

    const models = await fetchProviderModels(baseURL, key, detection.format);
    dashboardApp.sendJson(res, 200, { ok: true, format: detection.format, path: detection.path, models, modelCount: models.length });
  });

  // Import a provider with auto-detected format + models + chain update
  dashboardApp.addRoute('POST', '/dashboard/api/providers/import', (req, res) => {
    const { id, name, baseURL, apiKey, apiKeyEnv, format, path, models, addToChain } = req.body || {};
    if (!id || !baseURL) { dashboardApp.sendError(res, 400, 'Provider ID and Base URL are required'); return; }
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) { dashboardApp.sendError(res, 400, 'Provider ID must start with a letter and contain only lowercase, numbers, hyphens, underscores'); return; }
    if (!format) { dashboardApp.sendError(res, 400, 'API format is required (run auto-detect first)'); return; }

    const data = readDirectProviders();
    if (data[id]) { dashboardApp.sendError(res, 409, 'Provider "' + id + '" already exists'); return; }

    // Build provider entry
    const entry = {
      name: name || id,
      baseURL,
      models: {},
    };
    if (path) entry.path = path;
    if (apiKey && apiKey.trim()) {
      entry.apiKey = apiKey.trim();
    } else {
      entry.apiKeyEnv = (apiKeyEnv && apiKeyEnv.trim()) || (id.toUpperCase() + '_API_KEY');
    }

    // Add models
    if (Array.isArray(models)) {
      for (const m of models) {
        if (m.id) entry.models[m.id] = { name: m.name || m.id };
      }
    }

    data[id] = entry;
    writeDirectProviders(data);
    console.log('[Providers] Imported provider: ' + id + ' (' + Object.keys(entry.models).length + ' models, format: ' + format + ')');

    // Optionally update chains in public-models.json
    let chainUpdated = false;
    if (addToChain && Array.isArray(models) && models.length > 0) {
      try {
        const MODELS_PATH = path.join(__dirname, '..', '..', '..', 'config', 'public-models.json');
        const raw = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
        for (const m of models) {
          if (!m.id) continue;
          for (const [alias, family] of Object.entries(raw.families || {})) {
            if (!family.enabled || family.show === false) continue;
            if (alias !== m.id && !family.matchModels?.includes(m.id) && !family.matchFamily?.includes(m.id)) continue;
            if (!family.chain) family.chain = [];
            if (!family.chain.some(c => c.provider === id)) {
              family.chain.unshift({ provider: id, model: m.id });
              chainUpdated = true;
            }
          }
        }
        if (chainUpdated) {
          fs.writeFileSync(MODELS_PATH, JSON.stringify(raw, null, 2), 'utf8');
          console.log('[Providers] Chains updated for provider: ' + id);
        }
      } catch (e) {
        console.error('[Providers] Chain update error:', e.message);
      }
    }

    dashboardApp.sendJson(res, 200, { ok: true, id, chainUpdated, format, modelCount: Object.keys(entry.models).length });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/providers/direct/:id/test', (req, res) => {
    const id = req.params.id;
    const data = readDirectProviders();
    const cfg = data[id];
    if (!cfg) { dashboardApp.sendError(res, 404, 'Provider "' + id + '" not found'); return; }

    const secret = resolveSecret(cfg);
    const baseURL = cfg.baseURL;
    if (!isSafeUrl(baseURL)) {
      dashboardApp.sendError(res, 400, 'Invalid base URL: must be a public HTTP/HTTPS URL');
      return;
    }
    const testModel = Object.keys(cfg.models || {})[0] || 'gpt-4o-mini';
    const testPath = cfg.path || '/v1/chat/completions';
    const url = new URL(testPath, baseURL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const timeoutMs = 10000;

    const body = JSON.stringify({ model: testModel, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 1 });

    const testHeaders = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (secret.value || ''),
      'Content-Length': Buffer.byteLength(body),
    };
    if (cfg.headers) {
      for (const [k, v] of Object.entries(cfg.headers)) {
        testHeaders[k] = v;
      }
    }

    const reqTimeout = setTimeout(() => {
      req2.destroy();
      dashboardApp.sendJson(res, 200, { ok: false, error: 'Connection timeout (' + timeoutMs + 'ms)' });
    }, timeoutMs);

    const req2 = lib.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers: testHeaders,
    }, (res2) => {
      clearTimeout(reqTimeout);
      let data2 = '';
      res2.on('data', chunk => data2 += chunk);
      res2.on('end', () => {
        if (res2.statusCode >= 400) {
          dashboardApp.sendJson(res, 200, { ok: false, error: 'HTTP ' + res2.statusCode + ': ' + data2.slice(0, 200) });
          return;
        }
        try {
          JSON.parse(data2);
          dashboardApp.sendJson(res, 200, { ok: true, model: testModel, statusCode: res2.statusCode });
        } catch (e) {
          dashboardApp.sendJson(res, 200, { ok: false, error: 'Invalid JSON response' });
        }
      });
    });
    req2.on('error', (err) => {
      clearTimeout(reqTimeout);
      dashboardApp.sendJson(res, 200, { ok: false, error: err.message });
    });
    req2.write(body);
    req2.end();
  });

  dashboardApp.addRoute('POST', '/dashboard/api/providers/direct/:id/models', (req, res) => {
    const id = req.params.id;
    const { modelId, name } = req.body || {};
    if (!modelId) { dashboardApp.sendError(res, 400, 'Model ID is required'); return; }

    const data = readDirectProviders();
    if (!data[id]) { dashboardApp.sendError(res, 404, 'Provider "' + id + '" not found'); return; }
    if (!data[id].models) data[id].models = {};
    if (data[id].models[modelId]) { dashboardApp.sendError(res, 409, 'Model "' + modelId + '" already exists'); return; }

    data[id].models[modelId] = { name: name || modelId };
    writeDirectProviders(data);
    dashboardApp.sendJson(res, 200, { ok: true, modelId });
  });

  dashboardApp.addRoute('DELETE', '/dashboard/api/providers/direct/:id/models/:modelId', (req, res) => {
    const id = req.params.id;
    const modelId = req.params.modelId;
    const data = readDirectProviders();
    if (!data[id]) { dashboardApp.sendError(res, 404, 'Provider "' + id + '" not found'); return; }
    if (!data[id].models || !data[id].models[modelId]) { dashboardApp.sendError(res, 404, 'Model "' + modelId + '" not found'); return; }

    delete data[id].models[modelId];
    writeDirectProviders(data);
    dashboardApp.sendJson(res, 200, { ok: true });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/providers/:id/keys', (req, res) => {
    const { id } = req.params;
    const { env, weight = 100, rpm = 500 } = req.body || {};
    
    if (!env || typeof env !== 'string' || !env.trim()) {
      dashboardApp.sendError(res, 400, 'Key env name is required');
      return;
    }
    
    const weightNum = parseInt(weight, 10);
    const rpmNum = parseInt(rpm, 10);
    if (isNaN(weightNum) || weightNum <= 0 || weightNum > 1000) {
      dashboardApp.sendError(res, 400, 'Weight must be a number between 1 and 1000');
      return;
    }
    if (isNaN(rpmNum) || rpmNum <= 0 || rpmNum > 10000) {
      dashboardApp.sendError(res, 400, 'RPM must be a number between 1 and 10000');
      return;
    }
    
    const data = readDirectProviders();
    if (!data[id]) {
      dashboardApp.sendError(res, 404, 'Provider "' + id + '" not found');
      return;
    }
    
    // Ensure keys[] array exists
    if (!data[id].keys) {
      data[id].keys = [];
    }
    
    // Check if key already exists
    const envTrimmed = env.trim();
    if (data[id].keys.some(k => k.env === envTrimmed)) {
      dashboardApp.sendError(res, 409, 'Key "' + envTrimmed + '" already exists');
      return;
    }
    
    // Check if env var name conflicts with single apiKeyEnv
    if (data[id].apiKeyEnv && data[id].apiKeyEnv === envTrimmed) {
      dashboardApp.sendError(res, 409, 'Key "' + envTrimmed + '" conflicts with existing single key config');
      return;
    }
    
    const newKey = { env: envTrimmed, weight: weightNum, rpm: rpmNum };
    data[id].keys.push(newKey);
    writeDirectProviders(data);
    
    console.log('[Providers] Added key ' + envTrimmed + ' to provider ' + id);
    
    const response = { ok: true, key: newKey };
    // Warn if env var not found in process.env
    if (!process.env[envTrimmed]) {
      response.warning = 'Env var "' + envTrimmed + '" not found in environment. Add it to .env or restart with the variable set.';
    }
    dashboardApp.sendJson(res, 200, response);
  });
  
  dashboardApp.addRoute('PUT', '/dashboard/api/providers/:id/keys/:keyEnv', (req, res) => {
    const { id, keyEnv } = req.params;
    const { weight, rpm } = req.body || {};
    
    const data = readDirectProviders();
    if (!data[id]) {
      dashboardApp.sendError(res, 404, 'Provider "' + id + '" not found');
      return;
    }
    
    const keys = data[id].keys || [];
    const idx = keys.findIndex(k => k.env === keyEnv);
    if (idx === -1) {
      dashboardApp.sendError(res, 404, 'Key "' + keyEnv + '" not found');
      return;
    }
    
    if (weight !== undefined) {
      const w = parseInt(weight, 10);
      if (isNaN(w) || w <= 0 || w > 1000) {
        dashboardApp.sendError(res, 400, 'Weight must be between 1 and 1000');
        return;
      }
      keys[idx].weight = w;
    }
    if (rpm !== undefined) {
      const r = parseInt(rpm, 10);
      if (isNaN(r) || r <= 0 || r > 10000) {
        dashboardApp.sendError(res, 400, 'RPM must be between 1 and 10000');
        return;
      }
      keys[idx].rpm = r;
    }
    
    writeDirectProviders(data);
    console.log('[Providers] Updated key ' + keyEnv + ' for provider ' + id);
    dashboardApp.sendJson(res, 200, { ok: true, key: keys[idx] });
  });
  
  dashboardApp.addRoute('DELETE', '/dashboard/api/providers/:id/keys/:keyEnv', (req, res) => {
    const { id, keyEnv } = req.params;
    
    const data = readDirectProviders();
    if (!data[id]) {
      dashboardApp.sendError(res, 404, 'Provider "' + id + '" not found');
      return;
    }
    
    const keys = data[id].keys || [];
    const idx = keys.findIndex(k => k.env === keyEnv);
    if (idx === -1) {
      dashboardApp.sendError(res, 404, 'Key "' + keyEnv + '" not found');
      return;
    }
    
    if (keys.length <= 1) {
      dashboardApp.sendError(res, 400, 'Cannot remove last key. Use standard apiKeyEnv field instead.');
      return;
    }
    
    keys.splice(idx, 1);
    writeDirectProviders(data);
    
    // Clear key state for the removed key
    try {
      const keyPool = require('../key-pool');
      // Key states are per-keyId; calling resetKeyStates clears all (acceptable)
      keyPool.resetKeyStates();
    } catch (e) { /* ignore */ }
    
    console.log('[Providers] Removed key ' + keyEnv + ' from provider ' + id);
    dashboardApp.sendJson(res, 200, { ok: true });
  });
  
  dashboardApp.addRoute('GET', '/dashboard/api/providers/:id', (req, res) => {
    const id = req.params.id;
    const directData = readDirectProviders();
    if (directData[id]) {
      const cfg = directData[id];
      const secret = resolveSecret(cfg);
      const models = Object.keys(cfg.models || {}).map(mid => ({ id: mid }));
      dashboardApp.sendJson(res, 200, { id, name: cfg.name || id, type: 'direct', baseURL: cfg.baseURL || '', connected: true, models, hasApiKey: secret.value !== null, authSource: secret.source, apiKeyEnv: cfg.apiKeyEnv || null });
      return;
    }
    dashboardApp.sendJson(res, 200, { id, type: 'opencode', detail: null });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/providers/opencode/config', (req, res) => {
    const result = readOpenCodeConfig();
    if (result.error) {
      dashboardApp.sendJson(res, 200, { ok: false, error: result.error });
      return;
    }
    const redactedRaw = redactSecrets(result.raw);
    const redactedParsed = JSON.parse(cleanJSONC(redactedRaw));
    dashboardApp.sendJson(res, 200, { ok: true, raw: redactedRaw, parsed: redactedParsed });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/providers/opencode/config', (req, res) => {
    const { raw } = req.body || {};
    if (!raw) { dashboardApp.sendError(res, 400, 'Config content is required'); return; }

    const validation = validateAndFixJSONC(raw);
    if (!validation.valid) { dashboardApp.sendError(res, 400, 'Invalid JSON: ' + validation.error); return; }

    try {
      let finalRaw = raw;
      if (fs.existsSync(OPENCODE_CONFIG_PATH)) {
        const originalRaw = fs.readFileSync(OPENCODE_CONFIG_PATH, 'utf8');
        const originalParsed = JSON.parse(cleanJSONC(originalRaw));
        const incomingParsed = JSON.parse(cleanJSONC(raw));

        function mergeSecrets(incoming, original) {
          if (incoming === null || typeof incoming !== 'object') return incoming;
          const result = Array.isArray(incoming) ? [...incoming] : { ...incoming };
          for (const key of Object.keys(incoming)) {
            if (['apiKey', 'api_key', 'password', 'secret', 'token', 'bearer'].includes(key)) {
              if (incoming[key] === '[REDACTED]' && original && original[key] !== undefined) {
                result[key] = original[key];
              }
            } else if (typeof incoming[key] === 'object' && incoming[key] !== null) {
              result[key] = mergeSecrets(incoming[key], original && original[key]);
            }
          }
          return result;
        }

        const merged = mergeSecrets(incomingParsed, originalParsed);
        finalRaw = JSON.stringify(merged, null, 2);
      }

      if (fs.existsSync(OPENCODE_CONFIG_PATH)) {
        const backupPath = OPENCODE_CONFIG_PATH + '.bak.' + Date.now();
        fs.copyFileSync(OPENCODE_CONFIG_PATH, backupPath);
      }
      fs.writeFileSync(OPENCODE_CONFIG_PATH, finalRaw, 'utf8');
      console.log('[Providers] OpenCode config saved');
      dashboardApp.sendJson(res, 200, { ok: true });
    } catch (e) {
      dashboardApp.sendError(res, 500, 'Failed to write config: ' + e.message);
    }
  });

  dashboardApp.addRoute('POST', '/dashboard/api/providers/opencode/restart', (req, res) => {
    console.log('[Providers] Restarting OpenCode...');
    execFile('systemctl', ['restart', 'opencode'], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[Providers] Restart failed:', error.message);
        dashboardApp.sendJson(res, 200, { ok: false, error: error.message });
        return;
      }
      console.log('[Providers] OpenCode restart initiated');
      dashboardApp.sendJson(res, 200, { ok: true });
    });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/models/:modelId/metadata', (req, res) => {
    const modelId = req.params.modelId;
    const OVERRIDE_PATH = PATHS.MODELS_OVERRIDE;
    try {
      const overrides = fs.existsSync(OVERRIDE_PATH) ? JSON.parse(fs.readFileSync(OVERRIDE_PATH, 'utf8')) : {};
      const entry = overrides[modelId] || {};
      dashboardApp.sendJson(res, 200, { ok: true, modelId, metadata: entry });
    } catch (e) {
      dashboardApp.sendError(res, 500, 'Failed to read override: ' + e.message);
    }
  });

  dashboardApp.addRoute('PUT', '/dashboard/api/models/:modelId/metadata', (req, res) => {
    const modelId = req.params.modelId;
    const { metadata } = req.body || {};
    if (!metadata || typeof metadata !== 'object') {
      dashboardApp.sendError(res, 400, 'metadata object is required');
      return;
    }
    const OVERRIDE_PATH = PATHS.MODELS_OVERRIDE;
    try {
      const dir = path.dirname(OVERRIDE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let overrides = fs.existsSync(OVERRIDE_PATH) ? JSON.parse(fs.readFileSync(OVERRIDE_PATH, 'utf8')) : {};

      // Clean metadata: remove empty/undefined values
      const cleaned = {};
      if (metadata.description) cleaned.description = metadata.description;
      if (metadata.pricingKey) cleaned.pricingKey = metadata.pricingKey;
      if (metadata.policy) cleaned.policy = metadata.policy;
      if (metadata.context) cleaned.context = metadata.context;
      if (metadata.maxOutput) cleaned.maxOutput = metadata.maxOutput;
      if (Array.isArray(metadata.capabilities) && metadata.capabilities.length > 0) cleaned.capabilities = metadata.capabilities;
      if (typeof metadata.show === 'boolean') cleaned.show = metadata.show;
      if (metadata.provider) cleaned.provider = metadata.provider;
      if (metadata.inputType) cleaned.inputType = metadata.inputType;
      if (metadata.outputType) cleaned.outputType = metadata.outputType;
      if (metadata.pricing && typeof metadata.pricing === 'object') {
        cleaned.pricing = {};
        if (metadata.pricing.input !== undefined) cleaned.pricing.input = Number(metadata.pricing.input);
        if (metadata.pricing.output !== undefined) cleaned.pricing.output = Number(metadata.pricing.output);
        if (metadata.pricing.cacheRead !== undefined) cleaned.pricing.cacheRead = Number(metadata.pricing.cacheRead);
      }

      if (Object.keys(cleaned).length === 0) {
        delete overrides[modelId];
      } else {
        overrides[modelId] = cleaned;
      }

      fs.writeFileSync(OVERRIDE_PATH, JSON.stringify(overrides, null, 2) + '\n', 'utf8');
      console.log('[Metadata] Updated override for ' + modelId);

      // Trigger sync
      const syncScript = PATHS.SYNC_MODELS;
      if (fs.existsSync(syncScript)) {
        execFile('node', [syncScript], { timeout: 30000, cwd: path.dirname(syncScript) }, (error, stdout, stderr) => {
          if (error) {
            console.error('[Metadata] Sync failed:', error.message);
          } else {
            console.log('[Metadata] Sync completed');
          }
        });
      }

      dashboardApp.sendJson(res, 200, { ok: true, modelId, metadata: cleaned });
    } catch (e) {
      dashboardApp.sendError(res, 500, 'Failed to update override: ' + e.message);
    }
  });

  dashboardApp.addRoute('GET', '/dashboard/api/providers/opencode/status', (req, res) => {
    const url = new URL('/config', OPENCODE_URL);
    const lib = url.protocol === 'https:' ? https : http;
    let req3;
    const reqTimeout = setTimeout(() => {
      if (req3) req3.destroy();
      dashboardApp.sendJson(res, 200, { ok: false, status: 'down', error: 'timeout' });
    }, 5000);

    req3 = lib.get(url, (res2) => {
      clearTimeout(reqTimeout);
      const chunks = [];
      res2.on('data', chunk => chunks.push(chunk));
      res2.on('end', () => {
        try {
          const data = Buffer.concat(chunks).toString();
          const parsed = JSON.parse(data);
          dashboardApp.sendJson(res, 200, { ok: true, status: 'running', providers: parsed.provider ? Object.keys(parsed.provider).length : 0 });
        } catch {
          dashboardApp.sendJson(res, 200, { ok: true, status: 'running', providers: 0 });
        }
      });
    });
    req3.on('error', (err) => {
      clearTimeout(reqTimeout);
      dashboardApp.sendJson(res, 200, { ok: false, status: 'down', error: err.message });
    });
  });
}

module.exports = { register };
