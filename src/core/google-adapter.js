const { randomId } = require('./response');

const FINISH_REASON_MAP = {
  'stop': 'STOP',
  'length': 'MAX_TOKENS',
  'tool_calls': 'STOP',
  'content_filter': 'SAFETY',
};

function parseGoogleRequest(body, modelName, modelAliases) {
  const { contents, systemInstruction, generationConfig, tools, safetySettings } = body;
  const resolvedModel = modelAliases[modelName] || modelName;
  const messages = [];

  if (systemInstruction?.parts?.[0]?.text) {
    messages.push({ role: 'system', content: systemInstruction.parts[0].text });
  }

  for (const item of (contents || [])) {
    const role = item.role === 'model' ? 'assistant' : (item.role || 'user');
    const textParts = (item.parts || []).filter(p => p.text).map(p => p.text);
    const functionCallParts = (item.parts || []).filter(p => p.functionCall);
    const functionResponseParts = (item.parts || []).filter(p => p.functionResponse);

    if (functionCallParts.length > 0) {
      messages.push({
        role: 'assistant',
        content: textParts.join('\n') || null,
        tool_calls: functionCallParts.map((fc, i) => ({
          id: 'call_' + (fc.name || i),
          type: 'function',
          function: { name: fc.name, arguments: JSON.stringify(fc.args || {}) },
        })),
      });
    } else if (functionResponseParts.length > 0) {
      for (const fr of functionResponseParts) {
        messages.push({
          role: 'tool',
          tool_call_id: 'call_' + (fr.name || ''),
          content: JSON.stringify(fr.response || {}),
        });
      }
    } else {
      const text = textParts.join('\n');
      if (text) messages.push({ role, content: text });
    }
  }

  const result = {
    model: resolvedModel,
    messages,
    max_tokens: generationConfig?.maxOutputTokens || 4096,
    stream: false,
  };

  if (tools && tools.length > 0) {
    result.tools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.functionDeclarations?.name || t.name || 'unknown',
        description: t.functionDeclarations?.description || t.description || '',
        parameters: t.functionDeclarations?.parameters || t.parameters || { type: 'object', properties: {} },
      },
    }));
  }
  if (generationConfig?.temperature !== undefined) result.temperature = generationConfig.temperature;
  if (generationConfig?.stopSequences) result.stop = generationConfig.stopSequences;

  return result;
}

function buildGoogleResponse(openaiResp, model) {
  const choice = openaiResp.choices?.[0];
  const message = choice?.message || {};
  const usage = openaiResp.usage || {};

  const parts = [];
  if (message.content) {
    parts.push({ text: message.content });
  }
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const tc of message.tool_calls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = { raw: tc.function?.arguments }; }
      parts.push({
        functionCall: {
          name: tc.function?.name || 'unknown',
          args,
        },
      });
    }
  }
  if (parts.length === 0) {
    parts.push({ text: '' });
  }

  return {
    candidates: [{
      content: {
        parts,
        role: 'model',
      },
      finishReason: FINISH_REASON_MAP[choice?.finish_reason] || 'STOP',
    }],
    usageMetadata: {
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      totalTokenCount: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
    },
  };
}

function buildGoogleStreamEvents(response, model) {
  const choice = response.choices?.[0];
  const message = choice?.message || {};
  const usage = response.usage || {};
  const content = message.content || '';
  const toolCalls = message.tool_calls || [];

  const chunkSize = 20;
  const events = [];
  let contentIndex = 0;

  for (let i = 0; i < content.length; i += chunkSize) {
    events.push({
      data: JSON.stringify({
        candidates: [{
          content: {
            parts: [{ text: content.slice(0, i + chunkSize) }],
            role: 'model',
          },
          finishReason: null,
        }],
        usageMetadata: {
          promptTokenCount: usage.prompt_tokens || 0,
          candidatesTokenCount: usage.completion_tokens || 0,
          totalTokenCount: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
        },
      }),
    });
    contentIndex++;
  }

  for (const tc of toolCalls) {
    let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = { raw: tc.function?.arguments }; }
    events.push({
      data: JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                name: tc.function?.name || 'unknown',
                args,
              },
            }],
            role: 'model',
          },
          finishReason: null,
        }],
        usageMetadata: {
          promptTokenCount: usage.prompt_tokens || 0,
          candidatesTokenCount: usage.completion_tokens || 0,
          totalTokenCount: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
        },
      }),
    });
  }

  const finalParts = [];
  if (content) finalParts.push({ text: content });
  for (const tc of toolCalls) {
    let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = { raw: tc.function?.arguments }; }
    finalParts.push({ functionCall: { name: tc.function?.name || 'unknown', args } });
  }
  if (finalParts.length === 0) finalParts.push({ text: '' });

  events.push({
    data: JSON.stringify({
      candidates: [{
        content: {
          parts: finalParts,
          role: 'model',
        },
        finishReason: FINISH_REASON_MAP[choice?.finish_reason] || 'STOP',
      }],
      usageMetadata: {
        promptTokenCount: usage.prompt_tokens || 0,
        candidatesTokenCount: usage.completion_tokens || 0,
        totalTokenCount: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
      },
    }),
  });

  return events;
}

module.exports = { parseGoogleRequest, buildGoogleResponse, buildGoogleStreamEvents };
