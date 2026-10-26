const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const configStore = require('./config-store');
function ac() { return configStore.getSection('auth'); }

const DASHBOARD_DIR = path.join(__dirname, '..', '..', 'dashboard');
const sessions = new Map();
const routes = [];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function createSession(username, ttl) {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { username, createdAt: Date.now(), ttl: ttl || ac().sessionMaxAgeDefault });
  return sessionId;
}

function destroySession(sessionId) {
  sessions.delete(sessionId);
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.createdAt > (session.ttl || ac().sessionMaxAgeDefault) * 1000) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  const result = {};
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const val = part.slice(eqIndex + 1).trim();
    result[key] = val;
  }
  return result;
}

function getFileContent(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { ok: false, error: message });
}

function sendFile(res, filePath, content) {
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

function addRoute(method, pathPattern, handler, requireAuthFlag = true) {
  routes.push({ method, path: pathPattern, handler, requireAuth: requireAuthFlag });
}

function requireAuth(handler) {
  return (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = cookies ? getSession(cookies.dashboard_session) : null;
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    req.session = session;
    return handler(req, res);
  };
}

function pathMatches(pattern, pathname) {
  const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, '([^/]+)') + '$');
  return regex.test(pathname);
}

function extractParams(pattern, pathname) {
  const params = {};
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  for (let i = 0; i < patternParts.length && i < pathParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    }
  }
  return params;
}

function isValidBasicAuth(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  try {
    const token = authHeader.slice(6);
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const colonIdx = decoded.indexOf(':');
    if (colonIdx === -1) return false;
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);
    const config = require('../config');
    return username === config.opencode.username && password === config.opencode.password;
  } catch {
    return false;
  }
}

async function handleDashboard(req, res) {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/dashboard/api/')) {
    for (const route of routes) {
      if (route.method === req.method && pathMatches(route.path, pathname)) {
        const cookies = parseCookies(req.headers.cookie);
        req.cookies = cookies;
          if (route.requireAuth) {
          const remoteAddr = req.socket?.remoteAddress;
          const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
          const isDashApi = pathname.startsWith('/dashboard/api/');
          const basicAuth = req.headers?.authorization || '';
          const basicAuthOk = isLocal && isDashApi && isValidBasicAuth(basicAuth);
          if (basicAuthOk) {
            req.session = { username: 'system' };
          } else {
            const session = cookies ? getSession(cookies.dashboard_session) : null;
            if (!session) {
              return sendJson(res, 401, { error: 'Unauthorized' });
            }
            req.session = session;
          }
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const chunks = [];
          const MAX_DASHBOARD_BODY = 512 * 1024;
          let bodyLength = 0;
          try {
            for await (const chunk of req) {
              bodyLength += chunk.length;
              if (bodyLength > MAX_DASHBOARD_BODY) {
                return sendJson(res, 413, { ok: false, error: 'Request body too large' });
              }
              chunks.push(chunk);
            }
          } catch {}
          try { req.body = JSON.parse(Buffer.concat(chunks).toString()); } catch { req.body = {}; }
        }
        req.params = extractParams(route.path, pathname);
        try {
          return await route.handler(req, res);
        } catch (err) {
          console.error('[Dashboard Route Error]:', err);
          return sendJson(res, 500, { ok: false, error: 'Internal Server Error' });
        }
      }
    }
    return sendJson(res, 404, { error: 'Not found' });
  }

  let filePath = pathname === '/dashboard' || pathname === '/dashboard/'
    ? path.join(DASHBOARD_DIR, 'app.html')
    : path.join(DASHBOARD_DIR, pathname.replace('/dashboard/', ''));

  const content = getFileContent(filePath);
  if (content !== null) {
    return sendFile(res, filePath, content);
  }

  sendJson(res, 404, { error: 'Not found' });
}

module.exports = {
  handleDashboard,
  addRoute,
  requireAuth,
  sendJson,
  sendError,
  createSession,
  destroySession,
};
