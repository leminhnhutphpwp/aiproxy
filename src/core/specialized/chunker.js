const { estimateTokens } = require('./tokenizer');

function detectInlineCode(text) {
  const matches = text.match(/`([^`]+)`/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/`/g, '')).filter(c => c.length > 1);
}

function determineBlockType(block, inlineCodes) {
  if (block.type === 'code') return 'code';
  if (block.type === 'table') return 'table';
  if (block.type === 'heading') return 'heading';
  if (inlineCodes.length > 0) return 'inline-code';
  return 'paragraph';
}

function detectBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line.trim())) {
      const fence = line.trim();
      const start = i;
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) i++;
      if (i < lines.length) i++;
      const codeContent = lines.slice(start, i).join('\n');
      blocks.push({ type: 'code', content: codeContent, lineStart: start, lineEnd: i - 1, subType: 'code' });
      continue;
    }

    if (/^#+\s/.test(line.trim())) {
      const headingLevel = line.trim().match(/^(#+)/)[1].length;
      const headingText = line.trim().replace(/^#+\s*/, '');
      const headingStart = i;
      i++;

      let paraLines = [];
      while (i < lines.length && !/^```/.test(lines[i].trim()) && !/^#+\s/.test(lines[i].trim()) && !/^\|.+\|$/.test(lines[i].trim()) && !/^\|[-\s|]+\|$/.test(lines[i].trim())) {
        if (lines[i].trim() !== '') {
          paraLines.push(lines[i]);
        }
        i++;
      }

      let content = lines[headingStart];
      let headingEnd = headingStart;
      if (paraLines.length > 0) {
        content += '\n' + paraLines.join('\n');
        headingEnd = headingStart + paraLines.length;
      }

      const inlineCodes = detectInlineCode(content);
      blocks.push({
        type: 'heading',
        level: headingLevel,
        heading: headingText,
        content,
        lineStart: headingStart,
        lineEnd: headingEnd,
        inlineCodes,
        subType: determineBlockType({ type: 'heading' }, inlineCodes),
      });
      continue;
    }

    if (/^\|.+\|$/.test(line.trim()) || /^\|[-\s|]+\|$/.test(line.trim())) {
      const start = i;
      i++;
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) i++;
      const tableContent = lines.slice(start, i).join('\n');
      blocks.push({ type: 'table', content: tableContent, lineStart: start, lineEnd: i - 1, subType: 'table', inlineCodes: [] });
      continue;
    }

    if (line.trim() === '') {
      blocks.push({ type: 'blank', content: line, lineStart: i, lineEnd: i, subType: 'blank', inlineCodes: [] });
      i++;
      continue;
    }

    const start = i;
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i].trim()) && !/^#+\s/.test(lines[i].trim()) && !/^\|.+\|$/.test(lines[i].trim()) && !/^\|[-\s|]+\|$/.test(lines[i].trim())) {
      i++;
    }
    const paraContent = lines.slice(start, i).join('\n');
    const inlineCodes = detectInlineCode(paraContent);
    blocks.push({
      type: 'paragraph',
      content: paraContent,
      lineStart: start,
      lineEnd: i - 1,
      inlineCodes,
      subType: determineBlockType({ type: 'paragraph' }, inlineCodes),
    });
  }

  return blocks;
}

function splitSentences(text) {
  const result = [];
  const parts = text.split(/(?<=[.!?])\s+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) result.push(trimmed);
  }
  return result;
}

function preserveBlockInChunk(block) {
  return block.type === 'code' || block.type === 'table';
}

function getPrimarySubType(blocks) {
  const counts = { code: 0, table: 0, 'inline-code': 0, heading: 0, paragraph: 0 };
  for (const b of blocks) {
    const st = b.subType || b.type;
    counts[st] = (counts[st] || 0) + 1;
  }
  let maxType = 'paragraph';
  let maxCount = 0;
  for (const [type, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxType = type;
    }
  }
  return maxType;
}

function chunkText(text, options = {}) {
  const maxTokens = options.maxTokens || 500;
  const overlapTokens = options.overlapTokens || 50;
  const source = options.source || 'unknown';

  if (!text || text.trim().length === 0) return [];

  const blocks = detectBlocks(text);
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;
  let currentLineStart = blocks[0]?.lineStart || 0;
  let chunkId = 0;

  function flushCurrentChunk() {
    if (currentChunk.length === 0) return null;
    const content = currentChunk.map(b => b.content).join('\n');
    const allInlineCodes = currentChunk.flatMap(b => b.inlineCodes || []);
    const headingInfo = currentChunk.find(b => b.type === 'heading');
    const chunk = {
      id: 'chunk-' + String(chunkId++).padStart(3, '0'),
      content,
      source,
      tokens: estimateTokens(content),
      lineStart: currentLineStart,
      lineEnd: currentChunk[currentChunk.length - 1].lineEnd,
      primaryType: getPrimarySubType(currentChunk),
      inlineCodes: [...new Set(allInlineCodes)],
    };
    if (headingInfo) {
      chunk.heading = headingInfo.heading;
      chunk.headingLevel = headingInfo.level;
    }
    chunks.push(chunk);
    return chunk;
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === 'blank') continue;

    const blockTokens = estimateTokens(block.content);

    if (currentTokens + blockTokens <= maxTokens) {
      if (currentChunk.length === 0) currentLineStart = block.lineStart;
      currentChunk.push(block);
      currentTokens += blockTokens;
      continue;
    }

    flushCurrentChunk();

    const overlap = [];
    let overlapTokensCount = 0;
    for (let j = currentChunk.length - 1; j >= 0; j--) {
      const b = currentChunk[j];
      if (preserveBlockInChunk(b)) break;
      const bt = estimateTokens(b.content);
      if (overlapTokensCount + bt > overlapTokens) break;
      overlap.unshift(b);
      overlapTokensCount += bt;
    }

    currentChunk = [...overlap];
    currentTokens = overlapTokensCount;
    currentLineStart = overlap.length > 0 ? overlap[0].lineStart : block.lineStart;

    if (currentTokens + blockTokens <= maxTokens) {
      currentChunk.push(block);
      currentTokens += blockTokens;
    } else if (blockTokens > maxTokens) {
      if (block.type === 'code' || block.type === 'table') {
        const content = block.content;
        const inlineCodes = block.inlineCodes || [];
        const chunk = {
          id: 'chunk-' + String(chunkId++).padStart(3, '0'),
          content,
          source,
          tokens: estimateTokens(content),
          lineStart: block.lineStart,
          lineEnd: block.lineEnd,
          primaryType: block.type,
          inlineCodes: [...new Set(inlineCodes)],
        };
        if (block.heading) {
          chunk.heading = block.heading;
          chunk.headingLevel = block.level;
        }
        chunks.push(chunk);
        continue;
      }

      const sentences = splitSentences(block.content);
      let sentBuf = [];
      let sentTokens = 0;

      for (const sent of sentences) {
        const st = estimateTokens(sent);
        if (sentTokens + st <= maxTokens) {
          sentBuf.push({ type: 'inline', content: sent, lineStart: block.lineStart, lineEnd: block.lineEnd, inlineCodes: detectInlineCode(sent), subType: 'paragraph' });
          sentTokens += st;
        } else {
          if (sentBuf.length > 0) {
            const content = sentBuf.map(b => b.content).join(' ');
            const allCodes = sentBuf.flatMap(b => b.inlineCodes || []);
            chunks.push({
              id: 'chunk-' + String(chunkId++).padStart(3, '0'),
              content,
              source,
              tokens: estimateTokens(content),
              lineStart: block.lineStart,
              lineEnd: block.lineEnd,
              primaryType: allCodes.length > 0 ? 'inline-code' : 'paragraph',
              inlineCodes: [...new Set(allCodes)],
            });
          }
          sentBuf = [{ type: 'inline', content: sent, lineStart: block.lineStart, lineEnd: block.lineEnd, inlineCodes: detectInlineCode(sent), subType: 'paragraph' }];
          sentTokens = st;
        }
      }
      if (sentBuf.length > 0) {
        currentChunk = sentBuf;
        currentTokens = sentTokens;
        currentLineStart = block.lineStart;
      }
    } else {
      currentChunk = [block];
      currentTokens = blockTokens;
      currentLineStart = block.lineStart;
    }
  }

  if (currentChunk.length > 0) {
    flushCurrentChunk();
  }

  return chunks;
}

module.exports = { chunkText, estimateTokens, detectBlocks };
