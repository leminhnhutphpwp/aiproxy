const requestLogger = require('../request-logger');

function sanitizeError(msg) {
  if (!msg) return msg;
  return String(msg)
    .replace(/\/www\/wwwroot\/[^\s,]*/g, '[path]')
    .replace(/(provider|Provider)Error/g, 'ProviderError');
}

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/logs', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const modelFilter = url.searchParams.get('model') || '';
    const statusFilter = url.searchParams.get('status') || '';
    const filter = {};
    if (modelFilter) filter.model = modelFilter;
    if (statusFilter) {
      if (statusFilter === 'success') filter.statusMin = 200;
      else if (statusFilter === 'error') filter.statusMin = 400;
      else filter.status = parseInt(statusFilter, 10);
    }
    const result = requestLogger.getLogs({ limit, offset, filter });
    if (result.entries) {
      result.entries = result.entries.map(entry => ({
        ...entry,
        error: sanitizeError(entry.error),
      }));
    }
    dashboardApp.sendJson(res, 200, result);
  });

  dashboardApp.addRoute('GET', '/dashboard/api/logs/history', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const days = parseInt(url.searchParams.get('days') || '7', 10);
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const model = url.searchParams.get('model') || '';
    const status = url.searchParams.get('status') || '';
    const user = url.searchParams.get('user') || '';
    let statusMin, statusMax, statusCode;
    if (status === 'success') { statusMin = 200; statusMax = 399; }
    else if (status === 'error') statusMin = 400;
    else if (status) statusCode = parseInt(status, 10);
    const result = requestLogger.getHistory({ days, model, status: statusCode, statusMin, statusMax, user: user || undefined, limit, offset });
    if (result.entries) {
      result.entries = result.entries.map(entry => ({
        ...entry,
        error: sanitizeError(entry.error),
      }));
    }
    dashboardApp.sendJson(res, 200, result);
  });

  dashboardApp.addRoute('GET', '/dashboard/api/logs/breakdown', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const days = parseInt(url.searchParams.get('days') || '1', 10);
    const result = requestLogger.getHistory({ days, limit: 99999 });
    const codes = {};
    const byModel = {};
    for (const e of result.entries) {
      const c = e.statusCode || 0;
      codes[c] = (codes[c] || 0) + 1;
      const m = e.model || 'unknown';
      if (!byModel[m]) byModel[m] = { success: 0, error: 0, total: 0, tokens: 0 };
      byModel[m].total++;
      byModel[m].tokens += (e.inputTokens || 0) + (e.outputTokens || 0);
      if (c < 400) byModel[m].success++; else byModel[m].error++;
    }
    dashboardApp.sendJson(res, 200, {
      total: result.total,
      statusCodes: codes,
      byModel: Object.entries(byModel).sort((a,b) => b[1].total - a[1].total).slice(0, 20).map(([k,v]) => ({ model: k, ...v })),
    });
  });
  dashboardApp.addRoute('GET', '/dashboard/api/logs/violations', (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hours = parseInt(url.searchParams.get('hours') || '24', 10);
    const result = requestLogger.getViolationStats({ hours });
    dashboardApp.sendJson(res, 200, result);
  });
}

module.exports = { register };
