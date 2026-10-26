const knowledgeStore = require('./knowledge-store');
const chunker = require('./chunker');
const embeddings = require('./embeddings');
const retriever = require('./retriever');
const promptBuilder = require('./prompt-builder');
const reranker = require('./reranker');
const queryExpander = require('./query-expander');
const bm25 = require('./bm25');
const contextExtractor = require('./context-extractor');
const sessionStore = require('./session-store');
const { globalMetrics } = require('./metrics');

function isApiKeyAvailable() {
  return !!(process.env.EMBEDDING_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY);
}

async function processRequest(modelConfig, messages, options = {}) {
  if (!modelConfig.isSpecialized || !modelConfig.specializedConfig) return null;

  const config = modelConfig.specializedConfig;
  const modelId = modelConfig.alias;
  const sessionId = options.sessionId || null;

  const context = contextExtractor.extractConversationContext(messages);
  if (!context.currentQuery) return null;

  const sessionCtx = sessionId ? sessionStore.getSessionContext(sessionId) : null;

  const enrichedQuery = contextExtractor.buildEnrichedQuery(context, sessionCtx, config);

  const startTime = Date.now();
  let chunks;
  let method = 'none';

  try {
    chunks = await multiRouteRetrieve(modelId, context, sessionCtx, enrichedQuery, config);

    if (!chunks || chunks.length === 0) {
      chunks = await retriever.retrieve(modelId, enrichedQuery, config);
      method = chunks && chunks.length > 0 && chunks[0].bm25Score !== undefined ? 'hybrid' : 'keyword';
    }

    chunks = await reranker.rerank(enrichedQuery, chunks, config);
    const dedupThreshold = config.dedupThreshold || 0.85;
    chunks = reranker.deduplicateChunks(chunks, dedupThreshold);

    if (sessionId && config.sessionAware !== false) {
      const recentChunkIds = sessionStore.getRecentChunkIds(sessionId, 10);
      if (recentChunkIds.length > 0) {
        const avoidSet = new Set(recentChunkIds);
        const newChunks = chunks.filter(c => !avoidSet.has(c.id));
        if (newChunks.length > 0) {
          chunks = newChunks;
        }
      }
      sessionStore.updateSession(sessionId, context, chunks);
    }

    const elapsed = Date.now() - startTime;

    globalMetrics.logQuery({
      modelId,
      query: enrichedQuery.slice(0, 200),
      chunkCount: chunks.length,
      totalChunks: (await knowledgeStore.getChunks(modelId)).length,
      retrievalTimeMs: elapsed,
      method,
      resultChunks: chunks,
    });

    return { chunks, query: enrichedQuery, method, elapsed, originalQuery: context.currentQuery };
  } catch (e) {
    console.error('[Specialized] processRequest error:', e.message, e.stack);
    const elapsed = Date.now() - startTime;
    globalMetrics.logQuery({
      modelId,
      query: enrichedQuery.slice(0, 200),
      chunkCount: 0,
      totalChunks: 0,
      retrievalTimeMs: elapsed,
      method: 'error',
      resultChunks: [],
    });
    return { chunks: [], query: enrichedQuery, method: 'error', error: e.message };
  }
}

async function multiRouteRetrieve(modelId, context, sessionCtx, enrichedQuery, config) {
  const queries = [enrichedQuery];

  if (config.multiQueryEnabled !== false && (context.recentQueries || []).length > 1) {
    const relatedQueries = context.recentQueries.slice(-3, -1).filter(q => {
      if (context.conversationTopic === 'general') return false;
      return q.toLowerCase().includes(context.conversationTopic.split('-').join(' ')) ||
             (context.codeContext.activeFiles || []).length > 0;
    });
    queries.push(...relatedQueries.slice(0, 2));
  }

  if (config.errorAwareRetrieval !== false && context.toolContext.errors.length > 0) {
    const errorQueries = buildErrorQueries(context.toolContext.errors);
    queries.push(...errorQueries);
  }

  if (config.fileAwareRetrieval !== false && context.codeContext.activeFiles.length > 0) {
    const fileQueries = buildFileQueries(context.codeContext.activeFiles);
    queries.push(...fileQueries);
  }

  const uniqueQueries = [...new Set(queries.filter(Boolean))].slice(0, config.maxMultiQueries || 3);

  const allChunks = [];
  for (const q of uniqueQueries) {
    try {
      const result = await retriever.retrieve(modelId, q, config);
      if (result && result.length > 0) {
        allChunks.push(...result);
      }
    } catch (e) {
      console.error('[Specialized] Multi-query retrieve failed:', e.message);
    }
  }

  return mergeChunks(allChunks, config.maxChunks || 5);
}

