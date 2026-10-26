const http = require('http');
const https = require('https');
const { URL } = require('url');
const { ProviderError } = require('../core/errors');
const { DEFAULT_SAFE_MESSAGE, ANTHROPIC_VERSION } = require('../core/constants');
const { randomId } = require('../core/response');

const agents = {};

function getAgent(url) {
  const key = url.protocol + '//' + url.hostname + ':' + url.port;
  if (!agents[key]) {
    const isHttps = url.protocol === 'https:';
    const Agent = isHttps ? https.Agent : http.Agent;
    agents[key] = new Agent({ keepAlive: true, maxSockets: 10, timeout: 30000 });
  }
  return agents[key];
}

function getLib(url) {
  return url.protocol === 'https:' ? https : http;
}

function makeRequestOptions(url, apiKey, body, timeout, extraHeaders) {
  const isHttps = url.protocol === 'https:';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey,
    'Content-Length': Buffer.byteLength(body),
  };
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      headers[k] = v;
    }
  }
  const opts = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    agent: getAgent(url),
    path: url.pathname + url.search,
    method: 'POST',
    headers,
  };
  if (timeout) opts.timeout = timeout;
  return opts;
}

function toAnthropicMessages(messages) {
  const systemParts = [];
  const msgs = [];
  for (const msg of messages || []) {
    if (msg.role === 'system') {
      systemParts.push(typeof msg.content === 'string' ? msg.content : '');
      continue;
    }
    if (msg.role === 'tool') {
      const content = [];
      if (typeof msg.content === 'string') {
        content.push({ type: 'text', text: msg.content });
      } else if (Array.isArray(msg.content)) {
        content.push(...msg.content);
      } else {
        content.push({ type: 'text', text: JSON.stringify(msg.content) });
      }
      msgs.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id || '', content }] });
      continue;
    }
    if (msg.role === 'assistant') {
      const content = [];
      if (typeof msg.content === 'string' && msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function?.name || 'unknown',
            input: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })(),
          });
        }
      }
      msgs.push({ role: 'assistant', content });
      continue;
    }
    const content = [];
    if (typeof msg.content === 'string') {
      content.push({ type: 'text', text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') content.push({ type: 'text', text: block.text });
        else if (block.type === 'image_url') content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: block.image_url?.url || '' } });
      }
    }
    msgs.push({ role: msg.role || 'user', content });
  }
  return { messages: msgs, system: systemParts.join('\n') || undefined };
}

function parseAnthropicResponse(data, model) {
  try {
    const parsed = JSON.parse(data);
    if (!parsed.content || !Array.isArray(parsed.content)) {
      return null;
    }
    const textBlocks = parsed.content.filter(c => c.type === 'text');
    const toolUseBlocks = parsed.content.filter(c => c.type === 'tool_use');
    const rawUsage = parsed.usage || {};
    const toolCalls = toolUseBlocks.length > 0 ? toolUseBlocks.map((tb, i) => ({
      id: tb.id || 'call_' + i,
      type: 'function',
      function: {
        name: tb.name || 'unknown',
        arguments: typeof tb.input === 'string' ? tb.input : JSON.stringify(tb.input || {}),
      },
    })) : null;
    let finishReason = parsed.stop_reason || 'stop';
    if (finishReason === 'end_turn') finishReason = 'stop';
    if (finishReason === 'tool_use') finishReason = 'tool_calls';
    return {
      content: textBlocks.map(b => b.text).join('\n'),
      toolCalls,
      usage: {
        prompt_tokens: rawUsage.input_tokens || 0,
        completion_tokens: rawUsage.output_tokens || 0,
        total_tokens: (rawUsage.input_tokens || 0) + (rawUsage.output_tokens || 0),
      },
      model: parsed.model || model,
      finishReason,
    };
  } catch (e) {
    return null;
  }
}

function parseOpenAIResponse(data, model) {
  try {
    const parsed = JSON.parse(data);
    if (!parsed.choices || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
      return null;
    }
    const choice = parsed.choices[0];
    return {
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls || null,
      usage: parsed.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: parsed.model || model,
      finishReason: choice?.finish_reason || 'stop',
    };
  } catch (e) {
    return null;
  }
}

