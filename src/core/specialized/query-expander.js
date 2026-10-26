const embeddings = require('./embeddings');

function expandCodeTerms(query) {
  const expansions = [];

  const snakeCaseTerms = query.match(/\b[a-z]+_[a-z_0-9]+\b/g);
  if (snakeCaseTerms) {
    for (const term of snakeCaseTerms) {
      const parts = term.split('_').filter(p => p.length > 0);
      if (parts.length > 1) {
        expansions.push(parts.join(' '));
        expansions.push(parts.join(''));
        expansions.push(parts[parts.length - 1]);
      }
    }
  }

  if (/\bwp_/i.test(query)) {
    const wps = query.replace(/\bwp_/gi, 'WordPress ');
    if (wps !== query) expansions.push(wps);
  }

  const codePrefixes = ['wp_', 'wc_', 'get_', 'set_', 'add_', 'remove_', 'update_', 'delete_', 'register_', 'sanitize_', 'esc_', 'do_', 'apply_'];

  for (const prefix of codePrefixes) {
    const match = query.match(new RegExp('\\b' + prefix + '\\w+', 'g'));
    if (match) {
      for (const m of match) {
        const readable = m.replace(/_/g, ' ');
        if (readable !== m) expansions.push(readable);
        expansions.push(m.replace(prefix, ''));
      }
    }
  }

  const camelCaseTerms = query.match(/\b[a-z]+[A-Z][a-zA-Z]*\b/g);
  if (camelCaseTerms) {
    for (const term of camelCaseTerms) {
      const parts = term.split(/(?=[A-Z])/).map(p => p.toLowerCase());
      if (parts.length > 1) {
        expansions.push(parts.join(' '));
      }
    }
  }

  return expansions.filter(e => e && e.length > 2).filter((e, i, a) => a.indexOf(e) === i);
}

function expandQuery(query, options = {}) {
  if (!query || query.trim().length === 0) return [query];

  const expansions = [query];

  const normalized = query.toLowerCase().trim();
  const isQuestion = /^(what|how|why|when|where|which|who|does|do|is|are|can|could|would|should|explain|describe|define|tell|show|list|find|give)/i.test(normalized);

  const stripped = query.replace(/^[Ww]hat(?: is| are| does| do)?\s+/i, '')
    .replace(/^[Hh]ow (?:to|does|do|can|could|would|should)\s+/i, '')
    .replace(/^[Ee]xplain\s+/i, '')
    .replace(/^[Dd]escribe\s+/i, '')
    .replace(/^[Dd]efine\s+/i, '')
    .replace(/^[Tt]ell me (?:about|how|what|why|when|where)\s+/i, '')
    .replace(/^[Ss]how me\s+/i, '')
    .replace(/^[Ll]ist\s+/i, '')
    .replace(/\?+$/, '');

  if (isQuestion && stripped && stripped !== query) {
    expansions.push(stripped.trim());
  }

  expansions.push(query.replace(/['']/g, ''));
  expansions.push(query.replace(/-/g, ' '));

  const withoutStop = query.replace(/\b(the|a|an|in|on|at|to|for|of|with|by|is|are|was|were|be|been|do|does|did|have|has|had|this|that|these|those|it|its|they|them|their|we|our|you|your)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (withoutStop && withoutStop !== query && withoutStop.length > 5) {
    expansions.push(withoutStop);
  }

  const codeExpansions = expandCodeTerms(query);
  expansions.push(...codeExpansions);

  const unique = [...new Set(expansions.filter(e => e && e.trim()))];
  return unique.slice(0, 5);
}

async function expandQueryWithLLM(query, config = {}) {
  if (!config.expansionLlmEndpoint || !config.expansionLlmApiKey) {
    return expandQuery(query);
  }

  try {
    const opencode = require('../../providers/opencode');
    const result = await opencode.chat([
      { role: 'system', content: 'You are a query expansion assistant. Given a user query, generate 2-3 alternative phrasings that express the same information need. Return each variation on a separate line. Do not add numbering or prefixes.' },
      { role: 'user', content: query },
    ], { model: config.expansionLlmModel || 'gpt-4o-mini', maxTokens: 200 });

    const variations = result.content.trim().split('\n')
      .map(l => l.trim())
      .filter(l => l && l !== query && l.length > 3);

    return [query, ...variations].slice(0, 5);
  } catch (e) {
    return expandQuery(query);
  }
}

async function generateHyde(query, config = {}) {
  if (!config.hydeLlmEndpoint && !config.hydeLlmApiKey) {
    return query;
  }

  try {
    const opencode = require('../../providers/opencode');
    const result = await opencode.chat([
      { role: 'system', content: 'You are a knowledgeable document writer. Given a question, write a short paragraph that answers the question factually. This paragraph will be used to search a knowledge base.' },
      { role: 'user', content: query },
    ], { model: config.hydeLlmModel || 'gpt-4o-mini', maxTokens: 300 });

    const hydeText = result.content.trim();
    return hydeText || query;
  } catch (e) {
    return query;
  }
}

async function retrieveWithExpansion(modelId, query, retriever, config = {}) {
  const queries = await expandQueryWithLLM(query, config);
  const allResults = [];

  for (const q of queries) {
    try {
      const results = await retriever.retrieve(modelId, q, config);
      allResults.push(...results);
    } catch (e) {
      console.error('[Specialized] Expansion query failed:', e.message);
    }
  }

  const seen = new Set();
  const merged = [];
  for (const r of allResults) {
    const key = r.id || r.content;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(r);
    }
  }

  merged.sort((a, b) => b.score - a.score);
  const maxChunks = config.maxChunks || 5;
  return merged.slice(0, maxChunks * 2);
}

module.exports = { expandQuery, expandQueryWithLLM, generateHyde, retrieveWithExpansion };