function buildErrorQueries(errors) {
  const queries = [];
  for (const error of errors.slice(-2)) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('undefined')) queries.push('undefined variable debugging WordPress');
    else if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('authorized')) {
      queries.push('capability check permission current_user_can WordPress');
    }
    else if (msg.includes('nonce')) queries.push('nonce verification wp_verify_nonce WordPress');
    else if (msg.includes('database') || msg.includes('query') || msg.includes('wpdb')) {
      queries.push('wpdb prepare database query WordPress');
    }
    else if (msg.includes('memory') || msg.includes('timeout') || msg.includes('limit')) {
      queries.push('memory limit performance optimization WordPress');
    }
    else if (msg.includes('function') || msg.includes('method')) {
      if (error.file) {
        queries.push('WordPress function ' + (error.file.match(/\w+\.\w+/) || [''])[0] + ' development');
      } else {
        queries.push('WordPress function hook filter development');
      }
    }
    else queries.push('WordPress debug error troubleshooting');
  }
  return queries.filter(Boolean);
}

function buildFileQueries(files) {
  const queries = [];
  for (const file of files.slice(0, 3)) {
    const filename = file.split('/').pop() || '';
    if (filename === 'functions.php') queries.push('functions.php theme setup enqueuing WordPress');
    else if (filename.includes('cpt') || filename.includes('post-type')) {
      queries.push('custom post type registration WordPress');
    }
    else if (filename.includes('block')) queries.push('block editor register block WordPress');
    else if (filename.includes('widget')) queries.push('widget development WordPress');
    else if (filename.includes('shortcode')) queries.push('shortcode development WordPress');
    else if (filename.includes('rest') || filename.includes('api')) {
      queries.push('REST API register_rest_route WordPress');
    }
    else if (filename.includes('woocommerce') || filename.includes('woo-')) {
      queries.push('WooCommerce development hooks WordPress');
    }
    else if (filename.endsWith('.php')) {
      const dirs = file.split('/');
      if (dirs.includes('plugins') || dirs.includes('mu-plugins')) {
        queries.push('plugin development WordPress');
      }
      if (dirs.includes('themes')) {
        queries.push('theme development WordPress');
      }
    }
  }
  return queries.filter(Boolean);
}

function mergeChunks(chunks, maxChunks) {
  if (!chunks || chunks.length === 0) return [];
  const seen = new Map();
  for (const chunk of chunks) {
    const key = chunk.id || chunk.content.slice(0, 100);
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.score = Math.max(existing.score || 0, chunk.score || 0);
    } else {
      seen.set(key, { ...chunk });
    }
  }
  return [...seen.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, maxChunks);
}

function buildKnowledgePrompt(baseSystemPrompt, knowledgeCtx, modelConfig) {
  if (!knowledgeCtx || !knowledgeCtx.chunks || knowledgeCtx.chunks.length === 0) {
    return baseSystemPrompt;
  }

  const config = modelConfig.specializedConfig;
  return promptBuilder.buildPrompt(baseSystemPrompt, knowledgeCtx.chunks, knowledgeCtx.query, config);
}

function extractLastUserMessage(messages) {
  if (!messages || !Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const content = messages[i].content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        const textParts = content.filter(c => c.type === 'text').map(c => c.text);
        return textParts.join(' ') || '';
      }
    }
  }
  return '';
}

async function buildKnowledge(modelId) {
  const sourceFiles = await knowledgeStore.listSourceFiles(modelId);
  const allChunks = [];

  for (const filename of sourceFiles) {
    const content = await knowledgeStore.getSourceContent(modelId, filename);
    if (!content) continue;

    const chunks = chunker.chunkText(content, { source: filename });
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) return { ok: false, error: 'No source files found' };

  const texts = allChunks.map(c => c.content);
  let vectors;

  try {
    const apiKey = process.env.EMBEDDING_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY;
    if (apiKey) {
      console.log('[Specialized] Embedding API key found, generating embeddings for', texts.length, 'texts');
      vectors = await embeddings.generateEmbeddings(texts, { useCache: false, apiKey });
    } else {
      console.log('[Specialized] No embedding API key available');
      vectors = null;
    }
  } catch (e) {
    console.error('[Specialized] Embedding generation error:', e.message, e.stack);
    vectors = null;
  }

  let enrichedChunks;
  if (vectors) {
    enrichedChunks = allChunks.map((chunk, i) => ({
      ...chunk,
      embedding: vectors[i] || [],
    }));
  } else {
    enrichedChunks = allChunks.map(chunk => ({
      ...chunk,
      embedding: [],
    }));
  }

  await knowledgeStore.saveChunks(modelId, enrichedChunks);
  return {
    ok: true,
    chunks: enrichedChunks.length,
    totalTokens: allChunks.reduce((s, c) => s + c.tokens, 0),
    embeddingMode: vectors ? 'semantic' : 'keyword',
  };
}

async function rebuildAllKnowledge() {
  const models = await knowledgeStore.listModels();
  const results = [];
  for (const modelId of models) {
    try {
      const result = await buildKnowledge(modelId);
      results.push({ modelId, ...result });
    } catch (e) {
      console.error(`[Specialized] Rebuild failed for ${modelId}:`, e.message);
      results.push({ modelId, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = {
  processRequest,
  buildKnowledgePrompt,
  buildKnowledge,
  rebuildAllKnowledge,
  extractLastUserMessage,
};
