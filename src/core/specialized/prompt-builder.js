const { estimateTokens, countTokens } = require('./tokenizer');
const { deduplicateChunks } = require('./reranker');

const TEMPLATES = {
  factual: 'You are an expert assistant. Use the following knowledge to answer accurately:\n\n{knowledge}\n\nUser question: {query}\n\nAnswer based on the knowledge provided. If the knowledge does not contain relevant information, say so.',
  creative: 'Use the following reference material to inform your response:\n\n{knowledge}\n\nUser request: {query}',
  code: 'Follow these patterns and conventions from the knowledge base when writing code:\n\n{knowledge}\n\nUser request: {query}',
  default: 'You are an expert assistant. Use the following knowledge to answer:\n\n{knowledge}\n\nUser question: {query}',
  technical: 'Technical documentation reference:\n\n{knowledge}\n\nUser query: {query}\n\nProvide precise, technical answers referencing the documentation above.',
  concise: 'Context:\n{knowledge}\n\nQ: {query}\nA:',
};

const DEEPSEEK_TEMPLATE = 'You are an expert assistant. Use the following knowledge to answer:\n\n{knowledge}\n\nUser question: {query}';

function detectQueryType(query) {
  if (!query) return 'default';
  const q = query.toLowerCase().trim();

  if (/^(write|create|generate|build|implement|develop|coding|code|function|class|api|endpoint)/.test(q) ||
      /`[a-z_]/.test(q) ||
      /\b(code|function|class|method|variable|import|export|const|let|var|async|await)\b/.test(q)) {
    return 'code';
  }
  if (/^(what|when|where|which|who|how many|how much|define|explain|describe|list|tell me)/.test(q)) {
    return 'factual';
  }
  if (/write|create|draft|compose|generate|story|poem|essay|article|blog|content/i.test(q)) {
    return 'creative';
  }
  if (/why|how does|how it works|analyze|compare|contrast|difference|similarity/i.test(q)) {
    return 'technical';
  }
  if (/^(yes|no|maybe|short|quick|simple|brief|tl.dr)/.test(q) || (q.length < 20)) {
    return 'concise';
  }
  return 'default';
}

function buildPrompt(baseSystemPrompt, chunks, query, config) {
  if (!chunks || chunks.length === 0) {
    return baseSystemPrompt;
  }

  const templateConfig = config.promptTemplate;
  let template;

  if (templateConfig) {
    template = templateConfig;
  } else {
    const queryType = detectQueryType(query);
    template = TEMPLATES[queryType] || TEMPLATES.default;
  }

  let cleanedChunks = deduplicateChunks(chunks, config.dedupThreshold || 0.85);

  if (config.importanceWeighting !== false) {
    cleanedChunks = applyImportanceWeighting(cleanedChunks);
  }

  const tokenBudget = config.maxPromptTokens || (config.totalMaxTokens || 8192) - 1024;

  const formatted = formatChunks(cleanedChunks, config.chunksHeader || 'Knowledge Base References');

  const displayQuery = cleanQueryForPrompt(query);

  const maxKnowledgeTokens = tokenBudget - countTokens(template) - countTokens(displayQuery) - countTokens(baseSystemPrompt || '') - 256;
  const trimmed = trimKnowledgeToBudget(formatted, cleanedChunks, maxKnowledgeTokens);

  const knowledgeText = trimmed.text;

  const augmented = template
    .replace('{knowledge}', knowledgeText)
    .replace('{query}', displayQuery || '');

  if (baseSystemPrompt) {
    return baseSystemPrompt + '\n\n' + augmented;
  }

  return augmented;
}

function cleanQueryForPrompt(query) {
  if (!query) return '';
  const tags = query.match(/\[Topic:\s*([^\]]+)\]/);
  const files = query.match(/\[ActiveFiles:\s*([^\]]+)\]/);
  const sessionInfo = query.match(/\[SessionFiles:\s*([^\]]+)\]/);

  let contextParts = [];
  if (tags) contextParts.push('Context: ' + formatTopic(tags[1]));
  if (files) contextParts.push('Files: ' + files[1]);
  if (sessionInfo && !files) contextParts.push('Files: ' + sessionInfo[1]);

  let clean = query.replace(/\[[^\]]+\]/g, '').trim();
  if (contextParts.length > 0) {
    clean = clean + '\n\n' + contextParts.join(' | ');
  }
  return clean;
}

function formatTopic(topic) {
  const map = {
    'custom-post-type': 'Developing a custom post type',
    'woocommerce': 'Developing WooCommerce functionality',
    'block-editor': 'Developing Gutenberg blocks',
    'theme-development': 'Developing a WordPress theme',
    'plugin-development': 'Developing a WordPress plugin',
    'security': 'Implementing WordPress security',
    'database': 'Working with WordPress database',
    'rest-api': 'Building WordPress REST API',
    'debugging': 'Debugging WordPress code',
    'performance': 'Optimizing WordPress performance',
    'devops': 'WordPress DevOps and deployment',
    'metaboxes': 'Creating WordPress meta boxes',
    'shortcodes': 'Developing WordPress shortcodes',
    'widgets': 'Developing WordPress widgets',
    'wp-query': 'Working with WP_Query and the Loop',
    'forms-ajax': 'Handling forms and AJAX in WordPress',
    'menus': 'Creating WordPress navigation menus',
    'images': 'Working with WordPress images',
    'users': 'Managing WordPress users and roles',
  };
  return map[topic] || 'Working on ' + topic.replace(/-/g, ' ');
}

function applyImportanceWeighting(chunks) {
  return chunks.sort((a, b) => {
    let scoreA = a.score || 0;
    let scoreB = b.score || 0;

    if (a.headingLevel !== undefined && b.headingLevel !== undefined) {
      if (a.headingLevel < b.headingLevel) scoreA += 0.1;
      if (b.headingLevel < a.headingLevel) scoreB += 0.1;
    }

    if (a.source && b.source) {
      if (a.source === b.source && a.lineStart !== undefined && b.lineStart !== undefined) {
        if (a.lineStart < b.lineStart) scoreA += 0.05;
        else scoreB += 0.05;
      }
    }

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return (a.lineStart || 0) - (b.lineStart || 0);
  });
}

function formatChunks(chunks, header) {
  if (!chunks || chunks.length === 0) return '';
  let result = header ? header + ':\n\n' : '';
  result += chunks.map((chunk, i) => {
    const source = chunk.source || 'unknown';
    const heading = chunk.heading ? ` (${chunk.heading})` : '';
    return `[${i + 1}] Source: ${source}${heading}\n${chunk.content}`;
  }).join('\n\n');
  return result;
}

function trimKnowledgeToBudget(formatted, chunks, budget) {
  if (!chunks || chunks.length === 0) return { text: '', chunks: [], removed: 0 };

  if (budget <= 0) return { text: '', chunks: [], removed: chunks.length };

  let totalTokens = countTokens(formatted);
  if (totalTokens <= budget) return { text: formatted, chunks, removed: 0 };

  const selected = [];
  let selectedTokens = 0;
  let removed = 0;

  for (const chunk of chunks) {
    const chunkText = `[Source: ${chunk.source || 'unknown'}]\n${chunk.content}`;
    const chunkTokens = countTokens(chunkText);

    if (selectedTokens + chunkTokens <= budget) {
      selected.push(chunk);
      selectedTokens += chunkTokens;
    } else {
      const remaining = budget - selectedTokens;
      if (remaining > 50 && chunkTokens > remaining) {
        const trimmed = smartTruncate(chunk.content, remaining);
        selected.push({ ...chunk, content: trimmed });
        selectedTokens += remaining;
      }
      removed++;
    }
  }

  const newFormatted = formatChunks(selected);
  return { text: newFormatted, chunks: selected, removed };
}

function smartTruncate(content, targetTokens) {
  if (!content || targetTokens < 10) return '';

  const lines = content.split('\n');

  if (content.includes('```') || content.includes('function ') || content.includes('class ') || content.includes('<?php') || content.includes('def ') || content.includes('import ')) {
    let result = [];
    let tokens = 0;
    for (const line of lines) {
      const lineTokens = countTokens(line + '\n');
      if (tokens + lineTokens <= targetTokens) {
        result.push(line);
        tokens += lineTokens;
      } else {
        if (result.length > 0) {
          result[result.length - 1] = result[result.length - 1] + '\n// ... truncated';
        }
        break;
      }
    }
    return result.join('\n');
  }

  const charBudget = Math.floor(targetTokens * 4);
  if (content.length <= charBudget) return content;

  let truncated = content.slice(0, charBudget);
  const lastSpace = truncated.lastIndexOf(' ');
  const lastNewline = truncated.lastIndexOf('\n');

  if (lastNewline > charBudget * 0.7) {
    truncated = content.slice(0, lastNewline);
  } else if (lastSpace > charBudget * 0.5) {
    truncated = content.slice(0, lastSpace);
  }

  return truncated.trimEnd() + '...';
}

module.exports = { buildPrompt, formatChunks, detectQueryType, trimKnowledgeToBudget, TEMPLATES };
