const http = require('http');
const https = require('https');
const { URL } = require('url');
const config = require('../config');
const { ProviderError, PolicyViolationError, classifyProviderError, boundedSnippet, isRetryableError } = require('../core/errors');
const { sanitizeText, findMatchingPattern, SEVERE_LEAK_PATTERNS, sanitizeLogValue } = require('../core/sanitizer');
const { buildChatCompletionResponse, randomId } = require('../core/response');

const OPENCODE_URL = config.opencode.url;
const OPENCODE_AUTH = Buffer.from(
  config.opencode.username + ':' + config.opencode.password
).toString('base64');
const DEFAULT_TIMEOUT_MS = 60000;

const opencodeAgent = new (OPENCODE_URL.startsWith('https') ? https.Agent : http.Agent)({
  keepAlive: true,
  maxSockets: 10,
  timeout: 30000,
});

function safeProviderError(statusCode = 502) {
  const error = new ProviderError('Hệ thống gặp sự cố. Vui lòng thử lại sau.');
  error.statusCode = statusCode;
  error.retryable = isRetryableError({ statusCode });
  return error;
}

function buildProviderErrorFromUpstream({ statusCode, bodySnippet, headers, message }) {
  const classification = classifyProviderError({ statusCode, bodySnippet, headers, message });
  return new ProviderError('Hệ thống gặp sự cố. Vui lòng thử lại sau.', statusCode || 502, undefined, {
    providerErrorType: classification.providerErrorType,
    retryable: classification.retryable,
    cooldownScope: classification.cooldownScope,
    cooldownMs: classification.cooldownMs,
    upstreamStatusCode: statusCode || 502,
    upstreamRetryAfterMs: classification.retryAfterMs || null,
    upstreamBodySnippet: boundedSnippet(bodySnippet || message || '', 512),
  });
}

function opencodeRequest(method, urlPath, body, options) {
  const timeoutMs = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const signal = options?.signal;

  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, OPENCODE_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      agent: opencodeAgent,
      headers: {
        'Authorization': 'Basic ' + OPENCODE_AUTH,
        'Content-Type': 'application/json',
      },
    };

    let settled = false;
    let aborted = false;

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = lib.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString();
        const bodySnippet = boundedSnippet(data, 512);
        if (res.statusCode >= 400) {
          console.error('[OpenCode] Upstream error ' + res.statusCode + ':', sanitizeLogValue(bodySnippet));
          finishReject(buildProviderErrorFromUpstream({ statusCode: res.statusCode, bodySnippet: data, headers: res.headers }));
        } else {
          try {
            finishResolve(data ? JSON.parse(data) : null);
          } catch (err) {
            const error = buildProviderErrorFromUpstream({ statusCode: 502, bodySnippet: data, message: err.message });
            error.retryable = false;
            finishReject(error);
          }
        }
      });
    });

    req.on('error', (err) => {
      if (aborted || (err && err.name === 'AbortError')) {
        const error = safeProviderError(499);
        error.retryable = false;
        finishReject(error);
        return;
      }
      finishReject(buildProviderErrorFromUpstream({ statusCode: err?.code === 'ETIMEDOUT' ? 504 : 502, message: err?.message }));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finishReject(buildProviderErrorFromUpstream({ statusCode: 504, message: 'timeout', bodySnippet: 'timeout' }));
    });

    if (signal) {
      if (signal.aborted) {
        aborted = true;
        req.destroy();
        const error = safeProviderError(499);
        error.retryable = false;
        finishReject(error);
        return;
      }
      signal.addEventListener('abort', () => {
        aborted = true;
        req.destroy();
      }, { once: true });
    }

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function convertMessages(messages) {
  let systemPrompt = null;
  const parts = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content : msg.content.map(c => c.text).join('\n');
      systemPrompt = systemPrompt ? systemPrompt + '\n' + content : content;
    } else if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        parts.push({ type: 'text', text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ type: 'text', text: block.text });
          } else if (block.type === 'image_url') {
            parts.push({ type: 'file', mime: 'image/png', url: block.image_url.url });
          } else if (block.type === 'tool_result') {
            const resultContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            const tcId = block.tool_call_id ? '|' + block.tool_call_id.replace(/[^a-zA-Z0-9_-]/g, '') : '';
            parts.push({ type: 'text', text: '[Tool Result' + tcId + '] ' + resultContent.slice(0, 1000) });
          }
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        parts.push({ type: 'text', text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ type: 'text', text: block.text });
          }
        }
      }
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          const fnName = tc.function?.name || 'unknown';
          const fnArgs = tc.function?.arguments || '{}';
          const tcId = tc.id ? '|' + tc.id.replace(/[^a-zA-Z0-9_-]/g, '') : '';
          parts.push({ type: 'text', text: '[Tool Call' + tcId + '] ' + fnName + '(' + fnArgs + ')' });
        }
      }
    } else if (msg.role === 'tool') {
      const resultContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const tcId = msg.tool_call_id ? '|' + msg.tool_call_id.replace(/[^a-zA-Z0-9_-]/g, '') : '';
      parts.push({ type: 'text', text: '[Tool Result' + tcId + '] ' + resultContent.slice(0, 1000) });
    }
  }

  return { systemPrompt, parts };
}

