const https = require('https');
const http = require('http');
const EmbeddingCache = require('./embedding-cache');

const embeddingCache = new EmbeddingCache();

const BATCH_SIZE = 20;  // Reduced from 256 for NVIDIA API compatibility
const REQUEST_TIMEOUT = 60000;

function fetchJson(url, options, timeout) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const mod = isHttps ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout || REQUEST_TIMEOUT, () => {
      req.destroy(new Error('Request timeout'));
    });
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : String(options.body));
    }
    req.end();
  });
}

const PROVIDERS = {
  nvidia: {
    baseURL: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/nv-embed-v1',
    dimensions: 4096,
    supportsEncodingFormat: false,
    async embed(texts, apiKey) {
      const body = { input: texts, model: this.model };
      const res = await fetchJson(this.baseURL + '/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 200) {
        const rawInfo = res.raw ? res.raw.slice(0, 500) : '';
        const msg = res.data?.error?.message || res.data?.message || JSON.stringify(res.data);
        throw new Error('NVIDIA embedding error (' + res.status + '): ' + msg + ' | raw: ' + rawInfo);
      }
      return res.data.data.map(item => item.embedding);
    },
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small',
    dimensions: 1536,
    supportsEncodingFormat: true,
    async embed(texts, apiKey) {
      const body = { input: texts, model: this.model, encoding_format: 'float' };
      const res = await fetchJson(this.baseURL + '/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 200) {
        const msg = res.data?.error?.message || res.data?.message || JSON.stringify(res.data);
        throw new Error('OpenAI embedding error: ' + msg);
      }
      return res.data.data.map(item => item.embedding);
    },
  },
};

const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY || '';

let activeProvider = 'nvidia';
if (process.env.EMBEDDING_PROVIDER && PROVIDERS[process.env.EMBEDDING_PROVIDER]) {
  activeProvider = process.env.EMBEDDING_PROVIDER;
}

function getActiveProvider() {
  return PROVIDERS[activeProvider] || PROVIDERS.nvidia;
}

async function generateEmbeddings(texts, options = {}) {
  if (!texts || texts.length === 0) return [];

  const uniqueTexts = [...new Set(texts)];
  const cached = {};
  const uncached = [];

  if (options.useCache !== false) {
    for (const text of uniqueTexts) {
      const vec = embeddingCache.get(text);
      if (vec !== null) {
        cached[text] = vec;
      } else {
        uncached.push(text);
      }
    }
  } else {
    uncached.push(...uniqueTexts);
  }

  const embeddingMap = { ...cached };

  if (uncached.length > 0) {
    const provider = getActiveProvider();
    const batches = [];
    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
      batches.push(uncached.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      const vectors = await provider.embed(batch, options.apiKey || EMBEDDING_API_KEY);
      for (let j = 0; j < batch.length; j++) {
        embeddingMap[batch[j]] = vectors[j] || [];
        if (options.useCache !== false) {
          embeddingCache.set(batch[j], vectors[j] || []);
        }
      }
    }
  }

  return texts.map(t => embeddingMap[t] || []);
}

async function generateQueryEmbedding(query, options = {}) {
  if (!query || query.trim().length === 0) return null;
  const results = await generateEmbeddings([query], { ...options, useCache: false });
  return results[0] || null;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function getCacheStats() {
  return embeddingCache.getStats();
}

function clearCache() {
  embeddingCache.clear();
}

module.exports = {
  generateEmbeddings,
  generateQueryEmbedding,
  cosineSimilarity,
  getActiveProvider,
  PROVIDERS,
  getCacheStats,
  clearCache,
};
