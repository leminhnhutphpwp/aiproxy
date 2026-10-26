const configStore = require('../config-store');

const loginAttempts = new Map();

function isLoginBlocked(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.lockedUntil) {
    loginAttempts.delete(ip);
    return false;
  }
  return true;
}

function recordLoginFailure(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count++;
  if (entry.count >= 5) {
    entry.lockedUntil = Date.now() + 15 * 60 * 1000;
  }
  loginAttempts.set(ip, entry);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

function timingSafeEqual(a, b) {
  const crypto = require('crypto');
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) {
    const maxLen = Math.max(bufA.length, bufB.length);
    const padA = Buffer.concat([bufA, Buffer.alloc(maxLen - bufA.length)]);
    const padB = Buffer.concat([bufB, Buffer.alloc(maxLen - bufB.length)]);
    return crypto.timingSafeEqual(padA, padB) && false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function register(dashboardApp) {
  const { DASHBOARD_USER, DASHBOARD_PASS } = process.env;

  dashboardApp.addRoute('POST', '/dashboard/api/login', (req, res) => {
    const clientIp = req.socket?.remoteAddress || '';
    if (isLoginBlocked(clientIp)) {
      return dashboardApp.sendJson(res, 429, { error: 'Too many failed attempts. Try again in 15 minutes.' });
    }
    // Without both values set, an empty username/password would match; refuse instead.
    if (!DASHBOARD_USER || !DASHBOARD_PASS) {
      return dashboardApp.sendJson(res, 503, { error: 'Dashboard login is not configured' });
    }
    const { username, password, remember } = req.body || {};
    const usernameOk = timingSafeEqual(username, DASHBOARD_USER);
    const passwordOk = timingSafeEqual(password, DASHBOARD_PASS);
    if (usernameOk && passwordOk) {
      clearLoginAttempts(clientIp);
      const ac = configStore.getSection('auth');
      const maxAge = remember ? ac.sessionMaxAgeRemember : ac.sessionMaxAgeStandard;
      const sessionId = dashboardApp.createSession(username, maxAge);
      const isSecure = process.env.NODE_ENV === 'production';
      res.setHeader('Set-Cookie', 'dashboard_session=' + sessionId + '; path=/; httpOnly; ' + (isSecure ? 'Secure; ' : '') + 'sameSite=strict; maxAge=' + maxAge);
      dashboardApp.sendJson(res, 200, { ok: true, remember: !!remember, maxAge: maxAge });
    } else {
      recordLoginFailure(clientIp);
      dashboardApp.sendJson(res, 401, { error: 'Invalid credentials' });
    }
  }, false);

  dashboardApp.addRoute('POST', '/dashboard/api/logout', (req, res) => {
    const sessionId = req.cookies ? req.cookies.dashboard_session : null;
    if (sessionId) {
      dashboardApp.destroySession(sessionId);
    }
    const isSecure = process.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', 'dashboard_session=; path=/; httpOnly; ' + (isSecure ? 'Secure; ' : '') + 'sameSite=strict; maxAge=0');
    dashboardApp.sendJson(res, 200, { ok: true });
  }, false);

  dashboardApp.addRoute('GET', '/dashboard/api/me', (req, res) => {
    dashboardApp.sendJson(res, 200, { username: req.session.username });
  });

  dashboardApp.addRoute('GET', '/dashboard/api/check', (req, res) => {
    dashboardApp.sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
