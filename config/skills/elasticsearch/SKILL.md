# Elasticsearch & Search Engineering

## Core Concepts
- Elasticsearch = distributed, RESTful search and analytics engine
- Based on Apache Lucene — inverted index for full-text search
- Near real-time: documents visible ~1s after indexing
- Schema-free but better with explicit mappings

## Indexing & Mappings
```json
// PUT /products
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "custom_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding", "edge_ngram"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title":       { "type": "text", "analyzer": "custom_analyzer", "fields": { "keyword": { "type": "keyword" } } },
      "description": { "type": "text", "analyzer": "english" },
      "price":       { "type": "float" },
      "in_stock":    { "type": "boolean" },
      "tags":        { "type": "keyword" },
      "created_at":  { "type": "date" },
      "location":    { "type": "geo_point" }
    }
  }
}
```
- `text` for full-text search → analyzed
- `keyword` for exact match, sorting, aggregations → not analyzed
- `edge_ngram` filter for autocomplete/search-as-you-type
- `english` analyzer for stemming (run → running → runs matched)

## CRUD Operations
```javascript
// Index a document
PUT /products/_doc/123
{ "title": "Wireless Mouse", "price": 29.99, "in_stock": true, "tags": ["electronics", "peripherals"] }

// Bulk index
POST /products/_bulk
{ "index": { "_id": "1" } }
{ "title": "Keyboard", "price": 49.99 }
{ "index": { "_id": "2" } }
{ "title": "Monitor", "price": 299.99 }

// Update
POST /products/_update/123
{ "doc": { "price": 24.99 } }

// Delete
DELETE /products/_doc/123
```

## Full-Text Search
```json
// GET /products/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "title": "wireless mouse" } },
        { "term": { "in_stock": true } }
      ],
      "filter": [
        { "range": { "price": { "gte": 10, "lte": 100 } } }
      ],
      "should": [
        { "match": { "description": "ergonomic" } }  // Boosts score
      ],
      "must_not": [
        { "term": { "tags": "refurbished" } }
      ]
    }
  },
  "sort": [ { "price": { "order": "asc" } } ],
  "from": 0,
  "size": 20,
  "_source": ["title", "price", "in_stock"]
}
```
- `match`: full-text search with analysis
- `term`: exact match (use for keywords, IDs, enums)
- `bool`: combine multiple queries (must, should, filter, must_not)
- `filter` = no score contribution, cachable
- `range`: numeric, date, and IP range queries

## Aggregations
```json
{
  "size": 0,
  "aggs": {
    "by_tag": {
      "terms": { "field": "tags", "size": 10 },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } },
        "by_month": { "date_histogram": { "field": "created_at", "calendar_interval": "month" } }
      }
    }
  }
}
```

## Relevance Tuning
- `function_score`: custom scoring via field values, distance, decay functions
- `boosting`: positive + negative patterns
- `multi_match`: search across multiple fields with field boosting
- Synonyn filter: handle industry-specific terms
```json
{
  "query": {
    "function_score": {
      "query": { "match": { "title": "mouse" } },
      "field_value_factor": { "field": "popularity", "factor": 1.5 }
    }
  }
}
```

## Kibana
- Discover: search and filter indexed data
- Dashboard: visualize with charts, maps, tables
- Alerting: threshold-based notifications
- Canvas: pixel-perfect data visualizations
- Machine Learning: anomaly detection (requires license)

## Performance
- Use `_source: false` to reduce document size (store only what's searched)
- Shard sizing: 20-40GB per shard on hot nodes
- Refresh interval: 30s for indexing-heavy workloads
- Use `search_after` for deep pagination, not `from+size`
- Node roles: hot (indexing/search), warm (rarely queried), cold (archive)

## Common Mistakes
- ❌ No explicit mapping (field type guessing = wrong search behavior)
- ❌ Deep pagination with `from+size` (>10k) — use `search_after`
- ❌ Large `size` values in aggregations (memory exhausted)
- ❌ Not using `filter` context for non-scoring queries (slower + cache miss)
- ❌ Indexing JSON strings as `text` when they should be `nested` or `flattened`
