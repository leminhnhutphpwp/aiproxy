const store = require('./store');
const { sanitizeMemoryInjection } = require('../sanitizer');
const { countTokens } = require('../token-optimizer');

function scoreMemory(memory, query) {
  let score = 0;
  const memLower = (memory.content || '').toLowerCase();
  const queryLower = (query || '').toLowerCase();

  const queryWords = new Set(queryLower.split(/\s+/));
  const memWords = new Set(memLower.split(/\s+/));
  let overlap = 0;
  for (const w of queryWords) {
    if (memWords.has(w)) overlap++;
  }
  score += overlap * 2;

  for (const w of queryWords) {
    if (w.length > 2 && memLower.includes(w)) {
      score += 0.5;
    }
  }

  const age = Date.now() - new Date(memory.updated_at).getTime();
  const daysSinceUpdate = age / (1000 * 60 * 60 * 24);
  score += Math.max(0, 5 - daysSinceUpdate);

  score += Math.min(memory.use_count || 0, 10) * 0.3;

  score *= (memory.confidence || 0.5);

  return score;
}

async function search(userId, query, maxTokens = 500) {
  const memories = await store.getAll(userId, { is_active: 1 });
  const filtered = memories.filter(m => m.confidence >= 0.6 || m.verified === true);

  const scored = filtered.map(m => ({
    ...m,
    score: scoreMemory(m, query),
  }));
  scored.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return b.score - a.score;
  });

  const selected = [];
  let totalTokens = 0;
  const now = new Date().toISOString();

  for (const m of scored) {
    if (m.score <= 0) continue;
    const tokens = countTokens(m.content);
    if (totalTokens + tokens > maxTokens) continue;
    selected.push(m);
    totalTokens += tokens;
    m.last_used_at = now;
    m.use_count = (m.use_count || 0) + 1;
  }

  if (selected.length > 0) {
    await store.batchUpdate(userId, selected.map(m => ({
      id: m.id,
      updates: { last_used_at: now, use_count: m.use_count },
    })));
  }

  return {
    memories: selected,
    totalTokens,
    count: selected.length,
    budget: maxTokens,
  };
}

async function buildMemoryContext(userId, query, maxTokens = 500) {
  const result = await search(userId, query, maxTokens);
  if (result.memories.length === 0) return null;

  const context = result.memories.map(m => `- ${sanitizeMemoryInjection(m.content)}`).join('\n');
  return {
    text: `\nUser context:\n${context}`,
    stats: {
      count: result.count,
      tokens: result.totalTokens,
      budget: result.budget,
    },
  };
}

function searchSync(userId, query, maxTokens = 500) {
  const memories = store.getAllSync(userId, { is_active: 1 });

  const filtered = memories.filter(m => m.confidence >= 0.6 || m.verified === true);

  const scored = filtered.map(m => ({
    ...m,
    score: scoreMemory(m, query),
  }));
  scored.sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return b.score - a.score;
  });

  const selected = [];
  let totalTokens = 0;
  for (const m of scored) {
    if (m.score <= 0) continue;
    const tokens = countTokens(m.content);
    if (totalTokens + tokens > maxTokens) continue;
    selected.push(m);
    totalTokens += tokens;
  }

  return { memories: selected, totalTokens, count: selected.length, budget: maxTokens };
}

function buildMemoryContextSync(userId, query, maxTokens = 500) {
  const result = searchSync(userId, query, maxTokens);
  if (result.memories.length === 0) return null;
  const context = result.memories.map(m => `- ${sanitizeMemoryInjection(m.content)}`).join('\n');
  return {
    text: `\nUser context:\n${context}`,
    stats: { count: result.count, tokens: result.totalTokens, budget: result.budget },
  };
}

module.exports = { search, searchSync, buildMemoryContext, buildMemoryContextSync, scoreMemory };
