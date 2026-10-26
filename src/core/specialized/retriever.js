const embeddings = require('./embeddings');
const knowledgeStore = require('./knowledge-store');
const bm25 = require('./bm25');

function isApiKeyAvailable() {
  return !!(process.env.EMBEDDING_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY);
}

function detectQueryIntent(query) {
  if (!query) return 'concept';
  const q = query.toLowerCase().trim();

  const codePatterns = /\b(code|function|class|method|variable|import|export|const|let|var|async|await|register_|wp_|get_|add_|hook|filter|action|shortcode|cpt|taxonom|meta_box)\b/;
  if (codePatterns.test(q) || /`[a-z_]/.test(q)) {
    return 'code';
  }

  const tablePatterns = /\b(table|column|schema|field|column|row|format|database table)\b/;
  if (tablePatterns.test(q)) {
    return 'table';
  }

  const howPatterns = /\b(how to|how do|steps|guide|tutorial|pattern)\b/;
  if (howPatterns.test(q)) {
    return 'howto';
  }

  return 'concept';
}

function applyTypeBoost(chunks, intent) {
  const boostMap = {
    code: { code: 0.3, 'inline-code': 0.2, table: 0.05, heading: 0, paragraph: 0 },
    table: { table: 0.3, code: 0.1, 'inline-code': 0.05, heading: 0, paragraph: 0 },
    howto: { heading: 0.15, code: 0.1, 'inline-code': 0.05, paragraph: 0.05, table: 0 },
    concept: { heading: 0.1, paragraph: 0.05, 'inline-code': 0, code: 0, table: 0 },
  };

  const boosts = boostMap[intent] || boostMap.concept;
  return chunks.map(chunk => {
    const boost = boosts[chunk.primaryType] || 0;
    return { ...chunk, score: chunk.score + boost };
  });
}

async function retrieve(modelId, query, config) {
  if (!query || query.trim().length === 0) return [];

  const maxChunks = config.maxChunks || 5;
  const relevanceThreshold = config.relevanceThreshold || 0.3;
  const semanticWeight = config.semanticWeight != null ? config.semanticWeight : 0.7;
  const chunks = await knowledgeStore.getChunks(modelId);

  if (chunks.length === 0) return [];
  if (chunks.length <= maxChunks) return chunks.map(c => ({ ...c, score: 1 }));

  const intent = detectQueryIntent(query);

  let semanticResults = null;
  let bm25Results = null;
  let hasSemantic = false;

  if (isApiKeyAvailable()) {
    try {
      const queryVector = await embeddings.generateQueryEmbedding(query);
      if (queryVector) {
        const scored = chunks.map(chunk => ({
          ...chunk,
          score: embeddings.cosineSimilarity(queryVector, chunk.embedding),
        }));
        scored.sort((a, b) => b.score - a.score);
        const boosted = applyTypeBoost(scored, intent);
        const filtered = boosted.filter(c => c.score >= relevanceThreshold);
        semanticResults = filtered.length > 0
          ? filtered.slice(0, maxChunks)
          : boosted.slice(0, 2).map(c => ({ ...c, score: Math.max(c.score, 0.1) }));
        hasSemantic = true;
      }
    } catch (e) {
      console.error('[Specialized] Semantic retrieval error:', e.message);
    }
  }

  try {
    const chunkTokens = bm25.prepareChunkTokens(chunks);
    bm25Results = bm25.bm25Search(query, chunkTokens, maxChunks);
    if (bm25Results) {
      bm25Results = applyTypeBoost(bm25Results, intent);
    }
  } catch (e) {
    console.error('[Specialized] BM25 error:', e.message);
    bm25Results = bm25.wordOverlapSearch(query, chunks, maxChunks);
    if (bm25Results) {
      bm25Results = applyTypeBoost(bm25Results, intent);
    }
  }

  if (!semanticResults || semanticResults.length === 0) {
    if (bm25Results && bm25Results.length > 0) return bm25Results;
    const fallback = bm25.wordOverlapSearch(query, chunks, maxChunks);
    return applyTypeBoost(fallback, intent);
  }

  if (!bm25Results || bm25Results.length === 0) return semanticResults;

  const hybridMap = new Map();
  const seen = new Set();

  const maxScore = Math.max(
    semanticResults[0]?.score || 0.01,
    bm25Results[0]?.score || 0.01,
  );

  for (const chunk of semanticResults) {
    hybridMap.set(chunk.id || chunk.content, {
      ...chunk,
      semanticScore: chunk.score,
      bm25Score: 0,
      score: chunk.score * semanticWeight,
    });
    seen.add(chunk.id || chunk.content);
  }

  for (const chunk of bm25Results) {
    const key = chunk.id || chunk.content;
    if (seen.has(key)) {
      const existing = hybridMap.get(key);
      existing.bm25Score = chunk.score / maxScore;
      existing.score = (existing.semanticScore * semanticWeight) + (existing.bm25Score * (1 - semanticWeight));
    } else {
      hybridMap.set(key, {
        ...chunk,
        semanticScore: 0,
        bm25Score: chunk.score / maxScore,
        score: chunk.score / maxScore * (1 - semanticWeight),
      });
    }
  }

  const results = Array.from(hybridMap.values());
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxChunks);
}

module.exports = { retrieve };
