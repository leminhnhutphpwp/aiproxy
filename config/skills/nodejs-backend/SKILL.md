# Node.js Backend Patterns

## Project Structure
- Feature-based folder structure, not file-type-based
```
src/
  features/
    users/
      users.controller.ts
      users.service.ts
      users.repository.ts
      users.schema.ts
      users.test.ts
  shared/
    middleware/
    errors/
    logger/
```
- Never have files >200 lines — split by responsibility
- Barrel files (index.ts) for clean imports from each feature
- Keep business logic in services, not controllers or routes

## Request Flow
Middleware → Router → Controller → Service → Repository → Database
- Middleware: auth, validation, logging, rate limiting
- Controller: parse request, call service, format response
- Service: business logic, coordination, error handling
- Repository: data access, queries, ORM operations
- Never let controllers access the database or services access req/res objects

## Error Handling
- Use a custom error class hierarchy:
```ts
class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {}
}
class NotFoundError extends AppError { constructor(msg: string) { super(404, 'NOT_FOUND', msg); } }
```
- Global error handler middleware catches all unhandled errors
- Never expose stack traces in production error responses
- Catch async errors with a wrapper: `asyncHandler(fn)` that calls `next(err)`
- Operational errors (validation, auth) return 4xx; programmer errors (bugs) return 500

## Async Patterns
- Use async/await everywhere — no raw promises or callbacks in business code
- Handle concurrent operations with `Promise.allSettled` not `Promise.all` (doesn't fail fast)
- Use AbortController for cancellable requests and timeouts
- Never do `await` in a loop — use `Promise.all` or batch processing
- Stream large responses instead of loading everything into memory

## Middleware Patterns
- Keep middleware single-purpose and composable
- Common middleware chain: `authenticate → validate → rateLimit → authorize → handler`
- Attach user info to req object: `req.user = decodedToken`
- Validate at the middleware level with Zod schemas
- Never trust req.body, req.params, or req.query without validation

## API Design
- Use versioned routes: `/v1/users` not `/users`
- JSON request/response consistently (no mixing XML, form-data)
- Consistent error response format:
```json
{ "error": { "message": "...", "code": "VALIDATION_ERROR", "details": {} } }
```
- Pagination: always return `{ data: [], meta: { page, limit, total, hasMore } }`

## Logging
- Use structured JSON logging (pino, winston) not console.log
- Include: requestId, userId, method, path, duration, statusCode
- Log at appropriate levels: debug (dev), info (normal), warn (handled errors), error (unhandled)
- Never log passwords, tokens, or personal data

## Performance
- Use compression middleware (gzip/brotli)
- Enable HTTP/2 for multiplexing
- Cache frequent queries with in-memory cache or Redis
- Use connection pooling for database connections
- Set request timeouts: 30s for normal, 120s for file uploads
