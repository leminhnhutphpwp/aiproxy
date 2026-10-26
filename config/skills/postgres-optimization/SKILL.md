# PostgreSQL Optimization

## Query Analysis with EXPLAIN
- Always use `EXPLAIN ANALYZE` for real query performance (not just `EXPLAIN`)
- Look for: sequential scans on large tables, high row estimates vs actual, nested loop joins on large sets
- Sequential scan isn't always bad — it's fine for small tables (<1000 rows)
- Red flags: `Seq Scan` on 100k+ rows, `Sort` without index, `Nested Loop` with large inner table
```sql
EXPLAIN (ANALYZE, BUFFERS, TIMING) SELECT * FROM users WHERE email = 'test@example.com';
```

## Indexing Strategies
- **B-tree**: default, good for equality and range queries — use for most columns
- **Hash**: equality only, slightly faster than B-tree — use for exact lookups on UUIDs
- **GIN**: for array columns, full-text search, JSONB — use for tags, search vectors
- **GiST**: for full-text search, geometry, range types
- **BRIN**: for large append-only tables where physical order correlates with indexed column (time-series)
- **Partial indexes**: `CREATE INDEX idx_active_users ON users(email) WHERE is_active = true;`
- **Covering indexes**: `CREATE INDEX idx_users_email_name ON users(email) INCLUDE (name, avatar_url);`

## Composite Index Rules
- Order columns by selectivity (most selective first): `(status, created_at)` not `(created_at, status)`
- Index for queries with both filter and sort: `(status, created_at)` covers `WHERE status='active' ORDER BY created_at`
- Don't over-index: each index adds write overhead and disk usage
- Query planner can use multiple indexes independently, but a single composite index is faster
- Use `pg_stat_user_indexes` and `pg_stat_all_indexes` to find unused indexes

## Query Optimization
- Select only needed columns — never `SELECT *` in production
- Use LIMIT for pagination: `SELECT * FROM posts ORDER BY created_at DESC LIMIT 20`
- Use cursor-based pagination for large datasets: `WHERE created_at < $1 ORDER BY created_at DESC LIMIT 20`
- Avoid `COUNT(*)` on large tables — use estimated counts or a separate counter table
- Use EXISTS instead of COUNT for existence checks: `WHERE EXISTS (SELECT 1 FROM ...)`
- Use `LATERAL JOIN` for complex per-row subqueries

## Common Query Patterns
```sql
-- Efficient pagination (keyset/cursor)
SELECT * FROM orders
WHERE created_at < '2025-01-01'
ORDER BY created_at DESC
LIMIT 20;

-- Avoid OFFSET for deep pagination (reads all previous rows each time)

-- Batch update with RETURNING
UPDATE users SET status = 'verified'
WHERE id IN (SELECT id FROM users WHERE status = 'pending' LIMIT 100)
RETURNING id, email;
```

## Partitioning
- Use for tables >100GB or when you can prune partitions for queries
- Range partitioning for time-series data: `PARTITION BY RANGE (created_at)`
- List partitioning for categorical data: `PARTITION BY LIST (region)`
- Partition pruning: ensure WHERE clause includes the partition key
- Each partition can have separate indexes, vacuum, and storage settings

## Vacuum & Maintenance
- Autovacuum is on by default — monitor its effectiveness with `pg_stat_user_tables`
- Tune autovacuum for write-heavy tables: increase `autovacuum_vacuum_scale_factor`
- Prevent transaction ID wraparound: run aggressive vacuum on high-write tables
- Reindex periodically: `REINDEX INDEX CONCURRENTLY idx_name`
- Use `pg_repack` to reclaim disk space from bloated tables without locking

## Connection Management
- Use connection poolers: PgBouncer (transaction mode) or PgCat
- Pool size: CPU cores × 2 + disk spindles (typically 20-50 connections per app instance)
- Set sane statement timeout: 30s default, higher for specific queries
- `idle_in_transaction_session_timeout`: 60s to prevent hung transactions
- Monitor with `pg_stat_activity` for long-running queries and idle-in-transaction connections

## Configuration Tuning
| Setting | Recommended | Notes |
|---------|------------|-------|
| shared_buffers | 25% of RAM | PostgreSQL's cache buffer |
| effective_cache_size | 75% of RAM | Planner estimate for OS cache |
| work_mem | 4-16MB per operation | Per-sort/hash, too high = OOM |
| maintenance_work_mem | 10% of RAM | For VACUUM, CREATE INDEX |
| wal_buffers | 64MB | Write-ahead log buffer |

## Anti-Patterns
- ❌ SELECT * in production
- ❌ Using OFFSET/LIMIT for deep pagination (performance degrades with page number)
- ❌ No indexes on foreign keys (causes seq scans on JOINs)
- ❌ Indexing every column (wastes write perf and disk)
- ❌ Large JSONB fields that are always read together (normalize instead)
- ❌ Not using `connection_string` for automated failover handling
