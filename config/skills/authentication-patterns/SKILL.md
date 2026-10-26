# Authentication & Authorization Patterns

## Authentication vs Authorization
- **Authentication**: "Who are you?" — verifying identity (login)
- **Authorization**: "What can you do?" — verifying permissions (roles, scopes)
- Always implement both layers separately — never skip authz because a user is authenticated

## Password Handling
- Hash with bcrypt (cost ≥12) or argon2id
- Never store plaintext, encrypted, or MD5/SHA-1 hashed passwords
- Enforce minimum 8 characters (longer is better than complex)
- Rate-limit login attempts: 5 per minute per IP, 10 per minute per user
- Never reveal which field is wrong: "Invalid email or password" not "User not found"

## JWT (JSON Web Tokens)
```ts
// Sign
const token = jwt.sign({ userId: user.id, role: user.role }, SECRET, { expiresIn: '15m' });
// Verify
const decoded = jwt.verify(token, SECRET);
```
- Keep access tokens short-lived: 15 minutes for access, 7 days for refresh
- Store refresh tokens in HttpOnly + Secure + SameSite=Strict cookies
- Never store sensitive data in JWT payload (it's base64-encoded, not encrypted)
- Always verify JWT on every request — don't trust tokens from client
- Use RS256 (asymmetric) for cross-service JWT verification, HS256 for single-service
- Implement token rotation: issue new refresh token on each refresh, revoke old one

## OAuth 2.0
- Authorization Code flow with PKCE for SPAs and mobile apps
- Client Credentials flow for server-to-server communication
- Never use Implicit flow (deprecated) or Resource Owner Password flow (legacy)
- Validate redirect_uri exactly (must match registered URI including path)
- Use state parameter to prevent CSRF on OAuth callback
- Scope tokens to minimum necessary permissions

## Session Management
- Server-side sessions for apps requiring immediate revocation ability
- Session ID: crypto.randomUUID() or similar, minimum 128 bits
- Store sessions in Redis with TTL for fast access and automatic expiry
- Regenerate session ID on login and privilege escalation
- Implement session revocation: delete from Redis/DB on logout
- Multi-device: separate sessions per device, revoke individually

## Role-Based Access Control (RBAC)
```ts
const ROLES = {
  admin: ['read:*', 'write:*', 'delete:*'],
  editor: ['read:*', 'write:posts', 'write:pages'],
  viewer: ['read:*'],
};

function authorize(user: User, action: string): boolean {
  return ROLES[user.role]?.some(pattern => matchAction(pattern, action));
}
```
- Assign roles to users, permissions to roles
- Check authorization in middleware, not in route handlers
- Use resource-based authorization: "can user:1 edit post:5?" not just "is user admin?"
- Default deny: if no explicit permission, deny access

## API Key Authentication
- Generate keys with crypto.randomBytes(32).toString('hex') — minimum 256 bits
- Store hashed keys in database (same as passwords), never plaintext
- Allow multiple keys per user/organization for rotation
- Scopes on keys: restrict what each key can access
- Key prefix for identification: `sk_live_abc123...` vs `sk_test_def456...`
- Revocation list: check on every request (in-memory cache with TTL)

## Multi-Factor Authentication (MTA)
- TOTP (Time-based One-Time Password) as primary 2FA method
- Recovery codes: generate 10 codes, each usable once
- WebAuthn/Passkeys for passwordless authentication
- MFA enrollment should verify the method works before enabling
- Never skip MFA based on IP or device — attackers can spoof both

## Security Headers & Best Practices
- HTTPS everywhere: HSTS header, redirect HTTP to HTTPS
- CORS: explicit allowed origins, methods, and headers
- CSRF: SameSite=Strict cookies + CSRF tokens for form submissions
- Rate limiting on all auth endpoints (login, register, forgot password, verify email)
- Account lockout: temporary (15 min) not permanent — prevents DoS via lockouts

## Common Mistakes
- ❌ JWT without expiration
- ❌ Not verifying email before first login
- ❌ Exposing user ID or email in URLs (use UUIDs)
- ❌ Allowing password enumeration via timing attacks
- ❌ Storing tokens in localStorage (vulnerable to XSS) — use httpOnly cookies
