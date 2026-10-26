const { randomId } = require('./response');

function parseResponsesRequest(body, modelAliases) {
  const { model, input, instructions, stream, temperature, max_output_tokens } = body;
  const resolvedModel = modelAliases[model] || model;
  const messages = [];

  if (instructions) {
    messages.push({ role: 'system', content: instructions });
  }

  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (item.role && item.content) {
        const role = item.role === 'developer' ? 'system' : item.role;
        const content = typeof item.content === 'string' ? item.content : '';
        if (content) messages.push({ role, content });
      }
    }
  }

  const result = {
    model: resolvedModel,
    messages,
    max_tokens: max_output_tokens || 4096,
    stream: !!stream,
  };

  if (temperature !== undefined) result.temperature = temperature;

  return result;
}

function buildResponsesResponse(openaiResp, model) {
  const choice = openaiResp.choices?.[0];
  const message = choice?.message || {};
  const usage = openaiResp.usage || {};
  const content = message.content || '';

  return {
    id: 'resp_' + randomId().replace('chatcmpl-', ''),
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    model,
    output: [
      {
        type: 'message',
        id: 'msg_' + randomId().replace('chatcmpl-', ''),
        role: 'assistant',
        content: [{ type: 'output_text', text: content }],
      },
    ],
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      total_tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    },
  };
}

function buildResponsesStreamEvents(response, model) {
  const respId = 'resp_' + randomId().replace('chatcmpl-', '');
  const msgId = 'msg_' + randomId().replace('chatcmpl-', '');
  const choice = response.choices?.[0];
  const content = choice?.message?.content || '';
  const usage = response.usage || {};
  const events = [];

  events.push({
    event: 'response.created',
    data: JSON.stringify({
      type: 'response.created',
      response: {
        id: respId,
        created_at: Math.floor(Date.now() / 1000),
        model,
        output: [],
        usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: 0, total_tokens: usage.prompt_tokens || 0 },
      },
    }),
  });

  events.push({
    event: 'response.output_item.added',
    data: JSON.stringify({
      type: 'response.output_item.added',
      item: { type: 'message', id: msgId, role: 'assistant', content: [] },
    }),
  });

  events.push({
    event: 'response.content_part.added',
    data: JSON.stringify({ type: 'response.content_part.added', part: { type: 'output_text', text: '' } }),
  });

  if (content) {
    const chunkSize = 20;
    for (let i = 0; i < content.length; i += chunkSize) {
      events.push({
        event: 'response.output_text.delta',
        data: JSON.stringify({ type: 'response.output_text.delta', index: 0, delta: content.slice(i, i + chunkSize) }),
      });
    }
  }

  events.push({
    event: 'response.output_text.done',
    data: JSON.stringify({ type: 'response.output_text.done', index: 0, text: content }),
  });

  events.push({
    event: 'response.content_part.done',
    data: JSON.stringify({ type: 'response.content_part.done' }),
  });

  events.push({
    event: 'response.output_item.done',
    data: JSON.stringify({ type: 'response.output_item.done' }),
  });

  events.push({
    event: 'response.completed',
    data: JSON.stringify({
      type: 'response.completed',
      response: {
        id: respId,
        created_at: Math.floor(Date.now() / 1000),
        model,
        output: [{ type: 'message', id: msgId, role: 'assistant', content: [{ type: 'output_text', text: content }] }],
        usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0, total_tokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) },
      },
    }),
  });

  return events;
}

module.exports = { parseResponsesRequest, buildResponsesResponse, buildResponsesStreamEvents };
