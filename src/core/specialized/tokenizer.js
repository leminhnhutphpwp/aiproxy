function estimateTokens(text) {
  if (!text) return 0;
  let tokens = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) {
      tokens += 1;
    } else if (code <= 0x7ff) {
      tokens += 2;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      tokens += 2;
    } else {
      tokens += 3;
    }
  }
  return Math.max(1, Math.ceil(tokens / 4));
}

function countTokens(text) {
  return estimateTokens(text);
}

module.exports = { estimateTokens, countTokens };
