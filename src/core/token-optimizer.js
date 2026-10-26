function countTokens(text) {
  if (!text) return 0;
  const words = text.split(/\s+/).length;
  const chars = text.length;
  const wordEstimate = words * 1.3;
  const charEstimate = chars * 0.25;
  return Math.max(1, Math.ceil(Math.max(wordEstimate, charEstimate)));
}

function contentToString(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(c => {
      if (c.type === 'text') return c.text || '';
      if (c.type === 'image_url') return '[Image]';
      if (c.type === 'image') return '[Image]';
      if (c.text) return c.text;
      return '';
    }).join(' ');
  }
  if (content && typeof content === 'object' && content.text) return content.text;
  return '';
}

function countMessagesTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    total += countTokens(contentToString(msg.content));
  }
  return total;
}

function roleToString(role) {
  if (role === 'user') return 'User';
  if (role === 'tool' || role === 'function') return 'Tool result';
  if (role === 'assistant') return 'Assistant';
  return 'Assistant';
}

function mergeToSummary(messages) {
  const bullets = messages.map((m) => {
    const role = roleToString(m.role);
    const content = contentToString(m.content);
    const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content;
    const toolCall = m.tool_calls ? ' [called tool]' : '';
    return `${role}${toolCall}: ${truncated}`;
  });
  return {
    role: 'system',
    content: '[Compressed history]\n' + bullets.join('\n'),
  };
}

function optimizeMessages(messages, modelInfo = {}, options = {}) {
  const {
    enabled = true,
    compressThreshold = 0.5,
    maxHistoryPairs = 3,
  } = options;

  if (!enabled || !messages || messages.length <= 2) {
    return { messages, stats: null };
  }

  const contextLimit = modelInfo.contextLimit || 128000;
  const totalTokens = countMessagesTokens(messages);
  const originalTokens = totalTokens;

  if (totalTokens < contextLimit * compressThreshold) {
    return { messages, stats: { originalTokens, compressedTokens: totalTokens, savedTokens: 0, strategy: 'none' } };
  }

  const systemMessages = messages.filter(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  if (chatMessages.length <= 2) {
    return { messages, stats: { originalTokens, compressedTokens: totalTokens, savedTokens: 0, strategy: 'none' } };
  }

  function isToolRelated(msg) {
    return msg.role === 'tool' || msg.role === 'function' || (msg.role === 'assistant' && msg.tool_calls);
  }

  const pairCount = Math.min(maxHistoryPairs * 2, chatMessages.length);
  let splitIndex = chatMessages.length - pairCount;

  while (splitIndex > 0 && isToolRelated(chatMessages[splitIndex])) {
    splitIndex--;
  }

  const recentChat = chatMessages.slice(splitIndex);
  const oldChat = chatMessages.slice(0, splitIndex);
  const oldTokens = countMessagesTokens(oldChat);

  if (oldChat.length === 0 || oldTokens < 20) {
    return { messages, stats: { originalTokens, compressedTokens: totalTokens, savedTokens: 0, strategy: 'none' } };
  }

  const summary = mergeToSummary(oldChat);
  const compressedMessages = [...systemMessages, summary, ...recentChat];
  const totalCompressed = countMessagesTokens(compressedMessages);
  const savedTokens = originalTokens - totalCompressed;

  if (totalCompressed > contextLimit * 0.9) {
    const messagesToDrop = Math.max(2, Math.floor((totalCompressed - contextLimit * 0.9) / 50));
    let truncationCount = Math.min(messagesToDrop, recentChat.length - 2);

    while (truncationCount > 0) {
      const wouldDrop = recentChat.slice(0, truncationCount);
      const hasToolInDrop = wouldDrop.some(m => isToolRelated(m));
      if (!hasToolInDrop) break;
      truncationCount--;
    }

    if (truncationCount > 0) {
      const keepCount = recentChat.length - truncationCount;
      const keptRecent = recentChat.slice(-keepCount);
      const droppedOld = recentChat.slice(0, recentChat.length - keepCount);

      const extra = mergeToSummary(droppedOld);
      const mergedSummary = {
        ...summary,
        content: summary.content + '\n' + extra.content,
      };

      const finalMessages = [...systemMessages, mergedSummary, ...keptRecent];
      const finalCompressedTokens = countMessagesTokens(finalMessages);

      return {
        messages: finalMessages,
        stats: {
          originalTokens,
          compressedTokens: finalCompressedTokens,
          savedTokens: originalTokens - finalCompressedTokens,
          strategy: 'compression+truncation',
          truncationCount: truncationCount,
        },
      };
    }
  }

  return {
    messages: compressedMessages,
    stats: {
      originalTokens,
      compressedTokens: totalCompressed,
      savedTokens,
      strategy: 'compression',
    },
  };
}

module.exports = { optimizeMessages, countTokens, countMessagesTokens };
