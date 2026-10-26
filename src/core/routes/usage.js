const usageTracker = require('../usage-tracker');

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/usage', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hours = parseInt(url.searchParams.get('hours') || '24', 10);
    const stats = usageTracker.getUsageStats(Math.min(hours, 168));
    dashboardApp.sendJson(res, 200, stats);
  });

  dashboardApp.addRoute('GET', '/dashboard/api/usage/summary', (req, res) => {
    const summary = usageTracker.getTokenSummary();
    dashboardApp.sendJson(res, 200, summary);
  });
}

module.exports = { register };
