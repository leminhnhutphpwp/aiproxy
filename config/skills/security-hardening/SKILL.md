# Security Hardening for Web Apps

## OWASP Top 10 Focus
- **Broken Access Control**: Always check authorization on every endpoint, not just authentication
- **Cryptographic Failures**: Never roll your own crypto — use bcrypt/argon2 for passwords, TLS 1.3 for transport
- **Injection**: Use parameterized queries, never string-concatenate SQL/NoSQL queries
- **XSS**: Always escape output; use Content-Security-Policy headers; never use dangerouslySetInnerHTML
- **SSRF**: Validate and restrict URLs your server fetches; block private IP ranges
- **Insecure Design**: Rate limit APIs, validate all input server-side, use proper session management

## Input Validation
- Validate ALL input on the server (client-side is convenience, not security)
- Use a validation library (Zod, Joi, Yup) — never manual if/else chains
- Whitelist allowed characters/values over blacklisting
- Limit input size: 1MB for JSON bodies, 10MB for file uploads
- Strip/escape HTML in user-generated content before storage

## Authentication & Session Security
- Hash passwords with bcrypt (cost factor ≥12) or argon2id
- Use HttpOnly + Secure + SameSite=Strict cookies for sessions
- Session tokens: minimum 128 bits of entropy, random crypto-grade generation
- Implement rate limiting on login endpoints: 5 attempts per IP per minute
- Lock accounts after 10 failed attempts; require email verification to unlock

## HTTP Security Headers
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:;";
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload";
```

## API Security
- Rate limit every endpoint: 100 req/min per user for read, 20 req/min for mutations
- Use API keys with scoped permissions — never a single master key
- Rotate keys regularly: expire old keys, issue new ones
- Log all authentication failures and rate limit violations
- Never expose internal IDs in URLs (use UUIDs)

## Secrets Management
- Never hardcode secrets — use environment variables or secret managers
- Rotate secrets every 90 days minimum
- Audit secrets in git history with tools like Gitleaks or truffleHog
- Use `.env.example` with dummy values committed — never real `.env` files

## Common Vulnerabilities
- Race conditions in concurrent operations (use database transactions)
- Insecure direct object references (IDOR) — always verify ownership
- Mass assignment — never pass user input directly to model.create()
- Open redirects — validate redirect URLs against a whitelist
- Path traversal — use `path.resolve` + prefix check for file operations
