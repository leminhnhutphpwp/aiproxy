# Database Design & Schema

## Schema Design Principles
- Normalize until it hurts, denormalize until it works
- Every table needs a primary key — prefer UUIDs or bigserial over autoincrement int
- Use `created_at` and `updated_at` timestamps on every table
- Define foreign keys with ON DELETE behavior explicitly (CASCADE, SET NULL, RESTRICT)
- Use CHECK constraints for domain validation, not app-level only
- Prefer ENUM types for fixed set of values, VARCHAR for open-ended

## Naming Conventions
- Tables: plural snake_case (`users`, `order_items`)
- Columns: singular snake_case (`email`, `created_at`)
- Foreign key: `referenced_table_id` (`user_id`, `order_id`)
- Indexes: `idx_table_column` (`idx_users_email`)
- Unique constraints: `uq_table_column` (`uq_users_email`)

## Migration Patterns
- One migration per schema change — never combine unrelated changes
- Migrations are irreversible by default: write `down` only for rollback support
- Never alter a migration that has been applied to production
- Add columns as NULLABLE first, backfill data, then add NOT NULL
- Use transaction-wrapped migrations for atomic changes
```sql
BEGIN;
ALTER TABLE users ADD COLUMN timezone VARCHAR(50);
UPDATE users SET timezone = 'UTC' WHERE timezone IS NULL;
ALTER TABLE users ALTER COLUMN timezone SET NOT NULL;
COMMIT;
```

## Indexing Strategy
- Index foreign key columns (automatic in some DBs, not all)
- Index columns used in WHERE, JOIN, and ORDER BY
- Composite indexes: order by selectivity (most selective first)
- Avoid over-indexing: each index slows writes
- Use partial indexes for common queries: `CREATE INDEX idx_active_users ON users(is_active) WHERE is_active = true`
- Use covering indexes for hot queries: `CREATE INDEX idx_user_email_name ON users(email) INCLUDE (name)`

## Data Modeling
- Keep one fact per table — avoid JSONB blobs for structured data
- Use JSONB only for truly variable schema or nested structures you don't query
- Join tables for many-to-many: `user_roles(user_id, role_id)` with composite PK
- Avoid polymorphic associations (type + id columns) — use separate join tables
- Consider enums or lookup tables for status/type fields

## Anti-Patterns
- ❌ EAV (Entity-Attribute-Value) — use JSONB or separate tables
- ❌ Storing comma-separated lists in a column
- ❌ Using ORM auto-generated migrations in production without review
- ❌ No indexes on foreign keys (causes full table scans on joins)
- ❌ SELECT * in production queries
- ❌ Storing computed/derived values that can be calculated from other columns
