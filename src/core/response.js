const crypto = require('crypto');
const { normalizeError } = require('./errors');

function randomId(prefix = 'chatcmpl') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`;
}

function buildChatCompletionResponse({ model, content, finishReason, usage, id, toolCalls }) {
  const responseId = id || randomId();
  const message = { role: 'assistant', content: content || '' };
  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  return {
    id: responseId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason || 'stop',
    }],
    usage: {
      prompt_tokens: usage?.prompt_tokens || 0,
      completion_tokens: usage?.completion_tokens || 0,
      total_tokens: (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0),
    },
  };
}

function buildModelListResponse(models) {
  return {
    object: 'list',
    data: models.map(m => ({
      id: m.id,
      object: 'model',
      created: m.created || Math.floor(Date.now() / 1000),
      owned_by: m.owned_by || 'aiproxy',
    })),
  };
}

function buildErrorResponse(error, requestId) {
  return normalizeError(error, requestId);
}

module.exports = {
  buildChatCompletionResponse,
  buildModelListResponse,
  buildErrorResponse,
  randomId,
};
