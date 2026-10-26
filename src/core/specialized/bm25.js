const { estimateTokens } = require('./tokenizer');

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are',
  'was','were','be','been','being','have','has','had','do','does','did','will','would',
  'could','should','may','might','can','shall','this','that','these','those','it','its',
  'they','them','their','we','our','you','your','he','she','him','her','his','as','if',
  'because','so','than','then','just','also','very','too','not','no','nor','but','up',
  'down','out','off','over','under','again','further','each','few','more','most','other',
  'some','such','only','own','same','into','above','below','between','through','during',
  'before','after','about','between','every','all','both','what','which','who','whom',
])

const STOP_WORDS_VI = new Set([
  'và','của','là','các','có','những','đã','được','một','này','cho','với','trong','khi',
  'từ','đến','hoặc','không','nên','rất','phải','sẽ','đang','làm','bị','bởi','vì','thế',
  'nếu','thì','cũng','tại','vào','ra','lên','xuống','qua','lại','nữa','hơn','như','mà',
  'đó','ấy','nào','sao','gì','ai','ở','đây','đó','nay','nay','ngay','luôn','cả','chỉ',
  'vẫn','đều','mỗi','mọi','vậy','thì','thì','lúc','bấy','giờ','đi','lại','về','tới',
]);

const TECHNICAL_PHRASES = new Set([
  'custom post type', 'post type', 'taxonomy query', 'meta query', 'date query',
  'rest api', 'wp query', 'wordpress query', 'object cache', 'transient cache',
  'page cache', 'rewrite rule', 'rewrite rules', 'plugin api', 'theme api',
  'template hierarchy', 'conditional tag', 'canonical url', 'author archive',
  'category archive', 'tag archive', 'wpdatabase', 'wordpress database',
  'makefile', 'install script', 'update script', 'capability type', 'capability map',
  'singular template', 'archive template', 'block editor', 'block theme',
  'classic theme', 'child theme', 'block pattern', 'theme support',
]);

function tokenize(text) {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);
}

function extractPhrases(text) {
  const lower = text.toLowerCase();
  const phrases = [];
  for (const phrase of TECHNICAL_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx !== -1) {
      phrases.push(phrase);
    }
  }
  return phrases;
}

function extractNgrams(tokens, minN = 2, maxN = 3) {
  const ngrams = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      const phrase = tokens.slice(i, i + n).join(' ');
      if (phrase.length > 3) {
        ngrams.push(phrase);
      }
    }
  }
  return ngrams;
}

function removeStopWords(tokens, lang = 'en') {
  const stopwords = lang === 'vi' ? STOP_WORDS_VI : new Set([...STOP_WORDS, ...STOP_WORDS_VI]);
  return tokens.filter(w => !stopwords.has(w));
}

function computeIDF(docCount, docsWithTerm) {
  return Math.log(1 + (docCount - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
}

function scoreBM25(queryTokens, docTokens, docLen, avgDocLen, k1 = 1.5, b = 0.75) {
  let score = 0;
  const docTokenSet = new Set(docTokens);

  for (const qt of queryTokens) {
    let tf = 0;
    for (const dt of docTokens) {
      if (dt === qt) tf++;
    }
    if (tf === 0) continue;

    const numerator = tf * (k1 + 1);
    const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLen));
    const idf = computeIDF(docCount, docCount);
    score += idf * (numerator / denominator);
  }

  return score;
}

function prepareChunkTokens(chunks, lang) {
  return chunks.map(chunk => ({
    chunk,
    tokens: removeStopWords(tokenize(chunk.content), lang),
    docLen: chunk.tokens || estimateTokens(chunk.content),
  }));
}

function bm25Search(query, chunkTokens, maxChunks, k1 = 1.5, b = 0.75) {
  const queryPhrases = extractPhrases(query);
  const queryTokens = removeStopWords(tokenize(query));
  const queryNgrams = extractNgrams(queryTokens);
  const allQueryTerms = [...queryTokens, ...queryNgrams, ...queryPhrases];
  const queryTermSet = new Set(allQueryTerms);

  if (queryTermSet.size === 0) return [];

  const docCount = chunkTokens.length;
  const avgDocLen = docCount > 0
    ? chunkTokens.reduce((s, c) => s + c.docLen, 0) / docCount
    : 1;

  const docFreq = {};
  for (const ct of chunkTokens) {
    const seen = new Set();
    for (const tok of ct.tokens) {
      if (!seen.has(tok)) {
        docFreq[tok] = (docFreq[tok] || 0) + 1;
        seen.add(tok);
      }
    }
    const contentPhrases = extractPhrases(ct.chunk.content);
    for (const p of contentPhrases) {
      const key = 'phrase:' + p;
      if (!seen.has(key)) {
        docFreq[key] = (docFreq[key] || 0) + 1;
        seen.add(key);
      }
    }
  }

  const scored = chunkTokens.map(ct => {
    let score = 0;
    const contentLower = ct.chunk.content.toLowerCase();
    const contentPhrases = extractPhrases(ct.chunk.content);

    for (const qt of queryTermSet) {
      if (qt.startsWith('phrase:')) continue;
      let tf = 0;
      for (const dt of ct.tokens) {
        if (dt === qt) tf++;
      }
      if (tf === 0) continue;

      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (ct.docLen / avgDocLen));
      const idf = Math.log(1 + (docCount - (docFreq[qt] || 0) + 0.5) / ((docFreq[qt] || 0) + 0.5));
      score += idf * (numerator / denominator);
    }

    for (const phrase of queryPhrases) {
      if (contentPhrases.includes(phrase)) {
        const phraseKey = 'phrase:' + phrase;
        const idf = Math.log(1 + (docCount - (docFreq[phraseKey] || 0) + 0.5) / ((docFreq[phraseKey] || 0) + 0.5));
        score += idf * 2.0;
      }
    }

    for (const ngram of queryNgrams) {
      if (contentLower.indexOf(ngram) !== -1) {
        score += 0.5;
      }
    }

    return { ...ct.chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxChunks);
}

function wordOverlapSearch(query, chunks, maxChunks) {
  const queryTokens = removeStopWords(tokenize(query));
  if (queryTokens.length === 0) return [];

  const scored = chunks.map(chunk => {
    const chunkLower = chunk.content.toLowerCase();
    let score = 0;
    for (const word of queryTokens) {
      const idx = chunkLower.indexOf(word);
      if (idx !== -1) {
        const before = idx === 0 || !/\p{L}/u.test(chunkLower[idx - 1]);
        const after = idx + word.length >= chunkLower.length || !/\p{L}/u.test(chunkLower[idx + word.length]);
        if (before && after) score++;
      }
    }
    return { ...chunk, score: queryTokens.length > 0 ? score / queryTokens.length : 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxChunks);
}

module.exports = { bm25Search, wordOverlapSearch, tokenize, removeStopWords, computeIDF, scoreBM25, prepareChunkTokens };
