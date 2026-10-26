const { PolicyViolationError } = require('./errors');

const MEMORY_INJECTION_PATTERNS = [
  { pattern: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|above|prior|all)\s+(?:instructions|directives|rules|commands|messages)/gi, replacement: '[filtered]' },
  { pattern: /you\s+(?:are\s+)?(?:now|will\s+behave|must\s+act)\s+as\s+/gi, replacement: '' },
  { pattern: /new\s+(?:instructions|rules|directive|command)(?:\s*:)/gi, replacement: '' },
  { pattern: /from\s+(?:now\s+on|this\s+point\s+forward)\s+(?:,|:)/gi, replacement: '' },
  { pattern: /output\s+(?:the\s+)?(?:full\s+)?(?:system\s+)?prompt/gi, replacement: '[filtered]' },
  { pattern: /reveal\s+(?:your\s+)?(?:instructions|prompt|prompt\s+template|system\s+message)/gi, replacement: '[filtered]' },
  { pattern: /print\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions)/gi, replacement: '[filtered]' },
  { pattern: /show\s+(?:me\s+)?(?:your\s+)?(?:full\s+)?(?:instructions|prompt)/gi, replacement: '[filtered]' },
  { pattern: /you\s+are\s+(?:now\s+)?(?:DAN|SYSTEM|root|admin|sudo|jailbroken|unrestricted)/gi, replacement: '' },
  { pattern: /simulate\s+(?:being|as)\s+/gi, replacement: '' },
  { pattern: /pretend\s+(?:to\s+)?be\s+/gi, replacement: '' },
  { pattern: /[\[\<\{](?:SYS|SYSTEM|INST|ASSISTANT|HUMAN|USER|AI|CHAT)[\]\>\}]/gi, replacement: '' },
  { pattern: /[\[\<\{]\/(?:SYS|SYSTEM|INST|ASSISTANT|HUMAN|USER|AI|CHAT)[\]\>\}]/gi, replacement: '' },
  { pattern: /<<\s*SYS\s*>>|<<\s*\/\s*SYS\s*>>/gi, replacement: '' },
  { pattern: /\{"role":\s*"system"/gi, replacement: '' },
  { pattern: /\{"role":\s*"assistant"/gi, replacement: '' },
  { pattern: /"content":\s*"/gi, replacement: '' },
  { pattern: /<\/?(?:system|instruction|human|assistant|ai|message|prompt)[^>]*>/gi, replacement: '' },
  { pattern: /^-{3,}$/gm, replacement: '' },
  { pattern: /^\*{3,}$/gm, replacement: '' },
  { pattern: /^={3,}$/gm, replacement: '' },
  { pattern: /```\s*(?:system|prompt|instructions?)(?:\s|\n)/gi, replacement: '```\n' },
];

const BLOCKED_PATTERNS = [
  /system-reminder/gi,
  /\/www\/wwwroot\/[^\s,;]*/gi,
  /\/root\/(?:[^\s,;]+)/gi,
  /OPENCODE_[A-Z]+/g,
  /OPENAI_API_KEY/g,
  /ANTHROPIC_API_KEY/g,
  /LLMGATEWAY_API_KEY/g,
  /UnknownError/g,
  /ref_[a-z0-9]+/gi,
  /(?:OPENAI|ANTHROPIC|LLMGATEWAY|OPENCODE)_[A-Z0-9_]+/g,
  /(?:providerID|modelID)\s*[:=]\s*['"][^'"]+['"]/gi,
  /(?:providerID|modelID)\s*(?:is|equals|=|:|=>)\s*['"][^'"]+['"]/gi,
  /(?:providerID|modelID)\s*[:=]\s*[^\s,;]+/gi,
  /(?:providerID|modelID)\s*(?:is|equals|=|:|=>)\s*[^\s,;]+/gi,
  /(?:sk-[a-zA-Z0-9]{10,})/g,
];

const SEVERE_LEAK_PATTERNS = [
  /(?:OPENAI|ANTHROPIC|LLMGATEWAY|OPENCODE)_[A-Z0-9_]+/g,
  /(?:providerID|modelID)\s*[:=]\s*['"][^'"]+['"]/gi,
  /(?:providerID|modelID)\s*(?:is|equals|=|:|=>)\s*['"][^'"]+['"]/gi,
  /(?:providerID|modelID)\s*[:=]\s*[^\s,;]+/gi,
  /(?:providerID|modelID)\s*(?:is|equals|=|:|=>)\s*[^\s,;]+/gi,
  /\/www\/wwwroot\/[^\s,;]*/gi,
  /\/root\/(?:[^\s,;]+)/gi,
];

function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const pattern of BLOCKED_PATTERNS) {
    result = result.replace(pattern, '[filtered]');
  }
  return result;
}

function sanitizeLogValue(value) {
  if (typeof value !== 'string') return value;
  return sanitizeText(value);
}

function hasSevereLeak(text) {
  if (typeof text !== 'string') return false;
  for (const pattern of SEVERE_LEAK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

function findMatchingPattern(text, patterns) {
  if (typeof text !== 'string') return null;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

function sanitizeResponseBody(body) {
  const contentStr = body?.choices?.[0]?.message?.content || body?.content?.[0]?.text || '';
  if (contentStr) {
    const matched = findMatchingPattern(contentStr, SEVERE_LEAK_PATTERNS);
    if (matched) {
      throw new PolicyViolationError('Response contains blocked content', matched);
    }
  }
  const toolCalls = body?.choices?.[0]?.message?.tool_calls;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      const args = tc?.function?.arguments || '';
      if (args) {
        const matched = findMatchingPattern(args, SEVERE_LEAK_PATTERNS);
        if (matched) {
          throw new PolicyViolationError('Tool call arguments contain blocked content', matched);
        }
      }
    }
  }
  return body;
}

function sanitizeMemoryInjection(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  let filteredCount = 0;
  for (const { pattern, replacement } of MEMORY_INJECTION_PATTERNS) {
    const before = result.length;
    result = result.replace(pattern, replacement);
    if (result.length < before) filteredCount++;
  }
  const trimmed = result.trim();
  if (!trimmed) return null;
  const ratio = filteredCount / Math.max(trimmed.split(/\s+/).length, 1);
  if (ratio > 0.3) return null;
  return trimmed;
}

function isSafeOutput(text) {
  if (typeof text !== 'string') return true;
  return !hasSevereLeak(text);
}

module.exports = {
  BLOCKED_PATTERNS,
  SEVERE_LEAK_PATTERNS,
  MEMORY_INJECTION_PATTERNS,
  sanitizeText,
  sanitizeLogValue,
  sanitizeResponseBody,
  sanitizeMemoryInjection,
  hasSevereLeak,
  isSafeOutput,
  findMatchingPattern,
};
