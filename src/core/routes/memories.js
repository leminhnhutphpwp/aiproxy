const memoryService = require('../memory');

function resolveUserId(req) {
  if (req.session && req.session.username) {
    if (req.session.username !== 'system') {
      return req.session.username;
    }
    const url = new URL(req.url, 'http://localhost');
    const queryUserId = url.searchParams.get('user_id');
    if (queryUserId) return queryUserId;
    if (req.body && req.body.user_id) return req.body.user_id;
    return 'system';
  }
  return null;
}

function requireUserId(req, res, dashboardApp) {
  const userId = resolveUserId(req);
  if (!userId) {
    dashboardApp.sendError(res, 400, 'user_id is required');
    return null;
  }
  return userId;
}

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/memories', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const url = new URL(req.url, 'http://localhost');
    const category = url.searchParams.get('category') || '';
    const filters = {};
    if (category) filters.category = category;
    const memories = await memoryService.getAll(userId, filters);
    dashboardApp.sendJson(res, 200, { ok: true, data: memories, total: memories.length });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/memories/:id', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const memory = await memoryService.get(userId, req.params.id);
    if (!memory) {
      dashboardApp.sendError(res, 404, 'Memory not found');
      return;
    }
    dashboardApp.sendJson(res, 200, { ok: true, data: memory });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/memories', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const { content, category, tags } = req.body || {};
    if (!content) {
      dashboardApp.sendError(res, 400, 'content is required');
      return;
    }
    if (typeof content !== 'string' || content.length > 10000) {
      dashboardApp.sendError(res, 400, 'Content must be a non-empty string (max 10,000 chars)');
      return;
    }
    const memory = await memoryService.add(userId, {
      content, category: category || 'fact', source: 'explicit',
      confidence: 1.0, tags: tags || [],
    });
    dashboardApp.sendJson(res, 200, { ok: true, data: memory });
  });

  dashboardApp.addRoute('PUT', '/dashboard/api/memories/:id', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const { content, category, confidence, is_active, tags } = req.body || {};
    const updates = {};
    if (content !== undefined) updates.content = content;
    if (category !== undefined) updates.category = category;
    if (confidence !== undefined) updates.confidence = confidence;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    if (tags !== undefined) updates.tags = tags;

    const result = await memoryService.update(userId, req.params.id, updates);
    if (!result) {
      dashboardApp.sendError(res, 404, 'Memory not found');
      return;
    }
    dashboardApp.sendJson(res, 200, { ok: true, data: result });
  });

  dashboardApp.addRoute('DELETE', '/dashboard/api/memories/:id', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const ok = await memoryService.remove(userId, req.params.id);
    dashboardApp.sendJson(res, 200, { ok });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/memories/clear', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    await memoryService.clearAll(userId);
    dashboardApp.sendJson(res, 200, { ok: true });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/memories/search', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const { query, max_tokens = 500 } = req.body || {};
    const result = await memoryService.search(userId, query || '', max_tokens);
    dashboardApp.sendJson(res, 200, { ok: true, data: result });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/memories/stats', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const stats = await memoryService.getStats(userId);
    dashboardApp.sendJson(res, 200, { ok: true, data: stats });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/memories/:id/verify', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const memory = await memoryService.get(userId, req.params.id);
    if (!memory) {
      dashboardApp.sendError(res, 404, 'Memory not found');
      return;
    }
    const result = await memoryService.update(userId, req.params.id, {
      verified: true,
      verified_at: new Date().toISOString(),
      confidence: 1.0,
    });
    dashboardApp.sendJson(res, 200, { ok: true, data: result });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/memories/:id/unverify', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const result = await memoryService.update(userId, req.params.id, {
      verified: false,
      verified_at: null,
      confidence: 0.5,
    });
    dashboardApp.sendJson(res, 200, { ok: true, data: result });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/memories/export', async (req, res) => {
    const userId = requireUserId(req, res, dashboardApp);
    if (!userId) return;
    const memories = await memoryService.getAll(userId);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="memories-${userId}.json"`,
    });
    res.end(JSON.stringify(memories, null, 2));
  });
}

module.exports = { register };
