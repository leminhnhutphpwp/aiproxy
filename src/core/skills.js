const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SKILLS_DIR = path.join(__dirname, '..', '..', 'config', 'skills');

const _metaCache = new Map();
const _contentCache = new Map();
let _indexCache = null;

function ensureDir() {
  if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function indexFilePath() {
  return path.join(SKILLS_DIR, 'index.json');
}

function skillDir(skillId) {
  return path.join(SKILLS_DIR, skillId);
}

function skillMetaPath(skillId) {
  return path.join(skillDir(skillId), 'skill.json');
}

function skillContentPath(skillId) {
  return path.join(skillDir(skillId), 'SKILL.md');
}

function loadIndex() {
  ensureDir();
  try {
    const fp = indexFilePath();
    const stat = fs.statSync(fp);
    if (_indexCache && _indexCache.mtime === stat.mtimeMs) return _indexCache.data;
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    _indexCache = { data, mtime: stat.mtimeMs };
    return data;
  } catch {
    return { version: '1.0.0', skills: [] };
  }
}

function saveIndex(index) {
  ensureDir();
  fs.writeFileSync(indexFilePath(), JSON.stringify(index, null, 2), 'utf8');
  _indexCache = null;
}

function loadSkillMeta(skillId) {
  try {
    const fp = skillMetaPath(skillId);
    const stat = fs.statSync(fp);
    const cached = _metaCache.get(skillId);
    if (cached && cached.mtime === stat.mtimeMs) return cached.data;
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    _metaCache.set(skillId, { data, mtime: stat.mtimeMs });
    return data;
  } catch {
    return null;
  }
}

function loadSkillContent(skillId) {
  try {
    const fp = skillContentPath(skillId);
    const stat = fs.statSync(fp);
    const cached = _contentCache.get(skillId);
    if (cached && cached.mtime === stat.mtimeMs) return cached.data;
    const data = fs.readFileSync(fp, 'utf8');
    _contentCache.set(skillId, { data, mtime: stat.mtimeMs });
    return data;
  } catch {
    return '';
  }
}

function saveSkillMeta(skillId, meta) {
  const dir = skillDir(skillId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(skillMetaPath(skillId), JSON.stringify(meta, null, 2), 'utf8');
  _metaCache.delete(skillId);
}

function saveSkillContent(skillId, content) {
  const dir = skillDir(skillId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(skillContentPath(skillId), content, 'utf8');
  _contentCache.delete(skillId);
}

function generateMetadata(name, content, source) {
  const contentLower = content.toLowerCase();
  const categories = ['coding', 'deployment', 'security', 'architecture', 'workflow', 'general'];
  const categoryKeywords = {
    coding: ['code', 'function', 'class', 'api', 'component', 'typescript', 'javascript', 'python', 'react', 'node', 'app', 'route', 'layout', 'import', 'export', 'string', 'array', 'object', 'async', 'await', 'error', 'debug', 'test', 'build'],
    deployment: ['docker', 'kubernetes', 'deploy', 'ci/cd', 'pipeline', 'pm2', 'server', 'port', 'nginx', 'cloud', 'aws', 'gcp', 'azure'],
    security: ['auth', 'token', 'password', 'secret', 'key', 'encrypt', 'http', 'cors', 'csrf', 'xss', 'sql', 'injection', 'safe'],
    architecture: ['architecture', 'pattern', 'design', 'microservice', 'monolith', 'layer', 'module', 'dependency', 'inject', 'event', 'queue'],
    workflow: ['workflow', 'task', 'process', 'script', 'automate', 'deploy', 'build', 'test', 'lint', 'format'],
  };
  let bestCategory = 'general';
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    const score = keywords.filter(k => contentLower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he', 'she', 'him', 'her', 'his']);
  const words = contentLower.split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const tags = sorted.slice(0, 6).map(e => e[0].toLowerCase());
  const tokenEstimate = Math.ceil(content.length / 4);
  return {
    name: name || 'Untitled Skill',
    description: tags.slice(0, 3).join(', ') || 'No description',
    category: bestCategory,
    tags: tags,
    tokenEstimate: Math.min(tokenEstimate, 8000),
    source: source || '',
  };
}

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? require('https') : require('http');
    proto.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function importSkill(type, source, customName) {
  let content = '';
  let name = customName || '';
  let importSource = '';
  if (type === 'url') {
    content = await fetchUrl(source);
    importSource = source;
    if (!name) {
      try {
        const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) name = titleMatch[1].trim();
      } catch {}
    }
  } else if (type === 'github') {
    const parts = source.replace('https://github.com/', '').split('/');
    const owner = parts[0];
    const repo = parts[1];
    const rawUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/README.md';
    content = await fetchUrl(rawUrl);
    importSource = source;
    if (!name) name = repo || '';
  } else if (type === 'text') {
    content = source;
    importSource = 'manual';
  } else {
    throw new Error('Invalid import type: ' + type + '. Use "url", "github", or "text".');
  }
  if (content.length < 10) throw new Error('Content too short (min 10 chars)');
  return { content, name, importSource };
}

function generateSkillId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skill';
  let id = base;
  let counter = 1;
  while (fs.existsSync(skillDir(id))) {
    id = base + '-' + counter;
    counter++;
  }
  return id;
}

async function createSkill(type, source, customName) {
  const imported = await importSkill(type, source, customName);
  const metadata = generateMetadata(imported.name, imported.content, imported.importSource);
  const skillId = generateSkillId(metadata.name);
  const now = new Date().toISOString();
  const meta = {
    id: skillId,
    name: metadata.name,
    description: metadata.description,
    category: metadata.category,
    tags: metadata.tags,
    version: '1.0.0',
    author: 'admin',
    tokenEstimate: metadata.tokenEstimate,
    createdAt: now,
    updatedAt: now,
    source: metadata.source,
  };
  saveSkillMeta(skillId, meta);
  saveSkillContent(skillId, imported.content);
  const index = loadIndex();
  index.skills.push({
    id: skillId,
    name: meta.name,
    category: meta.category,
    tags: meta.tags,
    tokenEstimate: meta.tokenEstimate,
  });
  saveIndex(index);
  return { meta, content: imported.content };
}

function getAll() {
  const index = loadIndex();
  return index.skills.map(s => {
    const meta = loadSkillMeta(s.id);
    return meta || s;
  });
}

function getPaginated({ page = 1, limit = 16, search = '', category = 'all' } = {}) {
  let skills = getAll();
  if (category && category !== 'all') {
    skills = skills.filter(s => s.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    skills = skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }
  const total = skills.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const paged = skills.slice(start, start + limit);
  return { data: paged, total, page: safePage, limit, totalPages };
}

function getSkill(skillId) {
  const meta = loadSkillMeta(skillId);
  if (!meta) return null;
  const content = loadSkillContent(skillId);
  return { ...meta, content };
}

function updateSkill(skillId, updates) {
  const meta = loadSkillMeta(skillId);
  if (!meta) return null;
  const changed = {};
  if (updates.name !== undefined) changed.name = updates.name;
  if (updates.description !== undefined) changed.description = updates.description;
  if (updates.category !== undefined) changed.category = updates.category;
  if (updates.tags !== undefined) changed.tags = updates.tags;
  if (updates.tokenEstimate !== undefined) changed.tokenEstimate = updates.tokenEstimate;
  if (updates.source !== undefined) changed.source = updates.source;
  if (updates.content !== undefined) {
    saveSkillContent(skillId, updates.content);
    changed.tokenEstimate = Math.min(Math.ceil(updates.content.length / 4), 8000);
  }
  Object.assign(meta, changed, { updatedAt: new Date().toISOString() });
  saveSkillMeta(skillId, meta);
  const index = loadIndex();
  const entry = index.skills.find(s => s.id === skillId);
  if (entry) {
    if (meta.name) entry.name = meta.name;
    if (meta.category) entry.category = meta.category;
    if (meta.tags) entry.tags = meta.tags;
    if (meta.tokenEstimate) entry.tokenEstimate = meta.tokenEstimate;
    saveIndex(index);
  }
  const content = loadSkillContent(skillId);
  return { ...meta, content };
}

function deleteSkill(skillId) {
  const meta = loadSkillMeta(skillId);
  if (!meta) return false;
  const dir = skillDir(skillId);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  _metaCache.delete(skillId);
  _contentCache.delete(skillId);
  const index = loadIndex();
  index.skills = index.skills.filter(s => s.id !== skillId);
  saveIndex(index);
  return true;
}

function matchSkills(skillIds, messages, tokenBudget) {
  const messageText = (messages || []).map(m => {
    if (typeof m.content === 'string') return m.content;
    return '';
  }).join(' ').toLowerCase();
  const scored = [];
  for (const skillId of skillIds) {
    const meta = loadSkillMeta(skillId);
    if (!meta) continue;
    const content = loadSkillContent(skillId);
    const matchCount = (meta.tags || []).filter(tag =>
      messageText.includes(tag.toLowerCase())
    ).length;
    const contentOverlap = content.toLowerCase().split(/\W+/).filter(w =>
      w.length > 3 && messageText.includes(w)
    ).length;
    scored.push({
      id: skillId,
      name: meta.name,
      category: meta.category,
      tags: meta.tags,
      tokenEstimate: meta.tokenEstimate || Math.ceil(content.length / 4),
      content,
      score: matchCount + Math.min(contentOverlap, 5),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const selected = [];
  let totalTokens = 0;
  for (const skill of scored) {
    if (skill.score === 0 && selected.length > 0) break;
    if (totalTokens + skill.tokenEstimate <= tokenBudget) {
      selected.push(skill);
      totalTokens += skill.tokenEstimate;
    }
  }
  return { selected, totalTokens };
}

function buildSkillsContext(skills) {
  if (skills.length === 0) return null;
  const context = skills.map(s =>
    '### ' + s.name + '\n' + s.content
  ).join('\n\n');
  return {
    text: '\n## Active Skills\n' + context,
    tokens: skills.reduce((sum, s) => sum + (s.tokenEstimate || Math.ceil(s.content.length / 4)), 0),
    count: skills.length,
  };
}

const skillsService = {
  createSkill,
  getAll,
  getPaginated,
  getSkill,
  updateSkill,
  deleteSkill,
  matchSkills,
  buildSkillsContext,
  importSkill,
};

module.exports = skillsService;
