const crypto = require('crypto');
const { AiproxyError } = require('./errors');
const apiKeyAuth = require('./api-key-auth');
const config = require('../config');

function unauthorized(message) {
  return new AiproxyError(message, 401, 'invalid_request_error', 'unauthorized', message);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  // Compare equal-length buffers so a length mismatch costs the same time as a wrong value.
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.concat([bufA, Buffer.alloc(len - bufA.length)]);
  const padB = Buffer.concat([bufB, Buffer.alloc(len - bufB.length)]);
  return crypto.timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

// Checks the Authorization header of a /v1 request. Returns null when the client is allowed
// (setting req.authKey for portal keys), otherwise the AiproxyError to send back.
// Fails closed: Basic auth is refused when OPENCODE_USERNAME / OPENCODE_PASSWORD are not set.
async function authenticate(req, credentials = config.opencode) {
  const authHeader = req.headers['authorization'] || '';

  if (authHeader.startsWith('Bearer ') && apiKeyAuth.isEnabled()) {
    const keyData = await apiKeyAuth.validateKey(authHeader.slice(7));
    if (!keyData || !keyData.valid) return unauthorized('Invalid API key');
    req.authKey = keyData;
    return null;
  }

  if (authHeader.startsWith('Basic ')) {
    const expectedUser = credentials && credentials.username;
    const expectedPass = credentials && credentials.password;
    if (!expectedUser || !expectedPass) {
      return unauthorized('Client authentication is not configured');
    }
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return unauthorized('Invalid authorization format');
    const userOk = safeEqual(decoded.slice(0, colonIdx), expectedUser);
    const passOk = safeEqual(decoded.slice(colonIdx + 1), expectedPass);
    if (!userOk || !passOk) return unauthorized('Invalid credentials');
    return null;
  }

  return unauthorized('Authorization required');
}

module.exports = { authenticate, safeEqual };