function toOpenCodeTools(toolParams) {
  if (!toolParams?.tools || !Array.isArray(toolParams.tools)) return undefined;
  const tools = {};
  for (const tool of toolParams.tools) {
    if (!tool) continue;
    const name = tool.function?.name || tool.name;
    if (name && typeof name === 'string') tools[name] = true;
  }
  return Object.keys(tools).length > 0 ? tools : undefined;
}

async function createSession(options) {
  return await opencodeRequest('POST', '/session', { title: 'API Chat' }, options);
}

async function deleteSession(sessionId, options) {
  return await opencodeRequest('DELETE', '/session/' + sessionId, null, options);
}

async function handleSyncResponse(res, sessionId, providerID, modelID, modelName, parts, options, toolParams) {
  const requestFn = options?.requestFn || opencodeRequest;
  const openCodeTools = toOpenCodeTools(toolParams);
  const response = await requestFn('POST', '/session/' + sessionId + '/message', {
    model: { providerID, modelID },
    parts,
    ...(openCodeTools && { tools: openCodeTools }),
  }, options);

  if (!response || (typeof response === 'object' && Object.keys(response).length === 0)) {
    throw new Error('Empty response from OpenCode service');
  }

  if (response.info && response.info.error) {
    const errorMsg = response.info.error.message || response.info.error.error || 'Provider returned an error';
    throw new ProviderError(String(errorMsg));
  }

  const textParts = (response.parts || []).filter(p => p.type === 'text');
  const content = textParts.map(p => p.text).join('\n').trimStart();
  const safeContent = sanitizeText(content);
  const matchedContent = findMatchingPattern(content, SEVERE_LEAK_PATTERNS);
  if (matchedContent) {
    throw new PolicyViolationError('Response contains blocked content', matchedContent);
  }

  const toolUseParts = (response.parts || []).filter(p => p.type === 'tool_use');
  const toolCalls = toolUseParts.map(tu => ({
    id: tu.id || 'call_' + randomId().replace('chatcmpl-', ''),
    type: 'function',
    function: {
      name: tu.name || 'unknown',
      arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input || {}),
    },
  }));

  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      const args = tc.function.arguments || '';
      const matched = findMatchingPattern(args, SEVERE_LEAK_PATTERNS);
      if (matched) {
        throw new PolicyViolationError('Tool call arguments contain blocked content', matched);
      }
    }
  }

  const result = buildChatCompletionResponse({
    model: modelName,
    content: safeContent,
    finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    usage: {
      prompt_tokens: (response.info && response.info.tokens && response.info.tokens.input) || 0,
      completion_tokens: (response.info && response.info.tokens && response.info.tokens.output) || 0,
    },
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  });

  return result;
}

