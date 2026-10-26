const configStore = require('../config-store');

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/settings', (req, res) => {
    dashboardApp.sendJson(res, 200, configStore.get());
  });

  dashboardApp.addRoute('GET', '/dashboard/api/settings/:section', (req, res) => {
    const section = configStore.getSection(req.params.section);
    dashboardApp.sendJson(res, 200, section);
  });

  dashboardApp.addRoute('POST', '/dashboard/api/settings/reset', (req, res) => {
    const result = configStore.reset();
    dashboardApp.sendJson(res, 200, { ok: true, settings: result });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/settings/:section', (req, res) => {
    try {
      const updated = configStore.updateSection(req.params.section, req.body || {});
      dashboardApp.sendJson(res, 200, { ok: true, settings: updated });
    } catch (e) {
      dashboardApp.sendJson(res, 400, { error: e.message });
    }
  });

  dashboardApp.addRoute('POST', '/dashboard/api/settings', (req, res) => {
    try {
      const updated = configStore.update(req.body || {});
      dashboardApp.sendJson(res, 200, { ok: true, settings: updated });
    } catch (e) {
      dashboardApp.sendJson(res, 400, { error: e.message });
    }
  });

  dashboardApp.addRoute('GET', '/dashboard/api/rate-limiter/stats', (req, res) => {
    try {
      const rateLimiter = require('../rate-limiter');
      dashboardApp.sendJson(res, 200, rateLimiter.getStats());
    } catch (e) {
      dashboardApp.sendJson(res, 500, { error: e.message });
    }
  });

  dashboardApp.addRoute('POST', '/dashboard/api/rate-limiter/reset-stats', (req, res) => {
    try {
      const rateLimiter = require('../rate-limiter');
      rateLimiter.reset();
      dashboardApp.sendJson(res, 200, { ok: true, stats: rateLimiter.getStats() });
    } catch (e) {
      dashboardApp.sendJson(res, 500, { error: e.message });
    }
  });
}

module.exports = { register };