async function chatCompletion(providerConfig, model, messages, options) {
  const { baseUrl, apiKey, path, timeout: providerTimeout, headers: providerHeaders } = providerConfig;
  const { timeout, tools, tool_choice, temperature, max_tokens, top_p } = options || {};
  const apiPath = path || '/v1/chat/completions';
  const effectiveTimeout = providerTimeout || timeout;

  const url = new URL(apiPath, baseUrl);

  let bodyPayload;
  if (apiPath === '/v1/messages') {
    const { messages: anthroMsgs, system } = toAnthropicMessages(messages);
    bodyPayload = { model, messages: anthroMsgs };
    if (system) bodyPayload.system = system;
  } else {
    bodyPayload = { model, messages, stream: false };
  }
  if (tools) {
    if (apiPath === '/v1/messages') {
      bodyPayload.tools = tools.map(t => ({
        name: t.function?.name || t.name || 'unknown',
        description: t.function?.description || t.description || '',
        input_schema: t.function?.parameters || t.input_schema || { type: 'object', properties: {} },
      }));
    } else {
      bodyPayload.tools = tools;
    }
  }
  if (tool_choice) {
    if (apiPath === '/v1/messages') {
      const wantsNone = tool_choice === 'none' || (typeof tool_choice === 'object' && tool_choice.type === 'none');
      const wantsAny = tool_choice === 'required' || tool_choice === 'any' || (typeof tool_choice === 'object' && tool_choice.type === 'any');
      const wantsSpecific = typeof tool_choice === 'object' && tool_choice.type === 'function';
      if (wantsNone) {
        bodyPayload.tool_choice = { type: 'none' };
      } else if (wantsAny || wantsSpecific) {
        bodyPayload.tool_choice = { type: 'any' };
      }
      // 'auto' or {type: 'auto'}: don't send (model decides)
    } else {
      bodyPayload.tool_choice = tool_choice;
    }
  }
  if (temperature !== undefined) bodyPayload.temperature = temperature;
  if (max_tokens !== undefined) bodyPayload.max_tokens = max_tokens;
  if (top_p !== undefined) bodyPayload.top_p = top_p;
  const body = JSON.stringify(bodyPayload);

  return new Promise((resolve, reject) => {
    const reqOptions = makeRequestOptions(url, apiKey, body, effectiveTimeout, providerHeaders);
    if (apiPath === '/v1/messages') {
      reqOptions.headers['anthropic-version'] = ANTHROPIC_VERSION;
    }
    const lib = getLib(url);
    const req = lib.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString();
        if (res.statusCode >= 400) {
          console.error('[OpenAICompat] Upstream error ' + res.statusCode + ':', data.slice(0, 200));
          reject(new ProviderError(DEFAULT_SAFE_MESSAGE));
          return;
        }
        try {
          let result;
          if (apiPath === '/v1/messages') {
            result = parseAnthropicResponse(data, model);
          } else {
            result = parseOpenAIResponse(data, model);
          }
          if (!result) {
            reject(new ProviderError(DEFAULT_SAFE_MESSAGE));
            return;
          }
          resolve(result);
        } catch (e) {
          console.error('[OpenAICompat] Parse error:', e.message);
          reject(new ProviderError(DEFAULT_SAFE_MESSAGE));
        }
      });
    });

    req.on('error', (err) => {
      console.error('[OpenAICompat] Request error:', err.code, err.message, 'url:', url.href, 'tls:', req.destroyed || false);
      reject(new ProviderError(DEFAULT_SAFE_MESSAGE));
    });

    if (effectiveTimeout) {
      req.on('timeout', () => {
        req.destroy();
        reject(new ProviderError(DEFAULT_SAFE_MESSAGE));
      });
    }

    req.write(body);
    req.end();
  });
}

