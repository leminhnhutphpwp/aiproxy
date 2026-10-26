const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEMORIES_DIR = path.join(__dirname, '..', '..', '..', 'config', 'memories');
const locks = new Map();
const _memoryCache = new Map();
const MEMORY_CACHE_TTL = 30000;

function ensureDir() {
  if (!fs.existsSync(MEMORIES_DIR)) {
    fs.mkdirSync(MEMORIES_DIR, { recursive: true });
  }
}

async function withLock(userId, fn) {
  while (locks.get(userId)) {
    await new Promise(r => setTimeout(r, 5));
  }
  locks.set(userId, true);
  try {
    return await fn();
  } finally {
    locks.delete(userId);
  }
}

function userFilePath(userId) {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(MEMORIES_DIR, `${safe}.json`);
}

function loadMemories(userId) {
  ensureDir();
  const now = Date.now();
  const cached = _memoryCache.get(userId);
  if (cached && (now - cached.timestamp) < MEMORY_CACHE_TTL) return cached.memories;
  const filePath = userFilePath(userId);
  try {
    const memories = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    _memoryCache.set(userId, { memories, timestamp: now });
    return memories;
  } catch {
    return [];
  }
}

function saveMemories(userId, memories) {
  ensureDir();
  const now = Date.now();
  const maxAge = 90 * 24 * 60 * 60 * 1000;
  for (const m of memories) {
    if (!m.is_active) continue;
    const lastUse = m.last_used_at ? new Date(m.last_used_at).getTime() : m.created_at ? new Date(m.created_at).getTime() : 0;
    if (now - lastUse > maxAge) m.is_active = 0;
  }
  const filePath = userFilePath(userId);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(memories, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
  _memoryCache.set(userId, { memories, timestamp: now });
}

function wordOverlapRatio(a, b) {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) { if (wb.has(w)) overlap++; }
  const maxLen = Math.max(wa.size, wb.size);
  return overlap / maxLen;
}

async function add(userId, { content, category = 'fact', source = 'extracted', confidence = 0.8, tags = [] }) {
  return withLock(userId, () => {
    const memories = loadMemories(userId);
    const existing = memories.find(m => {
      if (m.content.toLowerCase() === content.toLowerCase()) return true;
      return wordOverlapRatio(m.content, content) >= 0.6;
    });
    if (existing) {
      existing.updated_at = new Date().toISOString();
      existing.use_count = (existing.use_count || 0) + 1;
      existing.confidence = Math.min(1, existing.confidence + 0.05);
      saveMemories(userId, memories);
      return existing;
    }

    const memory = {
      id: crypto.randomUUID(),
      user_id: userId,
      content,
      category,
      source,
      confidence,
      verified: false,
      verified_at: null,
      tags,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_used_at: null,
      use_count: 0,
      token_count: content.split(/\s+/).length,
      is_active: 1,
    };
    memories.push(memory);
    saveMemories(userId, memories);
    return memory;
  });
}

async function get(userId, id) {
  return withLock(userId, () => {
    const memories = loadMemories(userId);
    return memories.find(m => m.id === id) || null;
  });
}

async function getAll(userId, filters = {}) {
  return withLock(userId, () => {
    let memories = loadMemories(userId);
    if (filters.category) {
      memories = memories.filter(m => m.category === filters.category);
    }
    if (filters.is_active !== undefined) {
      memories = memories.filter(m => m.is_active === filters.is_active);
    }
    if (filters.confidence_min !== undefined) {
      memories = memories.filter(m => m.confidence >= filters.confidence_min || m.verified === true);
    }
    return memories;
  });
}

function getAllSync(userId, filters = {}) {
  let memories = loadMemories(userId);
  if (filters.category) {
    memories = memories.filter(m => m.category === filters.category);
  }
  if (filters.is_active !== undefined) {
    memories = memories.filter(m => m.is_active === filters.is_active);
  }
  if (filters.confidence_min !== undefined) {
    memories = memories.filter(m => m.confidence >= filters.confidence_min || m.verified === true);
  }
  return memories;
}

async function update(userId, id, updates) {
  return withLock(userId, () => {
    const memories = loadMemories(userId);
    const idx = memories.findIndex(m => m.id === id);
    if (idx === -1) return null;
    memories[idx] = { ...memories[idx], ...updates, updated_at: new Date().toISOString() };
    saveMemories(userId, memories);
    return memories[idx];
  });
}

async function batchUpdate(userId, updateList) {
  return withLock(userId, () => {
    const memories = loadMemories(userId);
    for (const { id, updates } of updateList) {
      const idx = memories.findIndex(m => m.id === id);
      if (idx !== -1) {
        Object.assign(memories[idx], updates);
        memories[idx].updated_at = new Date().toISOString();
      }
    }
    saveMemories(userId, memories);
  });
}

async function remove(userId, id) {
  return withLock(userId, () => {
    const memories = loadMemories(userId);
    const idx = memories.findIndex(m => m.id === id);
    if (idx === -1) return false;
    memories.splice(idx, 1);
    saveMemories(userId, memories);
    return true;
  });
}

async function clearAll(userId) {
  const filePath = userFilePath(userId);
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getStats(userId) {
  return withLock(userId, () => {
    const memories = loadMemories(userId);
    const active = memories.filter(m => m.is_active);
    const totalTokens = active.reduce((sum, m) => sum + (m.token_count || 0), 0);
    const categoryBreakdown = {};
    for (const m of active) {
      categoryBreakdown[m.category] = (categoryBreakdown[m.category] || 0) + 1;
    }
    return {
      total: memories.length,
      active: active.length,
      totalTokens,
      categoryBreakdown,
    };
  });
}

function getAllUserIds() {
  ensureDir();
  try {
    const files = fs.readdirSync(MEMORIES_DIR);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  } catch {
    return [];
  }
}

module.exports = { add, get, getAll, getAllSync, update, batchUpdate, remove, clearAll, getStats, getAllUserIds };
