# REST API Design Conventions

## URL Structure
- Plural nouns for resources: `/users`, `/orders`, `/products`
- Use kebab-case: `/order-items`, not `/orderItems`
- No file extensions: `/users`, not `/users.json`
- No verbs in URLs — use HTTP methods instead
- Nest related resources: `/users/:id/orders/:orderId`
- Filter, sort, paginate via query params: `?status=active&sort=-createdAt&page=1&limit=20`

## HTTP Methods
- `GET` — retrieve resource(s) (safe, idempotent)
- `POST` — create resource (not idempotent)
- `PUT` — full replacement (idempotent)
- `PATCH` — partial update (not idempotent)
- `DELETE` — remove resource (idempotent)
- `HEAD` — get headers only
- `OPTIONS` — discover allowed methods

## Status Codes
- `200` — OK (successful GET, PUT, PATCH)
- `201` — Created (successful POST)
- `204` — No Content (successful DELETE)
- `400` — Bad Request (validation error)
- `401` — Unauthorized (missing/invalid auth)
- `403` — Forbidden (authenticated but no permission)
- `404` — Not Found
- `409` — Conflict (duplicate, race condition)
- `422` — Unprocessable Entity (validation)
- `429` — Too Many Requests (rate limit)
- `500` — Internal Server Error
- `503` — Service Unavailable

## Error Response Format
```json
{
  "error": {
    "message": "Human-readable description",
    "type": "validation_error",
    "code": "INVALID_EMAIL",
    "details": { "field": "email", "reason": "must be a valid email address" }
  }
}
```

## Pagination
```json
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```
- Always sort by a unique field (id, createdAt) to prevent duplicates across pages
- Cursor-based pagination for real-time data: `?cursor=abc123&limit=20`

## Authentication
- Use standard `Authorization` header: `Bearer <token>` or `Basic <base64>`
- Token expiry: include `expiresIn` or `expiresAt` in auth response
- Rate limiting headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- CORS: explicit origin, not wildcard in production

## Versioning
- URL-prefix versioning: `/v1/users`, `/v2/users`
- Include version in response headers: `X-API-Version: 1.0`
- Document breaking changes in changelog
- Deprecate with warning headers: `Sunset: Sat, 31 Dec 2026 23:59:59 GMT`

## Documentation
- Use OpenAPI 3.x spec for all endpoints
- Keep spec as source of truth (generated from code or code from spec)
- Document: params, request body, response schema, error codes, auth requirements
- Provide runnable examples in documentation