async function handleStreamingResponse(req, res, sessionId, providerID, modelID, modelName, parts, options, toolParams) {
  const signal = options?.signal;
  const requestFn = options?.requestFn || opencodeRequest;
  const isClosed = () => signal?.aborted || res.destroyed || res.writableEnded;

  if (isClosed()) return null;

  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
  }

  const completionId = randomId();

  const initialChunk = {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  };
    if (isClosed()) return null;
    res.write('data: ' + JSON.stringify(initialChunk) + '\n\n');

  try {
    const openCodeTools = toOpenCodeTools(toolParams);
    const response = await requestFn('POST', '/session/' + sessionId + '/message', {
      model: { providerID, modelID },
      parts,
      ...(openCodeTools && { tools: openCodeTools }),
    }, options);

    if (isClosed()) return null;

    if (!response || (!response.parts && !response.info) || (typeof response === 'object' && Object.keys(response).length === 0)) {
      if (res.headersSent) {
        const errorChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        };
        res.write('data: ' + JSON.stringify(errorChunk) + '\n\n');
        res.write('data: [DONE]\n\n');
        if (!res.writableEnded) res.end();
      }
      return { ok: false, error: new Error('Empty response from OpenCode service') };
    }

    const textParts = (response.parts || []).filter(p => p.type === 'text');
    const content = textParts.map(p => p.text).join('\n').trimStart();
    const safeContent = sanitizeText(content);
    const matchedContent = findMatchingPattern(content, SEVERE_LEAK_PATTERNS);
    if (matchedContent) {
      const errorChunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{ index: 0, delta: { content: '\n\nHệ thống gặp sự cố. Vui lòng thử lại sau.' }, finish_reason: 'stop' }],
      };
      res.write('data: ' + JSON.stringify(errorChunk) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
      return { ok: false };
    }

    const toolUseParts = (response.parts || []).filter(p => p.type === 'tool_use');
    const toolCalls = toolUseParts.map(tu => ({
      id: tu.id || 'call_' + randomId().replace('chatcmpl-', ''),
      type: 'function',
      function: {
        name: tu.name || 'unknown',
        arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input || {}),
      },
    }));

    if (toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const args = tc.function.arguments || '';
        const matched = findMatchingPattern(args, SEVERE_LEAK_PATTERNS);
        if (matched) {
          const errorChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelName,
            choices: [{ index: 0, delta: { content: '\n\nHệ thống gặp sự cố. Vui lòng thử lại sau.' }, finish_reason: 'stop' }],
          };
          res.write('data: ' + JSON.stringify(errorChunk) + '\n\n');
          res.write('data: [DONE]\n\n');
          res.end();
          return { ok: false };
        }
      }
    }

    const { CHUNK_SIZE } = require('../core/constants');
    for (let i = 0; i < safeContent.length; i += CHUNK_SIZE) {
      if (isClosed()) return null;
      const chunk = safeContent.slice(i, i + CHUNK_SIZE);
      const dataChunk = {
        id: completionId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
      };
      res.write('data: ' + JSON.stringify(dataChunk) + '\n\n');
    }

    if (toolCalls.length > 0 && !isClosed()) {
      toolCalls.forEach((tc, i) => {
        const toolCallChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelName,
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: i,
                id: tc.id,
                type: 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments },
              }],
            },
            finish_reason: null,
          }],
        };
        res.write('data: ' + JSON.stringify(toolCallChunk) + '\n\n');
      });
    }

    if (isClosed()) return null;

    const usage = {
      input: (response.info && response.info.tokens && response.info.tokens.input) || 0,
      output: (response.info && response.info.tokens && response.info.tokens.output) || 0,
    };

    const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
    const finalChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      usage: {
        prompt_tokens: usage.input,
        completion_tokens: usage.output,
        total_tokens: usage.input + usage.output,
      },
    };
    res.write('data: ' + JSON.stringify(finalChunk) + '\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
    return { ok: true, usage };
  } catch (error) {
    if (isClosed()) return null;
    try {
      res.write('\ndata: [DONE]\n\n');
      res.end();
    } catch (_) {}
    if (!error.retryable) error.retryable = true;
    return { ok: false, error };
  }
}

module.exports = {
  opencodeRequest,
  convertMessages,
  createSession,
  deleteSession,
  handleSyncResponse,
  handleStreamingResponse,
};
