const skillsService = require('../skills');
const userSkillsService = require('../user-skills');

function resolveUserId(req) {
  if (req.session && req.session.username) {
    if (req.session.username !== 'system') return req.session.username;
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

function isAdmin(req) {
  if (!req.session) return false;
  if (req.session.username === 'system') return true;
  return false;
}

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/skills', async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 16;
    const search = url.searchParams.get('search') || '';
    const category = url.searchParams.get('category') || 'all';
    const result = skillsService.getPaginated({ page, limit, search, category });
    const safeData = result.data.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      tags: s.tags,
      tokenEstimate: s.tokenEstimate,
    }));
    dashboardApp.sendJson(res, 200, { ok: true, data: safeData, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/skills/import', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    const { type, source, name } = req.body || {};
    if (!type || !source) {
      dashboardApp.sendError(res, 400, 'type (url|github|text) and source are required');
      return;
    }
    if (!['url', 'github', 'text'].includes(type)) {
      dashboardApp.sendError(res, 400, 'type must be "url", "github", or "text"');
      return;
    }
    try {
      const skill = await skillsService.createSkill(type, source, name);
      dashboardApp.sendJson(res, 200, { ok: true, data: { id: skill.meta.id, name: skill.meta.name }, warnings: [] });
    } catch (err) {
      dashboardApp.sendError(res, 400, err.message);
    }
  });

  dashboardApp.addRoute('PUT', '/dashboard/api/skills/:id', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    const { name, description, category, tags, tokenEstimate, source, content } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (tags !== undefined) updates.tags = tags;
    if (tokenEstimate !== undefined) updates.tokenEstimate = tokenEstimate;
    if (source !== undefined) updates.source = source;
    if (content !== undefined) updates.content = content;
    const result = skillsService.updateSkill(req.params.id, updates);
    if (!result) { dashboardApp.sendError(res, 404, 'Skill not found'); return; }
    dashboardApp.sendJson(res, 200, { ok: true, data: { id: result.id, name: result.name } });
  });

  dashboardApp.addRoute('DELETE', '/dashboard/api/skills/:id', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    const ok = skillsService.deleteSkill(req.params.id);
    dashboardApp.sendJson(res, 200, { ok });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/user-skills/:userId', async (req, res) => {
    const data = userSkillsService.getUserSkills(req.params.userId);
    dashboardApp.sendJson(res, 200, { ok: true, data });
  });

  dashboardApp.addRoute('POST', '/dashboard/api/user-skills/:userId', async (req, res) => {
    const { skillId, enabled } = req.body || {};
    if (!skillId) { dashboardApp.sendError(res, 400, 'skillId is required'); return; }
    const enabledSkills = userSkillsService.setSkillEnabled(req.params.userId, skillId, enabled);
    dashboardApp.sendJson(res, 200, { ok: true, data: { enabledSkills } });
  });

  dashboardApp.addRoute('PUT', '/dashboard/api/user-skills/:userId', async (req, res) => {
    const { tokenBudget } = req.body || {};
    if (tokenBudget === undefined) { dashboardApp.sendError(res, 400, 'tokenBudget is required'); return; }
    const budget = userSkillsService.setTokenBudget(req.params.userId, tokenBudget);
    dashboardApp.sendJson(res, 200, { ok: true, data: { tokenBudget: budget } });
  });
}

module.exports = { register };
