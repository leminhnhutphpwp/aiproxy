const embeddings = require('./embeddings');

async function rerank(query, chunks, config = {}) {
  if (!chunks || chunks.length <= 1) return chunks;

  const maxChunks = config.maxChunks || 5;
  const useCrossEncoder = config.crossEncoderUrl && config.crossEncoderApiKey;

  if (useCrossEncoder) {
    try {
      return await crossEncoderRerank(query, chunks, config);
    } catch (e) {
      console.error('[Specialized] Cross-encoder rerank failed:', e.message);
    }
  }

  return heuristicRerank(query, chunks, maxChunks);
}

async function crossEncoderRerank(query, chunks, config) {
  const pairs = chunks.map(c => [query, c.content]);
  const https = require('https');
  const http = require('http');

  const url = new URL(config.crossEncoderUrl);
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;

  const body = JSON.stringify({
    model: config.crossEncoderModel || 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    query,
    passages: chunks.map(c => c.content),
  });

  return new Promise((resolve, reject) => {
    const req = mod.request(config.crossEncoderUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.crossEncoderApiKey,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let scores = [];
          if (Array.isArray(parsed)) {
            scores = parsed;
          } else if (parsed.scores) {
            scores = parsed.scores;
          } else if (parsed.results) {
            scores = parsed.results.map(r => r.score);
          }

          const scored = chunks.map((c, i) => ({
            ...c,
            score: scores[i] != null ? scores[i] : c.score || 0,
          }));
          scored.sort((a, b) => b.score - a.score);
          resolve(scored.slice(0, config.maxChunks || chunks.length));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Cross-encoder timeout'));
    });
    req.write(body);
    req.end();
  });
}

function heuristicRerank(query, chunks, maxChunks) {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\W+/).filter(w => w.length > 2);

  const scored = chunks.map((chunk, idx) => {
    let score = chunk.score || 0;

    const chunkLower = chunk.content.toLowerCase();
    let exactMatchBoost = 0;
    for (const w of queryWords) {
      const regex = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      const matches = chunkLower.match(regex);
      if (matches) exactMatchBoost += matches.length * 0.05;
    }

    const posPenalty = idx < chunks.length * 0.3 ? 0.05 : 0;
    const isFirst = chunk.lineStart === 0 || chunk.lineStart <= 1 ? 0.05 : 0;

    score += exactMatchBoost + posPenalty + isFirst;
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxChunks);
}

function deduplicateChunks(chunks, threshold = 0.9) {
  if (chunks.length <= 1) return chunks;

  const result = [];
  for (const chunk of chunks) {
    let isDuplicate = false;
    for (const existing of result) {
      const sim = textSimilarity(chunk.content, existing.content);
      if (sim > threshold) {
        isDuplicate = true;
        if (chunk.score > existing.score) {
          existing.score = chunk.score;
          existing.source = chunk.source;
        }
        break;
      }
    }
    if (!isDuplicate) result.push(chunk);
  }
  return result;
}

function textSimilarity(a, b) {
  const aWords = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  const bWords = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
  if (aWords.size === 0 || bWords.size === 0) return 0;

  let intersection = 0;
  for (const w of aWords) {
    if (bWords.has(w)) intersection++;
  }
  return intersection / Math.min(aWords.size, bWords.size);
}

module.exports = { rerank, deduplicateChunks, heuristicRerank, textSimilarity };
