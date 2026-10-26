class HNSWIndex {
  constructor(options = {}) {
    this.M = options.M || 16;
    this.efConstruction = options.efConstruction || 200;
    this.efSearch = options.efSearch || 50;
    this.ml = options.ml || 1 / Math.log(this.M);
    this.dimensions = options.dimensions || 1024;

    this.nodes = [];
    this.enterPoint = null;
    this.maxLevel = -1;
  }

  _randomLevel() {
    let level = 0;
    while (Math.random() < this.ml && level < 32) {
      level++;
    }
    return level;
  }

  _distance(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < this.dimensions; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 1 : 1 - dot / denom;
  }

  _searchLayer(query, entry, level, ef) {
    let visited = new Set([entry]);
    let candidates = [{ id: entry, dist: this._distance(query, this.nodes[entry].vector) }];
    let results = [{ id: entry, dist: candidates[0].dist }];

    while (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      const closest = candidates.shift();

      const furthestDist = results.length >= ef ? results[results.length - 1].dist : Infinity;
      if (closest.dist > furthestDist) break;

      const node = this.nodes[closest.id];
      if (!node || !node.levels[level]) continue;

      for (const neighbor of node.levels[level]) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);

        const dist = this._distance(query, this.nodes[neighbor].vector);

        if (results.length < ef || dist < results[results.length - 1].dist) {
          candidates.push({ id: neighbor, dist });
          results.push({ id: neighbor, dist });
          results.sort((a, b) => a.dist - b.dist);
          if (results.length > ef) results = results.slice(0, ef);
        }
      }
    }

    return results;
  }

  _selectNeighborsSimple(candidates, M) {
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, M).map(c => c.id);
  }

  insert(id, vector) {
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
    }

    const level = this._randomLevel();
    const node = {
      id,
      vector,
      levels: Array.from({ length: level + 1 }, () => []),
    };
    this.nodes[id] = node;

    if (this.enterPoint === null) {
      this.enterPoint = id;
      this.maxLevel = level;
      return;
    }

    let currEntry = this.enterPoint;
    const topLevel = Math.min(this.maxLevel, level);

    for (let lc = topLevel; lc > 0; lc--) {
      const result = this._searchLayer(vector, currEntry, lc, 1);
      currEntry = result[0].id;
    }

    for (let lc = 0; lc <= topLevel; lc++) {
      const result = this._searchLayer(vector, currEntry, lc, this.efConstruction);
      const neighbors = this._selectNeighborsSimple(result, this.M);
      node.levels[lc] = neighbors;
      for (const neighborId of neighbors) {
        const neighbor = this.nodes[neighborId];
        if (neighbor && neighbor.levels[lc]) {
          neighbor.levels[lc].push(id);
          if (neighbor.levels[lc].length > this.M * 2) {
            neighbor.levels[lc] = neighbor.levels[lc].slice(-this.M);
          }
        }
      }
      currEntry = result[0].id;
    }

    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.enterPoint = id;
    }
  }

  search(query, K = 10) {
    if (this.enterPoint === null || this.nodes.length === 0) return [];

    let currEntry = this.enterPoint;

    for (let lc = this.maxLevel; lc > 0; lc--) {
      const result = this._searchLayer(query, currEntry, lc, 1);
      currEntry = result[0].id;
    }

    const results = this._searchLayer(query, currEntry, 0, Math.max(this.efSearch, K));
    results.sort((a, b) => a.dist - b.dist);

    return results.slice(0, K).map(r => ({
      id: r.id,
      distance: r.dist,
      score: 1 - r.dist,
    }));
  }

  toJSON() {
    const nodes = Object.entries(this.nodes).map(([id, node]) => ({
      id: parseInt(id),
      vector: node.vector,
      levels: node.levels,
    }));
    return {
      M: this.M,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      ml: this.ml,
      dimensions: this.dimensions,
      maxLevel: this.maxLevel,
      enterPoint: this.enterPoint,
      nodes,
    };
  }

  static fromJSON(data) {
    const index = new HNSWIndex({
      M: data.M,
      efConstruction: data.efConstruction,
      efSearch: data.efSearch,
      ml: data.ml,
      dimensions: data.dimensions,
    });
    index.maxLevel = data.maxLevel;
    index.enterPoint = data.enterPoint;
    for (const node of data.nodes || []) {
      const n = {
        id: node.id,
        vector: node.vector,
        levels: node.levels,
      };
      index.nodes[n.id] = n;
    }
    return index;
  }

  clear() {
    this.nodes = [];
    this.enterPoint = null;
    this.maxLevel = -1;
  }

  get size() {
    return this.nodes.length;
  }
}

module.exports = HNSWIndex;
