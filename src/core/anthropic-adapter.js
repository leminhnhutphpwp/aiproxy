const { randomId } = require('./response');

const FINISH_REASON_MAP = {
  'stop': 'end_turn',
  'length': 'max_tokens',
  'tool_calls': 'tool_use',
  'content_filter': 'end_turn',
};

function parseAnthropicRequest(body, modelAliases) {
  const { model, messages, max_tokens, system, stream, tools, tool_choice, temperature, stop_sequences } = body;

  const resolvedModel = modelAliases[model] || model;

  const openaiMessages = [];
  if (system) {
    const sysText = typeof system === 'string' ? system : (Array.isArray(system) ? system.map(b => b.text).join('\n') : '');
    if (sysText) openaiMessages.push({ role: 'system', content: sysText });
  }

  for (const msg of (messages || [])) {
    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter(b => b.type === 'text').map(b => b.text);
      const toolUseParts = msg.content.filter(b => b.type === 'tool_use');
      const toolResultParts = msg.content.filter(b => b.type === 'tool_result');
      content = textParts.join('\n');

      if (toolUseParts.length > 0) {
        openaiMessages.push({ role: 'assistant', content: content || null, tool_calls: toolUseParts.map((tu, i) => ({
          id: tu.id || 'call_' + i,
          type: 'function',
          function: { name: tu.name, arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input || {}) },
        }))});
        continue;
      }
      if (toolResultParts.length > 0) {
        for (const tr of toolResultParts) {
          const resultContent = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content || '');
          openaiMessages.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: resultContent });
        }
        continue;
      }
    }
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    openaiMessages.push({ role, content });
  }

  const result = {
    model: resolvedModel,
    messages: openaiMessages,
    max_tokens: max_tokens || 4096,
    stream: !!stream,
  };

  if (tools && tools.length > 0) {
    result.tools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || t.parameters || { type: 'object', properties: {} },
      },
    }));
  }
  if (tool_choice) result.tool_choice = tool_choice;
  if (temperature !== undefined) result.temperature = temperature;
  if (stop_sequences !== undefined) result.stop = stop_sequences;

  return result;
}

function buildAnthropicResponse(openaiResp, model) {
  const choice = openaiResp.choices?.[0];
  const message = choice?.message || {};
  const usage = openaiResp.usage || {};

  const content = [];
  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { input = { raw: tc.function?.arguments }; }
      content.push({
        type: 'tool_use',
        id: tc.id || 'call_' + randomId().replace('chatcmpl-', ''),
        name: tc.function?.name || 'unknown',
        input,
      });
    }
  }
  if (content.length === 0) {
    content.push({ type: 'text', text: '' });
  }

  return {
    id: 'msg_' + randomId().replace('chatcmpl-', ''),
    type: 'message',
    role: 'assistant',
    content,
    model: model,
    stop_reason: FINISH_REASON_MAP[choice?.finish_reason] || 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

function buildAnthropicStreamEvents(response, model) {
  const msgId = 'msg_' + randomId().replace('chatcmpl-', '');
  const choice = response.choices?.[0];
  const message = choice?.message || {};
  const content = message.content || '';
  const toolCalls = message.tool_calls || [];
  const usage = response.usage || {};

  const events = [];
  let contentBlockIndex = 0;

  events.push({
    event: 'message_start',
    data: JSON.stringify({
      type: 'message_start',
      message: {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: model,
        stop_reason: null,
        usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: 0 },
      },
    }),
  });

  if (content) {
    events.push({
      event: 'content_block_start',
      data: JSON.stringify({
        type: 'content_block_start',
        index: contentBlockIndex,
        content_block: { type: 'text', text: '' },
      }),
    });

    const chunkSize = 20;
    for (let i = 0; i < content.length; i += chunkSize) {
      events.push({
        event: 'content_block_delta',
        data: JSON.stringify({
          type: 'content_block_delta',
          index: contentBlockIndex,
          delta: { type: 'text_delta', text: content.slice(i, i + chunkSize) },
        }),
      });
    }

    events.push({
      event: 'content_block_stop',
      data: JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
    });
    contentBlockIndex++;
  }

  for (const tc of toolCalls) {
    const toolId = tc.id || 'call_' + randomId().replace('chatcmpl-', '');
    events.push({
      event: 'content_block_start',
      data: JSON.stringify({
        type: 'content_block_start',
        index: contentBlockIndex,
        content_block: { type: 'tool_use', id: toolId, name: tc.function?.name || 'unknown' },
      }),
    });

    const args = tc.function?.arguments || '{}';
    const argChunkSize = 50;
    for (let i = 0; i < args.length; i += argChunkSize) {
      events.push({
        event: 'content_block_delta',
        data: JSON.stringify({
          type: 'content_block_delta',
          index: contentBlockIndex,
          delta: { type: 'input_json_delta', partial_json: args.slice(i, i + argChunkSize) },
        }),
      });
    }

    events.push({
      event: 'content_block_stop',
      data: JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
    });
    contentBlockIndex++;
  }

  if (contentBlockIndex === 0) {
    events.push({
      event: 'content_block_start',
      data: JSON.stringify({
        type: 'content_block_start',
        index: contentBlockIndex,
        content_block: { type: 'text', text: '' },
      }),
    });
    events.push({
      event: 'content_block_stop',
      data: JSON.stringify({ type: 'content_block_stop', index: contentBlockIndex }),
    });
  }

  events.push({
    event: 'message_delta',
    data: JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: FINISH_REASON_MAP[choice?.finish_reason] || 'end_turn', output_tokens: usage.completion_tokens || 0 },
      usage: { output_tokens: usage.completion_tokens || 0 },
    }),
  });

  events.push({
    event: 'message_stop',
    data: JSON.stringify({ type: 'message_stop' }),
  });

  return events;
}

module.exports = { parseAnthropicRequest, buildAnthropicResponse, buildAnthropicStreamEvents };
