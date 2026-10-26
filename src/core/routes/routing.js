const fs = require('fs');
const path = require('path');
const registry = require('../model-registry');
const modelStatus = require('../model-status');

const MODELS_PATH = path.join(__dirname, '..', '..', '..', 'config', 'public-models.json');

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/routing', (req, res) => {
    try {
      const raw = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
      const families = Object.entries(raw.families || {}).map(([id, entry]) => ({
        id,
        ...entry,
      }));
      dashboardApp.sendJson(res, 200, { families });
    } catch (e) {
      dashboardApp.sendJson(res, 500, { error: e.message });
    }
  });

  dashboardApp.addRoute('GET', '/dashboard/api/routing/providers', (req, res) => {
    const providers = registry.getConnectedProviders ? registry.getConnectedProviders() : [];
    const status = registry.getStatus ? registry.getStatus() : {};
    dashboardApp.sendJson(res, 200, {
      providers: providers.map(p => ({
        id: p.id || p,
        displayName: p.displayName || p.id || p,
        connected: p.connected !== undefined ? p.connected : true,
        modelCount: p.models ? p.models.length : (p.modelCount || 0),
      })),
      refreshIntervalMs: status.refreshIntervalMs || 60000,
    });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/routing/candidates/:alias', (req, res) => {
    const alias = req.params.alias;
    const resolved = registry.resolveModel(alias);
    const candidates = registry.getModelCandidates(alias) || [];
    const status = modelStatus.getStatus ? modelStatus.getStatus(alias) : null;
    dashboardApp.sendJson(res, 200, {
      alias,
      resolved: resolved ? { providerID: resolved.providerID, modelID: resolved.modelID } : null,
      status: status ? { status: status.status, reason: status.reason } : null,
      candidates: candidates.map(c => ({
        providerID: c.providerID,
        modelID: c.modelID,
        matchKind: c.matchKind,
        hasRealPricing: c.hasRealPricing,
      })),
    });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/routing/catalog', (req, res) => {
    dashboardApp.sendJson(res, 200, {
      message: 'Catalog metadata is published from this proxy and synced automatically.',
      endpoint: '/v1/catalog/models',
      catalog: registry.getPublishedCatalog(),
    });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/routing/save', (req, res) => {
    try {
      const { families } = req.body || {};
      if (!families || !Array.isArray(families)) {
        return dashboardApp.sendJson(res, 400, { error: 'families array required' });
      }
      const raw = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
      for (const f of families) {
        const { id, ...entry } = f;
        raw.families[id] = { ...raw.families[id], ...entry };
      }
      fs.writeFileSync(MODELS_PATH, JSON.stringify(raw, null, 2), 'utf8');
      registry.initialize().then(() => {
        modelStatus.initialize(registry.getPublicModels());
        dashboardApp.sendJson(res, 200, { ok: true, count: families.length });
      }).catch(e => {
        dashboardApp.sendJson(res, 200, { ok: true, count: families.length, reloadError: e.message });
      });
    } catch (e) {
      dashboardApp.sendJson(res, 500, { error: e.message });
    }
  });

  dashboardApp.addRoute('POST', '/dashboard/api/routing/toggle', (req, res) => {
    try {
      const { alias, field } = req.body || {};
      if (!alias || !['show', 'enabled'].includes(field)) {
        return dashboardApp.sendJson(res, 400, { error: 'alias and field (show/enabled) required' });
      }
      const raw = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
      if (!raw.families[alias]) {
        return dashboardApp.sendJson(res, 404, { error: 'Family not found' });
      }
      raw.families[alias][field] = !raw.families[alias][field];
      fs.writeFileSync(MODELS_PATH, JSON.stringify(raw, null, 2), 'utf8');
      registry.initialize().then(() => {
        modelStatus.initialize(registry.getPublicModels());
      }).catch(() => {});
      dashboardApp.sendJson(res, 200, { ok: true, alias, field, value: raw.families[alias][field] });
    } catch (e) {
      dashboardApp.sendJson(res, 500, { error: e.message });
    }
  });
}

module.exports = { register };
