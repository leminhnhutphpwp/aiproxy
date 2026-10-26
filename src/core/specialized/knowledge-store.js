const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const SPECIALIZED_DIR = path.join(__dirname, '..', '..', '..', 'config', 'specialized');
const _indexCache = new Map();

function safePath(base, ...parts) {
  const resolved = path.resolve(base, ...parts);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

function sanitizeModelId(modelId) {
  if (!modelId || typeof modelId !== 'string') throw new Error('Invalid modelId');
  const sanitized = modelId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitized) throw new Error('Invalid modelId after sanitization');
  return sanitized;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function ensureDirAsync(dir) {
  await fsp.mkdir(dir, { recursive: true }).catch(() => {});
}

function modelDir(modelId) {
  return safePath(SPECIALIZED_DIR, modelId);
}

function sourceDir(modelId) {
  return safePath(SPECIALIZED_DIR, modelId, 'source');
}

function indexFile(modelId) {
  return safePath(SPECIALIZED_DIR, modelId, 'index.json');
}

async function atomicWrite(filepath, data) {
  const tmp = filepath + '.tmp.' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(tmp, data, 'utf8');
  await fsp.rename(tmp, filepath);
}

async function listModels() {
  await ensureDirAsync(SPECIALIZED_DIR);
  try {
    const entries = await fsp.readdir(SPECIALIZED_DIR, { withFileTypes: true });
    return entries.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return [];
  }
}

function listModelsSync() {
  ensureDir(SPECIALIZED_DIR);
  try {
    return fs.readdirSync(SPECIALIZED_DIR).filter(d => {
      return fs.statSync(path.join(SPECIALIZED_DIR, d)).isDirectory();
    });
  } catch {
    return [];
  }
}

async function getIndex(modelId) {
  const cached = _indexCache.get(modelId);
  if (cached) return cached;
  try {
    const data = JSON.parse(await fsp.readFile(indexFile(modelId), 'utf8'));
    _indexCache.set(modelId, data);
    return data;
  } catch {
    return { modelId, chunkCount: 0, totalTokens: 0, lastBuilt: null, chunks: [] };
  }
}

function getIndexSync(modelId) {
  const cached = _indexCache.get(modelId);
  if (cached) return cached;
  try {
    const data = JSON.parse(fs.readFileSync(indexFile(modelId), 'utf8'));
    _indexCache.set(modelId, data);
    return data;
  } catch {
    return { modelId, chunkCount: 0, totalTokens: 0, lastBuilt: null, chunks: [] };
  }
}

async function saveIndex(modelId, index) {
  const dir = modelDir(modelId);
  await ensureDirAsync(dir);
  await atomicWrite(indexFile(modelId), JSON.stringify(index, null, 2));
  _indexCache.set(modelId, index);
}

async function getChunks(modelId) {
  const index = await getIndex(modelId);
  return index.chunks || [];
}

async function saveChunks(modelId, chunks) {
  const index = (await getIndex(modelId));
  index.chunks = chunks;
  index.chunkCount = chunks.length;
  index.totalTokens = chunks.reduce((sum, c) => sum + (c.tokens || 0), 0);
  index.lastBuilt = new Date().toISOString();
  await saveIndex(modelId, index);
}

async function listSourceFiles(modelId) {
  const dir = sourceDir(modelId);
  await ensureDirAsync(dir);
  try {
    const files = await fsp.readdir(dir);
    return files.filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  } catch {
    return [];
  }
}

async function listSourceFilesWithHash(modelId) {
  const dir = sourceDir(modelId);
  await ensureDirAsync(dir);
  try {
    const files = await fsp.readdir(dir);
    const result = [];
    for (const f of files) {
      if (!f.endsWith('.md') && !f.endsWith('.txt')) continue;
      try {
        const stat = await fsp.stat(path.join(dir, f));
        const content = await fsp.readFile(path.join(dir, f), 'utf8');
        const hash = crypto.createHash('md5').update(content, 'utf8').digest('hex');
        result.push({ filename: f, mtimeMs: stat.mtimeMs, size: stat.size, hash });
      } catch {}
    }
    return result;
  } catch {
    return [];
  }
}

async function getSourceContent(modelId, filename) {
  const dir = sourceDir(modelId);
  try {
    const filepath = safePath(dir, filename);
    return await fsp.readFile(filepath, 'utf8');
  } catch {
    return null;
  }
}

function getSourceContentSync(modelId, filename) {
  const dir = sourceDir(modelId);
  try {
    const filepath = safePath(dir, filename);
    return fs.readFileSync(filepath, 'utf8');
  } catch {
    return null;
  }
}

async function saveSourceFile(modelId, filename, content) {
  const dir = sourceDir(modelId);
  await ensureDirAsync(dir);
  const filepath = safePath(dir, filename);
  if (content.length > 10 * 1024 * 1024) {
    return { ok: false, error: 'File too large (max 10MB)' };
  }
  await fsp.writeFile(filepath, content, 'utf8');
  _indexCache.delete(modelId);
  return { ok: true };
}

async function deleteSourceFile(modelId, filename) {
  try {
    const dir = sourceDir(modelId);
    const filepath = safePath(dir, filename);
    await fsp.unlink(filepath);
    _indexCache.delete(modelId);
    return true;
  } catch {
    return false;
  }
}

function clearCache() {
  _indexCache.clear();
}

function fileHash(content) {
  return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

module.exports = {
  listModels,
  listModelsSync,
  getIndex,
  getIndexSync,
  saveIndex,
  getChunks,
  saveChunks,
  listSourceFiles,
  listSourceFilesWithHash,
  getSourceContent,
  getSourceContentSync,
  saveSourceFile,
  deleteSourceFile,
  clearCache,
  modelDir,
  sanitizeModelId,
  fileHash,
};
