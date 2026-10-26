const crypto = require('crypto');

class EmbeddingCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 5000;
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  _hash(text) {
    return crypto.createHash('md5').update(text, 'utf8').digest('hex');
  }

  get(text) {
    const key = this._hash(text);
    if (this.store.has(key)) {
      this.hits++;
      const entry = this.store.get(key);
      entry.lastAccess = Date.now();
      return entry.embedding;
    }
    this.misses++;
    return null;
  }

  set(text, embedding) {
    const key = this._hash(text);
    if (this.store.size >= this.maxSize) {
      let oldest = Infinity;
      let oldestKey = null;
      for (const [k, v] of this.store) {
        if (v.lastAccess < oldest) {
          oldest = v.lastAccess;
          oldestKey = k;
        }
      }
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      embedding,
      lastAccess: Date.now(),
      createdAt: Date.now(),
    });
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

module.exports = EmbeddingCache;
