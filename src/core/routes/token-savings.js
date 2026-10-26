const tokenSavings = require('../token-savings');

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/token-savings', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const days = parseInt(url.searchParams.get('days') || '7', 10);
    const userId = url.searchParams.get('userId') || null;
    const stats = tokenSavings.getStats(userId, Math.min(Math.max(days, 1), 90));
    dashboardApp.sendJson(res, 200, { ok: true, data: stats });
  });
}

module.exports = { register };
