const specializedService = require('../specialized');
const knowledgeStore = require('../specialized/knowledge-store');
const { globalMetrics } = require('../specialized/metrics');

function isAdmin(req) {
  if (!req.session) return false;
  if (req.session.username === 'system') return true;
  return false;
}

function isValidModelId(modelId) {
  return modelId && typeof modelId === 'string' && /^[a-zA-Z0-9_-]+$/.test(modelId);
}

function register(dashboardApp) {
  dashboardApp.addRoute('GET', '/dashboard/api/specialized/models', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    try {
      const models = await knowledgeStore.listModels();
      const result = [];
      for (const id of models) {
        const index = await knowledgeStore.getIndex(id);
        const sourceFiles = await knowledgeStore.listSourceFiles(id);
        result.push({
          id,
          chunkCount: index.chunkCount || 0,
          totalTokens: index.totalTokens || 0,
          lastBuilt: index.lastBuilt || null,
          sourceFiles: sourceFiles || [],
        });
      }
      dashboardApp.sendJson(res, 200, { ok: true, data: result });
    } catch (err) {
      dashboardApp.sendError(res, 500, err.message);
    }
  });

  dashboardApp.addRoute('GET', '/dashboard/api/specialized/stats', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    try {
      const models = await knowledgeStore.listModels();
      const result = [];
      for (const id of models) {
        const index = await knowledgeStore.getIndex(id);
        result.push({
          id,
          chunkCount: index.chunkCount || 0,
          totalTokens: index.totalTokens || 0,
          lastBuilt: index.lastBuilt || null,
          hasEmbeddings: (index.chunks || []).some(c => c.embedding && c.embedding.length > 0),
        });
      }
      const metrics = globalMetrics.getStats();
      dashboardApp.sendJson(res, 200, { ok: true, data: { models: result, metrics } });
    } catch (err) {
      dashboardApp.sendError(res, 500, err.message);
    }
  });

  dashboardApp.addRoute('POST', '/dashboard/api/specialized/build', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    const { modelId } = req.body || {};
    if (!isValidModelId(modelId)) { dashboardApp.sendError(res, 400, 'Invalid modelId'); return; }
    try {
      const result = await specializedService.buildKnowledge(modelId);
      dashboardApp.sendJson(res, 200, { ok: result.ok, data: result });
    } catch (err) {
      dashboardApp.sendError(res, 500, err.message);
    }
  });

  dashboardApp.addRoute('POST', '/dashboard/api/specialized/rebuild-all', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    try {
      const results = await specializedService.rebuildAllKnowledge();
      dashboardApp.sendJson(res, 200, { ok: true, data: results });
    } catch (err) {
      dashboardApp.sendError(res, 500, err.message);
    }
  });

  dashboardApp.addRoute('POST', '/dashboard/api/specialized/upload', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    const { modelId, filename, content } = req.body || {};
    if (!isValidModelId(modelId) || !filename || content === undefined) {
      dashboardApp.sendError(res, 400, 'modelId, filename, and content are required');
      return;
    }
    if (!filename.endsWith('.md') && !filename.endsWith('.txt')) {
      dashboardApp.sendError(res, 400, 'Only .md and .txt files are supported');
      return;
    }
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      dashboardApp.sendError(res, 400, 'Invalid filename');
      return;
    }
    try {
      const result = await knowledgeStore.saveSourceFile(modelId, filename, content);
      if (!result.ok) { dashboardApp.sendError(res, 400, result.error); return; }
      dashboardApp.sendJson(res, 200, { ok: true, data: { filename } });
    } catch (err) {
      dashboardApp.sendError(res, 500, err.message);
    }
  });

  dashboardApp.addRoute('DELETE', '/dashboard/api/specialized/upload', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    const { modelId, filename } = req.body || {};
    if (!isValidModelId(modelId) || !filename) { dashboardApp.sendError(res, 400, 'modelId and filename are required'); return; }
    try {
      const deleted = await knowledgeStore.deleteSourceFile(modelId, filename);
      dashboardApp.sendJson(res, 200, { ok: deleted });
    } catch (err) {
      dashboardApp.sendError(res, 500, err.message);
    }
  });

  dashboardApp.addRoute('GET', '/dashboard/api/specialized/source', async (req, res) => {
    if (!isAdmin(req)) { dashboardApp.sendError(res, 403, 'Forbidden'); return; }
    const url = new URL(req.url, 'http://localhost');
    const modelId = url.searchParams.get('modelId');
    const filename = url.searchParams.get('filename');
    if (!isValidModelId(modelId) || !filename) {
      dashboardApp.sendError(res, 400, 'modelId and filename are required');
      return;
    }
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      dashboardApp.sendError(res, 400, 'Invalid filename');
      return;
    }
    try {
      const content = await knowledgeStore.getSourceContent(modelId, filename);
      if (content === null) { dashboardApp.sendError(res, 404, 'File not found'); return; }
      dashboardApp.sendJson(res, 200, { ok: true, data: { filename, content } });
    } catch (err) {
      dashboardApp.sendError(res, 500, err.message);
    }
  });
}

module.exports = { register };
