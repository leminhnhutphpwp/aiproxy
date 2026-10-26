class MetricsCollector {
  constructor() {
    this.queries = [];
    this.maxEntries = 10000;
  }

  logQuery({ modelId, query, chunkCount, totalChunks, retrievalTimeMs, method, resultChunks }) {
    this.queries.push({
      timestamp: Date.now(),
      modelId,
      query,
      chunkCount,
      totalChunks,
      retrievalTimeMs,
      method,
      resultChunks: resultChunks || [],
    });

    if (this.queries.length > this.maxEntries) {
      this.queries = this.queries.slice(-this.maxEntries);
    }
  }

  getStats(modelId) {
    const filtered = modelId ? this.queries.filter(q => q.modelId === modelId) : this.queries;
    if (filtered.length === 0) return null;

    const avgRetrievalTime = filtered.reduce((s, q) => s + q.retrievalTimeMs, 0) / filtered.length;
    const avgChunksReturned = filtered.reduce((s, q) => s + q.chunkCount, 0) / filtered.length;
    const avgTotalChunks = filtered.reduce((s, q) => s + q.totalChunks, 0) / filtered.length;

    const methodCounts = {};
    filtered.forEach(q => {
      methodCounts[q.method] = (methodCounts[q.method] || 0) + 1;
    });

    return {
      totalQueries: filtered.length,
      avgRetrievalTimeMs: Math.round(avgRetrievalTime * 100) / 100,
      avgChunksReturned: Math.round(avgChunksReturned * 100) / 100,
      avgTotalChunks: Math.round(avgTotalChunks * 100) / 100,
      methodDistribution: methodCounts,
    };
  }

  getRecentQueries(limit = 20) {
    return this.queries.slice(-limit).map(q => ({
      modelId: q.modelId,
      query: q.query.slice(0, 100),
      method: q.method,
      retrievalTimeMs: q.retrievalTimeMs,
      chunksReturned: q.chunkCount,
    }));
  }

  generateReport() {
    const allStats = this.getStats();
    if (!allStats) return { status: 'no_data' };

    return {
      summary: allStats,
      recentMethod: this.queries[this.queries.length - 1]?.method || 'none',
      activeModels: [...new Set(this.queries.map(q => q.modelId))],
    };
  }

  clear() {
    this.queries = [];
  }
}

const globalMetrics = new MetricsCollector();

module.exports = {
  MetricsCollector,
  globalMetrics,
};
