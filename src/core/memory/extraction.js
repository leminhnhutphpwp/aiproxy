const fs = require('fs');
const path = require('path');
const { sanitizeMemoryInjection } = require('../sanitizer');

const MEMORY_DIR = path.join(__dirname, '..', '..', '..', 'config', 'memories');
const COOLDOWN_FILE = path.join(MEMORY_DIR, '.extraction-cooldown.json');

function loadCooldownState() {
  try {
    return JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveCooldownState(state) {
  try {
    if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // silently fail
  }
}

let lastExtractionTime = loadCooldownState();

const PATTERNS = [
  // Vietnamese preferences
  { category: 'preference', pattern: /tôi\s+(thích|ưa|chuộng|muốn|ghét|không\s+thích|không\s+muốn|mê|đam\s+mê|khoái|nghiện)\s+(.+)/i },
  { category: 'preference', pattern: /mình\s+(thích|ưa|chuộng|muốn|ghét|không\s+thích)\s+(.+)/i },
  { category: 'preference', pattern: /(em|anh|chị)\s+(thích|muốn|ưa)\s+(.+)/i },
  { category: 'preference', pattern: /đừng\s+(dùng|sử\s+dụng|làm|bao\s+giờ)\s+(.+)/i },
  { category: 'preference', pattern: /không\s+nên\s+(dùng|sử\s+dụng|làm|dùng\s+.*)/i },
  { category: 'preference', pattern: /(hay|tốt|nên|thường)\s+(dùng|sử\s+dụng|xài|chọn)\s+(.+)/i },
  { category: 'preference', pattern: /(ưu\s+tiên|thiên\s+về|chuyên\s+về)\s+(.+)/i },
  { category: 'preference', pattern: /(có\s+thể|giúp\s+tôi)\s+(dùng|sử\s+dụng|xài)\s+(.+)/i },
  // English preferences
  { category: 'preference', pattern: /i\s+(prefer|like|love|hate|dislike|want|dont\s+like|enjoy|avoid|need)\s+(.+)/i },
  { category: 'preference', pattern: /(prefer|like|love)\s+(using|working|coding)\s+(.+)/i },
  { category: 'preference', pattern: /never\s+use\s+(.+)/i },
  { category: 'preference', pattern: /(dont|do\s+not)\s+use\s+(.+)/i },
  { category: 'preference', pattern: /always\s+use\s+(.+)/i },
  { category: 'preference', pattern: /familiar\s+with\s+(.+)/i },
  { category: 'preference', pattern: /experienced?\s+in\s+(.+)/i },

  // Vietnamese facts
  { category: 'fact', pattern: /tôi\s+(làm|là|ở|sống|học|làm\s+việc|đang\s+làm|từng\s+làm)\s+(.+)/i },
  { category: 'fact', pattern: /mình\s+(làm|là|ở|sống|học|làm\s+việc|đang\s+làm)\s+(.+)/i },
  { category: 'fact', pattern: /(em|anh|chị)\s+(là|làm|học|ở)\s+(.+)/i },
  { category: 'fact', pattern: /(dự\s+án|công\s+việc|project)\s+(của\s+)?tôi\s+(dùng|sử\s+dụng|là|gồm|có)\s+(.+)/i },
  { category: 'fact', pattern: /chỗ\s+tôi\s+(dùng|sử\s+dụng|làm\s+việc)\s+(.+)/i },
  { category: 'fact', pattern: /bên\s+(mình|tôi)\s+(dùng|có|xài)\s+(.+)/i },
  { category: 'fact', pattern: /(website|web|app|hệ\s+thống)\s+(của\s+)?(tôi|mình|em)\s+(dùng|làm|là)\s+(.+)/i },
  { category: 'fact', pattern: /(công\s+ty|doanh\s+nghiệp|team|nhóm)\s+(của\s+)?(tôi|mình)\s+(.+)/i },
  { category: 'fact', pattern: /(đang|hiện)\s+(làm|làm\s+việc|học)\s+(tại|ở)\s+(.+)/i },
  // English facts
  { category: 'fact', pattern: /i\s+(work|am|live|use|studied|have|build|created?|maintain)\s+(at|in|for|with|on|as)\s+(.+)/i },
  { category: 'fact', pattern: /(this|my|our)\s+(project|app|code|system|site|api)\s+(is|uses|runs|built)\s+(.+)/i },
  { category: 'fact', pattern: /currently\s+(working|using|building|learning)\s+(on|with)\s+(.+)/i },
  { category: 'fact', pattern: /(company|team|org|startup)\s+(I|we)\s+(work|build|use)\s+(.+)/i },

  // Vietnamese instructions
  { category: 'instruction', pattern: /(hãy|luôn|nhớ)\s+(luôn|thường|đừng|không\s+được|cẩn\s+thận|kiểm\s+tra|đảm\s+bảo|chú\s+ý)\s+(.+)/i },
  { category: 'instruction', pattern: /(không\s+được|đừng\s+bao\s+giờ)\s+(.+)/i },
  { category: 'instruction', pattern: /(cần|phải|nên)\s+(nhớ|kiểm\s+tra|đảm\s+bảo|chắc\s+chắn|luôn)\s+(.+)/i },
  { category: 'instruction', pattern: /(lưu\s+ý|lưu\s+ý\s+quan\s+trọng|chú\s+thích):?\s+(.+)/i },
  { category: 'instruction', pattern: /(qui\s+tắc|nguyên\s+tắc|tiêu\s+chuẩn|quy\s+định)\s+(.+)/i },
  // English instructions
  { category: 'instruction', pattern: /(always|never|remember|dont\s+forget|make\s+sure|ensure)\s+(.+)/i },
  { category: 'instruction', pattern: /(rule|rules):?\s+(.+)/i },
  { category: 'instruction', pattern: /(guideline|guidelines|policy|policies):?\s+(.+)/i },
  { category: 'instruction', pattern: /(important|critical|crucial):?\s+(.+)/i },
  { category: 'instruction', pattern: /(follow|stick\s+to|adhere\s+to)\s+(.+)/i },
];

const EXTRACTION_PROMPT = `You are a precise memory extractor. Analyze the user messages in this conversation and extract explicit preferences, facts, and instructions.

For each item return:
- content: a clear, standalone statement in the user's original language
- category: "preference" | "fact" | "instruction"
- confidence: 0.0-1.0 (how certain you are this is a real user trait vs casual mention)
- tags: relevant tech/programming keywords (max 3)

Rules:
- ONLY extract things the user explicitly stated about themselves
- "tôi thích React" → high confidence explicit preference
- "thử dùng React xem sao" → low confidence (casual, not a real preference)
- "dự án của tôi dùng Vue" → high confidence explicit fact
- "hãy luôn kiểm tra type" → high confidence explicit instruction
- Skip greetings, thanks, off-topic, and very short messages
- Skip assistant messages — only look at user messages
- If nothing to extract, return empty array
- Return valid JSON array only, no explanation or markdown formatting`;

const EXTRACTION_COOLDOWN_MS = 300000;

function extractFacts(messages) {
  const facts = [];
  const seen = new Set();

  for (const msg of messages) {
    if (!msg || msg.role !== 'user') continue;
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (!content) continue;

    for (const { category, pattern } of PATTERNS) {
      const cloned = new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g'));
      let match;
      while ((match = cloned.exec(content)) !== null) {
        const factText = match[0].trim();
        const key = factText.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          const safeContent = sanitizeMemoryInjection(factText);
          if (!safeContent) continue;
          facts.push({
            content: safeContent,
            category,
            source: 'extracted',
            confidence: 0.7,
            tags: extractTags(content),
          });
        }
      }
    }
  }

  return facts;
}

async function extractWithLLM(messages, opencode, userId) {
  const now = Date.now();
  if (lastExtractionTime[userId] && (now - lastExtractionTime[userId]) < EXTRACTION_COOLDOWN_MS) {
    return extractFacts(messages);
  }

  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).filter(Boolean);
  if (userMessages.length === 0) return [];

  const conversation = userMessages.join('\n');
  if (conversation.length < 20) return extractFacts(messages);

  try {
    const { systemPrompt, parts } = opencode.convertMessages([
      { role: 'system', content: EXTRACTION_PROMPT },
      { role: 'user', content: conversation },
    ]);

    const extractionParts = [...parts];
    if (systemPrompt) {
      extractionParts.unshift({ type: 'text', text: systemPrompt });
    }

    const response = await opencode.handleSyncResponse(
      null, null,
      'openai',
      'gpt-4o-mini',
      'gpt-4o-mini',
      extractionParts,
      { timeoutMs: 15000 }
    );

    lastExtractionTime[userId] = now;
    saveCooldownState(lastExtractionTime);

    const text = response?.choices?.[0]?.message?.content;
    if (!text) return extractFacts(messages);

    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return extractFacts(messages);

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) return extractFacts(messages);

    const llmFacts = parsed.map(f => {
      const rawContent = String(f.content || '').trim();
      const safeContent = sanitizeMemoryInjection(rawContent);
      if (!safeContent || safeContent.length <= 5) return null;
      return {
        content: safeContent,
        category: ['preference', 'fact', 'instruction'].includes(f.category) ? f.category : 'fact',
        source: 'extracted',
        confidence: Math.min(1, Math.max(0, Number(f.confidence) || 0.5)),
        tags: Array.isArray(f.tags) ? f.tags.filter(t => typeof t === 'string').slice(0, 3) : extractTags(rawContent),
      };
    }).filter(Boolean);

    if (llmFacts.length > 0) return llmFacts;

    return extractFacts(messages);
  } catch {
    return extractFacts(messages);
  }
}

function extractTags(text) {
  const common = ['javascript', 'typescript', 'python', 'react', 'node', 'vue', 'angular',
    'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'linux', 'macos', 'windows',
    'frontend', 'backend', 'fullstack', 'mobile', 'web', 'api', 'database',
    'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis'];
  const tags = [];
  const lower = text.toLowerCase();
  for (const tag of common) {
    if (lower.includes(tag)) tags.push(tag);
  }
  return tags;
}

module.exports = { extractFacts, extractWithLLM, extractTags };
