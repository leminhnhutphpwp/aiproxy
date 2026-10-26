const fs = require('fs');
const path = require('path');

const SAVINGS_DIR = path.join(__dirname, '..', '..', 'config', 'savings');
let dirChecked = false;
let _statsCache = null;
let _statsCacheTime = 0;
const SAVINGS_CACHE_TTL = 60000;

function ensureDir() {
  if (!dirChecked) {
    if (!fs.existsSync(SAVINGS_DIR)) {
      fs.mkdirSync(SAVINGS_DIR, { recursive: true });
    }
    dirChecked = true;
  }
}

function getDailyFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(SAVINGS_DIR, `${date}.jsonl`);
}

function recordSavings(entry) {
  try {
    const line = JSON.stringify({
      ts: Date.now(),
      requestId: entry.requestId || null,
      userId: entry.userId || null,
      model: entry.model || 'unknown',
      provider: entry.provider || 'unknown',
      originalTokens: entry.originalTokens || 0,
      compressedTokens: entry.compressedTokens || 0,
      outputTokens: entry.outputTokens || 0,
      savedTokens: (entry.originalTokens || 0) - (entry.compressedTokens || 0),
      strategy: entry.strategy || 'none',
      optimizeEnabled: entry.optimizeEnabled !== false,
    }) + '\n';
    fs.appendFileSync(getDailyFilePath(), line, 'utf8');
    _statsCache = null;
  } catch (e) {}
}

function recordOutputTokens(requestId, outputTokens) {
  if (!requestId) return;
  try {
    const date = new Date().toISOString().slice(0, 10);
    ensureDir();
    const files = fs.readdirSync(SAVINGS_DIR).filter(f => f.startsWith(date) && f.endsWith('.jsonl'));
    for (const file of files) {
      const filePath = path.join(SAVINGS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      let updated = false;
      const newLines = lines.map(line => {
        try {
          const entry = JSON.parse(line);
          if (entry.requestId === requestId) {
            entry.outputTokens = outputTokens;
            updated = true;
            return JSON.stringify(entry);
          }
        } catch (e) {}
        return line;
      });
      if (updated) {
        fs.writeFileSync(filePath, newLines.join('\n') + '\n', 'utf8');
        break;
      }
    }
    _statsCache = null;
  } catch (e) {}
}

function getStats(userId, days = 7) {
  const now = Date.now();
  if (_statsCache && (now - _statsCacheTime) < SAVINGS_CACHE_TTL && _statsCache._days === days && _statsCache._userId === userId) {
    return _statsCache;
  }
  ensureDir();
  const cutoff = now - days * 86400000;
  const files = fs.existsSync(SAVINGS_DIR) ? fs.readdirSync(SAVINGS_DIR).filter(f => f.endsWith('.jsonl')) : [];
  const byModel = {};
  const dailyStats = {};
  let totalOriginal = 0;
  let totalCompressed = 0;
  let totalOutput = 0;
  let totalRequests = 0;
  let cacheHits = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(SAVINGS_DIR, file), 'utf8').trim();
      if (!content) continue;
      const lines = content.split('\n');
      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.ts < cutoff) continue;
        if (userId && entry.userId !== userId) continue;

        totalRequests++;
        totalOriginal += entry.originalTokens || 0;
        totalCompressed += entry.compressedTokens || 0;
        totalOutput += entry.outputTokens || 0;
        if (entry.strategy === 'cache') cacheHits++;

        if (entry.model) {
          if (!byModel[entry.model]) {
            byModel[entry.model] = { original: 0, compressed: 0, output: 0, count: 0 };
          }
          byModel[entry.model].original += entry.originalTokens || 0;
          byModel[entry.model].compressed += entry.compressedTokens || 0;
          byModel[entry.model].output += entry.outputTokens || 0;
          byModel[entry.model].count++;
        }

        const date = new Date(entry.ts).toISOString().slice(0, 10);
        if (!dailyStats[date]) {
          dailyStats[date] = { requests: 0, original: 0, compressed: 0, output: 0 };
        }
        dailyStats[date].requests++;
        dailyStats[date].original += entry.originalTokens || 0;
        dailyStats[date].compressed += entry.compressedTokens || 0;
        dailyStats[date].output += entry.outputTokens || 0;
      }
    } catch (e) {}
  }

  const totalSaved = totalOriginal - totalCompressed;
  _statsCache = {
    totalOriginalTokens: totalOriginal,
    totalCompressedTokens: totalCompressed,
    totalSavedTokens: totalSaved,
    totalOutputTokens: totalOutput,
    totalRequests,
    savingsPercent: totalOriginal > 0 ? Math.round((totalSaved / totalOriginal) * 100) : 0,
    avgCompressionRatio: totalCompressed > 0 ? (totalOriginal / totalCompressed).toFixed(1) : '1.0',
    cacheHitRate: totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 100) : 0,
    byModel: Object.entries(byModel)
      .map(([model, data]) => ({
        model,
        originalTokens: data.original,
        compressedTokens: data.compressed,
        savedTokens: data.original - data.compressed,
        percent: data.original > 0 ? Math.round(((data.original - data.compressed) / data.original) * 100) : 0,
        requests: data.count,
      }))
      .sort((a, b) => b.savedTokens - a.savedTokens),
    dailyStats: Object.entries(dailyStats)
      .map(([date, data]) => ({
        date,
        requests: data.requests,
        original: data.original,
        compressed: data.compressed,
        saved: data.original - data.compressed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    _days: days,
    _userId: userId,
  };
  _statsCacheTime = now;
  return _statsCache;
}

function cleanupOldFiles() {
  try {
    ensureDir();
    const files = fs.readdirSync(SAVINGS_DIR).filter(f => f.endsWith('.jsonl'));
    const cutoff = Date.now() - 30 * 86400000;
    for (const file of files) {
      const fp = path.join(SAVINGS_DIR, file);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) fs.unlinkSync(fp);
    }
  } catch (e) { /* silently fail */ }
}

function reset() {
  _statsCache = null;
  ensureDir();
  const files = fs.readdirSync(SAVINGS_DIR).filter(f => f.endsWith('.jsonl'));
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(SAVINGS_DIR, file));
    } catch (e) {}
  }
}

module.exports = { recordSavings, getStats, reset, recordOutputTokens, cleanupOldFiles };