function chatCompletionStream(providerConfig, model, messages, downstreamRes, options) {
  const { baseUrl, apiKey, path, timeout, headers: providerHeaders } = providerConfig;
  const { tools, tool_choice, temperature, max_tokens, top_p } = options || {};
  const apiPath = path || '/v1/chat/completions';

  const url = new URL(apiPath, baseUrl);

  const isAnthropic = apiPath === '/v1/messages';
  let bodyPayload;
  if (isAnthropic) {
    const { messages: anthroMsgs, system } = toAnthropicMessages(messages);
    bodyPayload = { model, messages: anthroMsgs };
    bodyPayload.stream = true;
    bodyPayload.max_tokens = max_tokens || 4096;
    if (system) bodyPayload.system = system;
  } else {
    bodyPayload = { model, messages };
    bodyPayload.stream = true;
  }
  if (tools) {
    if (isAnthropic) {
      bodyPayload.tools = tools.map(t => ({
        name: t.function?.name || t.name || 'unknown',
        description: t.function?.description || t.description || '',
        input_schema: t.function?.parameters || t.input_schema || { type: 'object', properties: {} },
      }));
    } else {
      bodyPayload.tools = tools;
    }
  }
  if (tool_choice) {
    if (isAnthropic) {
      const wantsNone = tool_choice === 'none' || (typeof tool_choice === 'object' && tool_choice.type === 'none');
      const wantsAny = tool_choice === 'required' || tool_choice === 'any' || (typeof tool_choice === 'object' && tool_choice.type === 'any');
      const wantsSpecific = typeof tool_choice === 'object' && tool_choice.type === 'function';
      if (wantsNone) {
        bodyPayload.tool_choice = { type: 'none' };
      } else if (wantsAny || wantsSpecific) {
        bodyPayload.tool_choice = { type: 'any' };
      }
      // 'auto' or {type: 'auto'}: don't send (model decides)
    } else {
      bodyPayload.tool_choice = tool_choice;
    }
  }
  if (temperature !== undefined) bodyPayload.temperature = temperature;
  if (max_tokens !== undefined) bodyPayload.max_tokens = max_tokens;
  if (top_p !== undefined) bodyPayload.top_p = top_p;
  const body = JSON.stringify(bodyPayload);

  return new Promise((resolve, reject) => {
    const lib = getLib(url);
    const reqOptions = makeRequestOptions(url, apiKey, body, timeout, providerHeaders);
    if (isAnthropic) {
      reqOptions.headers['anthropic-version'] = ANTHROPIC_VERSION;
    }
    let resolved = false;
    let totalTimer;

    const req = lib.request(reqOptions, (upstreamRes) => {
      if (upstreamRes.statusCode >= 400) {
        const chunks = [];
        upstreamRes.on('data', (chunk) => chunks.push(chunk));
        upstreamRes.on('end', () => {
          const errData = Buffer.concat(chunks).toString();
          console.error('[OpenAICompat] Stream error ' + upstreamRes.statusCode + ':', errData.slice(0, 200));
          reject(new ProviderError(DEFAULT_SAFE_MESSAGE));
        });
        return;
      }

      let buffer = '';
      let streamUsage = null;
      let anthropicContent = '';
      let doneSent = false;
      let streamFinishReason = 'stop';

      function resetIdleTimer() {
        clearTimeout(totalTimer);
        totalTimer = setTimeout(() => {
          if (!resolved) {
            req.destroy();
            reject(new ProviderError('Stream idle timeout'));
          }
        }, (timeout || 60000) + 5000);
      }
      resetIdleTimer();

      const openaiToolCalls = {};

      function sendOpenAIChunk(text) {
        if (!text) return;
        const chunk = {
          id: randomId(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        };
        downstreamRes.write('data: ' + JSON.stringify(chunk) + '\n\n');
      }

      function sendOpenAIToolCallDelta(toolCalls) {
        if (!toolCalls || toolCalls.length === 0) return;
        const chunk = {
          id: randomId(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { tool_calls: toolCalls }, finish_reason: null }],
        };
        downstreamRes.write('data: ' + JSON.stringify(chunk) + '\n\n');
      }

      function sendDone() {
        if (doneSent) return;
        doneSent = true;
        downstreamRes.write('data: [DONE]\n\n');
      }

      function extractDataLine(text) {
        for (const ln of text.split('\n')) {
          const t = ln.trim();
          if (t.startsWith('data: ')) return t.slice(6);
          if (t === 'data: [DONE]') return '[DONE]';
        }
        return null;
      }

      function emitFinalChunk() {
        const finishReason = Object.keys(openaiToolCalls).length > 0 ? 'tool_calls' : streamFinishReason || 'stop';
        const chunk = {
          id: randomId(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
          usage: streamUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
        downstreamRes.write('data: ' + JSON.stringify(chunk) + '\n\n');
      }

      function finalize() {
        if (resolved) return;
        resolved = true;
        clearTimeout(totalTimer);
        emitFinalChunk();
        sendDone();
        downstreamRes.end();
        const toolCallsList = Object.values(openaiToolCalls).map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        }));
        resolve({
          content: anthropicContent || '',
          toolCalls: toolCallsList.length > 0 ? toolCallsList : null,
          usage: streamUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          model,
          finishReason: streamFinishReason,
        });
      }

      upstreamRes.on('data', (chunk) => {
        resetIdleTimer();
        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const jsonStr = extractDataLine(part);
          if (jsonStr === null) continue;
          if (jsonStr === '[DONE]') {
            downstreamRes.write('data: [DONE]\n\n');
            if (!resolved) {
              resolved = true;
              clearTimeout(totalTimer);
              downstreamRes.end();
              const toolCallsList = Object.values(openaiToolCalls).map(tc => ({
                id: tc.id, type: 'function',
                function: { name: tc.name, arguments: tc.arguments },
              }));
              const usage = streamUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
              resolve({ content: '', toolCalls: toolCallsList.length > 0 ? toolCallsList : null, usage, model, finishReason: streamFinishReason });
            }
            continue;
          }
          try {
            const parsed = JSON.parse(jsonStr);
            if (isAnthropic) {
              if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
                const idx = parsed.index;
                openaiToolCalls[idx] = { id: parsed.content_block.id, name: parsed.content_block.name, arguments: '' };
              } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'input_json_delta') {
                const idx = parsed.index;
                if (openaiToolCalls[idx]) openaiToolCalls[idx].arguments += parsed.delta.partial_json;
              } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                anthropicContent += parsed.delta.text;
                sendOpenAIChunk(parsed.delta.text);
              } else if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'thinking_delta') {
              } else if (parsed.type === 'content_block_stop') {
                const idx = parsed.index;
                if (openaiToolCalls[idx]) {
                  sendOpenAIToolCallDelta([{ index: idx, id: openaiToolCalls[idx].id, type: 'function', function: { name: openaiToolCalls[idx].name, arguments: openaiToolCalls[idx].arguments } }]);
                }
              } else if (parsed.type === 'message_delta') {
                if (parsed.usage) {
                  streamUsage = {
                    prompt_tokens: parsed.usage.input_tokens || 0,
                    completion_tokens: parsed.usage.output_tokens || 0,
                    total_tokens: (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0),
                  };
                }
                if (parsed.delta?.stop_reason === 'tool_use') streamFinishReason = 'tool_calls';
              } else if (parsed.type === 'message_stop') {
                finalize();
              }
            } else {
              downstreamRes.write(part + '\n\n');
              if (parsed.usage) {
                streamUsage = parsed.usage;
              }
              if (parsed.choices?.[0]?.delta?.tool_calls) {
                for (const tc of parsed.choices[0].delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!openaiToolCalls[idx]) openaiToolCalls[idx] = { id: '', name: '', arguments: '' };
                  if (tc.id) openaiToolCalls[idx].id = tc.id;
                  if (tc.type) openaiToolCalls[idx].type = tc.type;
                  if (tc.function?.name) openaiToolCalls[idx].name = tc.function.name;
                  if (tc.function?.arguments) openaiToolCalls[idx].arguments += tc.function.arguments;
                }
              }
              if (parsed.choices?.[0]?.finish_reason) {
                streamFinishReason = parsed.choices[0].finish_reason === 'tool_calls' ? 'tool_calls' : parsed.choices[0].finish_reason;
              }
            }
          } catch (e) {
          }
        }
      });

      function onUpstreamEnd() {
        if (isAnthropic) {
          finalize();
        } else {
          if (resolved) return;
          resolved = true;
          emitFinalChunk();
          if (buffer.trim()) {
            const trimmedBuf = buffer.toString().trim();
            if (trimmedBuf.startsWith('data: ')) {
              downstreamRes.write(buffer);
              if (!buffer.includes('[DONE]')) {
                downstreamRes.write('\n\ndata: [DONE]\n\n');
              }
            } else {
              downstreamRes.write('data: [DONE]\n\n');
            }
          } else {
            downstreamRes.write('data: [DONE]\n\n');
          }
          downstreamRes.end();
          const toolCallsList = Object.values(openaiToolCalls).map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          }));
          const usage = streamUsage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          resolve({ content: '', toolCalls: toolCallsList.length > 0 ? toolCallsList : null, usage, model, finishReason: streamFinishReason });
        }
      }

      upstreamRes.on('end', onUpstreamEnd);
      upstreamRes.on('close', onUpstreamEnd);
    });

    req.on('error', (err) => {
      clearTimeout(totalTimer);
      console.error('[OpenAICompat] Stream request error:', err.message);
      reject(new ProviderError(DEFAULT_SAFE_MESSAGE));
    });

    req.on('timeout', () => {
      req.destroy(new Error('Stream request timeout'));
    });

    req.setTimeout(timeout || 60000);

    downstreamRes.on('close', () => {
      clearTimeout(totalTimer);
      if (!resolved) {
        if (req && !req.destroyed) req.destroy();
        reject(new ProviderError('Client disconnected'));
      }
    });

    req.write(body);
    req.end();
  });
}

module.exports = { chatCompletion, chatCompletionStream };
