const healthChecker = require('../model-health-checker');

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/health', (req, res) => {
    const stats = healthChecker.getStats();
    dashboardApp.sendJson(res, 200, stats);
  });

  dashboardApp.addRoute('POST', '/dashboard/api/health/probe', (req, res) => {
    dashboardApp.sendJson(res, 200, { ok: true, message: 'Probe triggered (stub)' });
  });
}

module.exports = { register };
