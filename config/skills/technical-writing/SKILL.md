# Technical Documentation

## Why Documentation Matters
- Good docs reduce onboarding time by 50-80%
- Documents decisions for future maintainers (including future you)
- Enables async collaboration across time zones
- Required for any project with >1 contributor

## README (Essential for Every Project)
```markdown
# Project Name
> One-line description of what this project does

## Quick Start
\`\`\`bash
git clone https://github.com/org/project.git
cd project
npm install
cp .env.example .env
npm run dev
\`\`\`

## Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

## Environment Variables
| Variable | Description | Default |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | postgres://localhost:5432/db |
| REDIS_URL | Redis connection string | redis://localhost:6379 |

## API
See [API Documentation](./docs/api.md)

## Scripts
| Command | Description |
|---------|-------------|
| \`npm run dev\` | Start development server |
| \`npm run build\` | Build for production |
| \`npm run test\` | Run test suite |

## Deployment
Deploy via CI/CD pipeline. See [DEPLOYMENT.md](./DEPLOYMENT.md)

## Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md)
```

## ADRs (Architecture Decision Records)
```markdown
# ADR-001: Use PostgreSQL over MongoDB

## Status
Accepted

## Context
We need a primary database for our SaaS platform.
Requirements: relational data, transactions, JSON support.

## Decision
Use PostgreSQL 16 with:
- Schema-based multi-tenancy
- JSONB for flexible fields
- pgvector for future AI features

## Consequences
- ✅ Transaction support for financial data
- ✅ JSON fields allow some document-store flexibility
- ✅ Mature tooling and robust community
- ❌ Need migrations for schema changes
- ❌ Higher latency than in-memory for cache-heavy queries
```
- One ADR per decision, numbered sequentially
- Keep them short — document the reasoning, not the implementation

## API Documentation
```javascript
/**
 * Creates a new user account.
 *
 * @param {Object} params
 * @param {string} params.email - User's email (must be unique)
 * @param {string} params.password - Password (min 8 chars)
 * @param {string} [params.name] - Display name (optional)
 * @returns {Promise<{id: string, email: string, name: string}>}
 * @throws {ValidationError} If email is invalid or taken
 * @throws {RateLimitError} If too many requests
 *
 * @example
 * const user = await createUser({
 *   email: 'john@example.com',
 *   password: 'secure123',
 *   name: 'John'
 * });
 * // => { id: '123', email: 'john...', name: 'John' }
 */
```

## Changelog (Keep a Changelog format)
```markdown
# Changelog

## [2.1.0] — 2026-03-15

### Added
- User profile avatars (upload via /api/users/:id/avatar)
- Email notification preferences

### Changed
- Database connection pooling from 10 to 50 connections
- Minimum password length from 6 to 8 characters

### Fixed
- Rate limiter incorrectly resetting on failed login attempts
- Mobile navigation overflow on iOS Safari

### Security
- Updated bcrypt cost factor from 10 to 12
```

## Inline Comments
```javascript
// WHY: Using raw SQL for this complex aggregation because Prisma's
// groupBy doesn't support multi-level grouping with computed fields.
const results = await prisma.$queryRaw`SELECT ...`;
```
- Document WHY, not WHAT (the code explains what)
- Explain non-obvious decisions, workarounds, and edge cases
- Never comment obvious code — it becomes stale noise
- Use TODO/FIXME/HACK markers for technical debt

## Documentation Maintenance
- Keep docs in the same repo as code (co-located)
- Review documentation during every PR (not optional)
- Run `npm run docs:test` to validate example code snippets
- Update docs when you update code — stale docs are worse than no docs

## Common Mistakes
- ❌ Writing for yourself instead of newcomers (assumes too much context)
- ❌ Outdated docs — treat them as code, review in PRs
- ❌ No architecture/decision records (newcomers don't know WHY)
- ❌ Documenting implementation details that change frequently
- ❌ No examples — the best documentation shows working code
