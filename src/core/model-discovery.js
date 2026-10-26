const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

function normalizeModelId(id) {
  return id.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toCandidate(model, entry, matchKind) {
  return {
    providerID: model.providerID,
    modelID: model.modelID,
    family: model.family,
    costInput: model.costInput,
    costOutput: model.costOutput,
    contextLimit: model.contextLimit,
    outputLimit: model.outputLimit,
    hasRealPricing: model.costInput > 0 || model.costOutput > 0,
    hasMetadata: model.contextLimit > 0,
    matchKind,
    transport: model.transport || 'opencode',
    preferredProvider: null,
    fallbackProvider: null,
  };
}

function getProviderOrder(entry) {
  if (entry.chain && entry.chain.length > 0) {
    return entry.chain.map(e => e.provider);
  }
  const order = [];
  if (entry.prefer) order.push(entry.prefer);
  if (entry.fallback && !order.includes(entry.fallback)) order.push(entry.fallback);
  for (const p of (entry.matchProviders || [])) {
    if (!order.includes(p)) order.push(p);
  }
  return order;
}

function rankCandidate(candidate, entry) {
  const providerOrder = getProviderOrder(entry);
  const providerRank = providerOrder.indexOf(candidate.providerID);
  return [
    candidate.matchKind === 'exact' ? 0 : 1,
    providerRank === -1 ? providerOrder.length : providerRank,
    candidate.hasRealPricing ? 0 : 1,
    candidate.hasMetadata ? 0 : 1,
    candidate.providerID,
    candidate.modelID,
  ];
}

class ModelDiscovery {
  constructor(config) {
    this.openCodeUrl = config.opencode.url;
    this.auth = Buffer.from(config.opencode.username + ':' + config.opencode.password).toString('base64');
    this.refreshIntervalMs = config.discoveryRefreshMs || 60000;
    this.familyConfig = config.publicModels || {};
    this.internalRegistry = new Map();
    this.familyPool = new Map();
    this.familyCandidates = new Map();
    this.lastRefresh = null;
    this.refreshTimer = null;
    this.status = 'uninitialized';
    this.pendingRefresh = null;
    this.connectedProviders = new Set();
    this.providerMetadata = new Map();
  }

  async initialize() {
    console.log('[Discovery] Initializing model discovery...');
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.refresh();
    this.startPeriodicRefresh();
    this.status = 'ready';
    console.log('[Discovery] Ready');
  }

  startPeriodicRefresh() {
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(e => console.error('[Discovery] Periodic refresh failed:', e.message));
    }, this.refreshIntervalMs);
  }

  shutdown() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.status = 'shutdown';
  }

  async refresh() {
    if (this.pendingRefresh) return this.pendingRefresh;
    this.pendingRefresh = this._refresh().finally(() => {
      this.pendingRefresh = null;
    });
    return this.pendingRefresh;
  }

  async _refresh() {
    const providerData = await this.fetchProviderData();
    if (!providerData) return;

    try {
      const modelsPath = path.join(__dirname, '..', '..', 'config', 'public-models.json');
      const raw = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
      this.familyConfig = (raw && raw.families) || {};
    } catch (e) {
      // keep existing familyConfig
    }

    const connectedSet = new Set(providerData.connected || []);
    const newRegistry = new Map();
    const providerMetadata = new Map();

    for (const provider of (providerData.all || [])) {
      providerMetadata.set(provider.id, {
        id: provider.id,
        name: provider.name || provider.id,
        source: provider.source || 'api',
        env: Array.isArray(provider.env) ? provider.env.slice() : [],
      });
      if (!connectedSet.has(provider.id)) continue;
      for (const [modelId, modelInfo] of Object.entries(provider.models || {})) {
        const key = provider.id + '/' + modelId;
        newRegistry.set(key, {
          providerID: provider.id,
          modelID: modelId,
          name: modelInfo.name || modelId,
          family: modelInfo.family || '',
          status: modelInfo.status || 'active',
          costInput: (modelInfo.cost && modelInfo.cost.input) || 0,
          costOutput: (modelInfo.cost && modelInfo.cost.output) || 0,
          contextLimit: (modelInfo.limit && modelInfo.limit.context) || 0,
          outputLimit: (modelInfo.limit && modelInfo.limit.output) || 0,
          capabilities: modelInfo.capabilities || {},
          transport: 'opencode',
        });
      }
    }
    // Load direct providers from config/direct-providers.json
    try {
      const directPath = path.join(__dirname, '..', '..', 'config', 'direct-providers.json');
      const directData = JSON.parse(fs.readFileSync(directPath, 'utf8'));
      for (const [id, cfg] of Object.entries(directData)) {
        connectedSet.add(id);
        const envVars = Array.isArray(cfg.keys) ? cfg.keys.map(k => k.env).filter(Boolean) : (cfg.apiKeyEnv ? [cfg.apiKeyEnv] : []);
        providerMetadata.set(id, { id, name: cfg.name || id, source: 'direct', env: envVars });
        for (const [modelId, modelInfo] of Object.entries(cfg.models || {})) {
          const key = id + '/' + modelId;
          newRegistry.set(key, {
            providerID: id,
            modelID: modelId,
            name: modelInfo.name || modelId,
            family: '',
            status: 'active',
            costInput: 0,
            costOutput: 0,
            capabilities: {},
            transport: 'openai-compatible',
          });
        }
      }
    } catch (e) {
      // direct-providers.json is optional
    }

    this.internalRegistry = newRegistry;
    this.connectedProviders = connectedSet;
    this.providerMetadata = providerMetadata;

    this.buildFamilyPool();

    this.lastRefresh = new Date().toISOString();
    console.log('[Discovery] Refresh: ' + this.internalRegistry.size + ' internal models, ' + this.familyPool.size + ' families resolved');
  }

  async fetchProviderData() {
    const url = new URL('/provider', this.openCodeUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    const timeoutMs = 8000;

    return new Promise((resolve) => {
      const req = lib.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'Authorization': 'Basic ' + this.auth },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }

  collectCandidates(entry) {
    if (entry.chain && entry.chain.length > 0) {
      return this.collectCandidatesFromChain(entry);
    }
    return this.collectCandidatesLegacy(entry);
  }

  collectCandidatesFromChain(entry) {
    const chain = entry.chain;
    const providerOrder = chain.map(e => e.provider);
    const exactCandidates = [];
    const familyCandidates = [];

    for (const { provider, model } of chain) {
      for (const [key, m] of this.internalRegistry) {
        if (m.providerID !== provider) continue;
        if (model && normalizeModelId(model) === normalizeModelId(m.modelID)) {
          exactCandidates.push(toCandidate(m, entry, 'exact'));
        }
      }
    }

    if (exactCandidates.length === 0 && entry.matchFamily) {
      for (const { provider } of chain) {
        for (const [key, m] of this.internalRegistry) {
          if (m.providerID === provider && entry.matchFamily.includes(m.family)) {
            familyCandidates.push(toCandidate(m, entry, 'family'));
          }
        }
      }
    }

    const sortByOrder = (arr) => arr.sort((a, b) => {
      const ai = providerOrder.indexOf(a.providerID);
      const bi = providerOrder.indexOf(b.providerID);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    sortByOrder(exactCandidates);
    sortByOrder(familyCandidates);

    if (exactCandidates.length > 0) return exactCandidates;
    if (familyCandidates.length > 0) return familyCandidates;

    for (const { provider, model } of chain) {
      if (!model) {
        for (const [key, m] of this.internalRegistry) {
          if (m.providerID === provider) {
            exactCandidates.push(toCandidate(m, entry, 'family'));
          }
        }
      }
    }
    sortByOrder(exactCandidates);
    return exactCandidates;
  }

  collectCandidatesLegacy(entry) {
    const providerNames = Array.from(new Set([...(entry.matchProviders || []), entry.prefer, entry.fallback].filter(Boolean)));
    const exactCandidates = [];
    const familyCandidates = [];

    for (const providerName of providerNames) {
      for (const [key, model] of this.internalRegistry) {
        if (!key.startsWith(providerName + '/')) continue;

        const familyMatch = (entry.matchFamily || []).includes(model.family);
        const modelMatch = (entry.matchModels || []).some(pattern => normalizeModelId(pattern) === normalizeModelId(model.modelID));

        if (modelMatch) {
          exactCandidates.push(toCandidate(model, entry, 'exact'));
          continue;
        }

        if (familyMatch) {
          familyCandidates.push(toCandidate(model, entry, 'family'));
        }
      }
    }

    const exactSorted = exactCandidates.sort((a, b) => {
      const ar = rankCandidate(a, entry);
      const br = rankCandidate(b, entry);
      for (let i = 0; i < ar.length; i += 1) {
        if (ar[i] < br[i]) return -1;
        if (ar[i] > br[i]) return 1;
      }
      return 0;
    });

    const familySorted = familyCandidates.sort((a, b) => {
      const ar = rankCandidate(a, entry);
      const br = rankCandidate(b, entry);
      for (let i = 0; i < ar.length; i += 1) {
        if (ar[i] < br[i]) return -1;
        if (ar[i] > br[i]) return 1;
      }
      return 0;
    });

    return exactSorted.length > 0 ? exactSorted : familySorted;
  }

  getCandidates(alias) {
    const entry = this.familyConfig[alias];
    if (!entry || !entry.enabled) return [];
    return (this.familyCandidates.get(alias) || []).slice();
  }

  resolveAliasFromCandidate(providerID, modelID) {
    for (const [alias, candidates] of this.familyCandidates) {
      if (candidates.some(c => c.providerID === providerID && c.modelID === modelID)) {
        return alias;
      }
    }
    for (const [alias, candidates] of this.familyCandidates) {
      if (candidates.some(c => c.providerID === providerID)) {
        return alias;
      }
    }
    return null;
  }

  isProviderConnected(providerID) {
    return this.connectedProviders.has(providerID);
  }

  getConnectedProviders() {
    return Array.from(this.connectedProviders);
  }

  getProviderInfo(providerID) {
    return this.providerMetadata.get(providerID) || null;
  }

  getPublishedCatalog() {
    const data = [];

    for (const [alias, entry] of Object.entries(this.familyConfig)) {
      if (!entry.enabled || entry.show === false) continue;

      const resolved = this.resolveFamily(alias);
      if (!resolved) continue;

      const providerInfo = this.getProviderInfo(resolved.providerID);
      const primaryKey = resolved.providerID + '/' + resolved.modelID;
      const primaryModel = this.internalRegistry.get(primaryKey) || {};

      data.push({
        id: alias,
        alias,
        displayName: entry.displayName || alias,
        pricingKey: entry.pricingKey || alias,
        context: primaryModel.contextLimit || resolved.contextLimit || 0,
        maxOutput: primaryModel.outputLimit || resolved.outputLimit || 0,
        capabilities: primaryModel.capabilities || {},
        enabled: entry.enabled !== false,
        show: entry.show !== false,
        customTrained: entry.isSpecialized === true,
      });
    }

    data.sort((a, b) => a.id.localeCompare(b.id));

    return {
      object: 'list',
      source: 'aiproxy',
      generatedAt: new Date().toISOString(),
      data,
    };
  }

  buildFamilyPool() {
    const newPool = new Map();
    const newCandidates = new Map();

    for (const [alias, entry] of Object.entries(this.familyConfig)) {
      if (!entry.enabled) continue;

      const candidates = this.collectCandidates(entry);

      if (candidates.length === 0) {
        console.log('[Discovery] Family "' + alias + '": no candidates available, disabled');
        continue;
      }

      newCandidates.set(alias, candidates);
      newPool.set(alias, candidates[0]);
    }

    this.familyPool = newPool;
    this.familyCandidates = newCandidates;
  }

  listFamilies() {
    const result = [];
    const familyConfig = this.familyConfig;
    for (const [alias, entry] of Object.entries(familyConfig)) {
      if (entry.show === false) continue;
      const resolved = this.familyPool.get(alias);
      if (!resolved) continue;
      result.push({
        id: alias,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'aiproxy',
        displayName: entry.displayName || alias,
        pricingKey: entry.pricingKey || alias,
        policy: entry.policy || 'default',
        isSpecialized: entry.isSpecialized === true,
        contextLimit: resolved.contextLimit,
        outputLimit: resolved.outputLimit,
      });
    }
    return result;
  }

  resolveFamily(alias) {
    const entry = this.familyConfig[alias];
    if (!entry || !entry.enabled) return null;
    const candidates = this.familyCandidates.get(alias) || [];
    if (candidates.length === 0) return null;
    const resolved = this.familyPool.get(alias) || candidates[0];
    return {
      alias,
      ...resolved,
      vendor: entry.vendor || null,
      candidates,
      policy: entry.policy || 'default',
      isSpecialized: entry.isSpecialized === true,
      specializedConfig: entry.specializedConfig || null,
      prefer: entry.chain ? (entry.chain[0]?.provider || null) : (entry.prefer || null),
      fallback: entry.chain ? (entry.chain[1]?.provider || null) : (entry.fallback || null),
    };
  }

  getStatus() {
    return {
      status: this.status,
      lastRefresh: this.lastRefresh,
      internalCount: this.internalRegistry.size,
      familyCount: this.familyPool.size,
      refreshIntervalMs: this.refreshIntervalMs,
    };
  }
}

module.exports = { ModelDiscovery };
