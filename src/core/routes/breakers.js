const router = require('../router');
const keyPool = require('../key-pool');
const { readDirectProviders, resolveKeyPool } = require('../direct-provider-config');

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/breakers', (req, res) => {
    dashboardApp.sendJson(res, 200, router.getBreakerState());
  });

  dashboardApp.addRoute('POST', '/dashboard/api/breaker/reset', (req, res) => {
    const { key } = req.body || {};
    if (key) {
      router.resetBreaker(key);
    }
    dashboardApp.sendJson(res, 200, { ok: true });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/breaker/reset-all', (req, res) => {
    router.resetAllBreakers();
    dashboardApp.sendJson(res, 200, { ok: true });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/routing/traces', (req, res) => {
    const traces = router.getRoutingTraces();
    dashboardApp.sendJson(res, 200, { object: 'list', data: traces.slice(-50).reverse() });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/routing/traces/clear', (req, res) => {
    router.clearRoutingTraces();
    dashboardApp.sendJson(res, 200, { ok: true });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/key-pools', (req, res) => {
    const providers = readDirectProviders();
    const result = [];
    for (const [id, cfg] of Object.entries(providers)) {
      const keys = resolveKeyPool(cfg);
      if (keys.length > 0) {
        result.push({
          providerId: id,
          name: cfg.name || id,
          totalKeys: keys.length,
          keyPoolStatus: keyPool.getKeyPoolStatus(keys),
        });
      }
    }
    dashboardApp.sendJson(res, 200, { object: 'list', data: result });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/key-pools/reset', (req, res) => {
    keyPool.resetKeyStates();
    dashboardApp.sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
