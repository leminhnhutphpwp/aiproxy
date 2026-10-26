const http = require('http');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { handleRequest } = require('./core/router');
const registry = require('./core/model-registry');
const modelStatus = require('./core/model-status');
const healthChecker = require('./core/model-health-checker');
const { handleDashboard } = require('./core/dashboard');
const requestLogger = require('./core/request-logger');
const rateLimiter = require('./core/rate-limiter');
const writeBuffer = require('./core/write-buffer');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PUBLIC_MIME = { '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };
const _staticCache = new Map();

const authRoutes = require('./core/routes/auth');
const statusRoutes = require('./core/routes/status');
const providersRoutes = require('./core/routes/providers');
const breakersRoutes = require('./core/routes/breakers');
const healthRoutes = require('./core/routes/health');
const logsRoutes = require('./core/routes/logs');
const settingsRoutes = require('./core/routes/settings');
const routingRoutes = require('./core/routes/routing');
const memoriesRoutes = require('./core/routes/memories');
const usageRoutes = require('./core/routes/usage');
const tokenSavingsRoutes = require('./core/routes/token-savings');
const skillsRoutes = require('./core/routes/skills');
const specializedRoutes = require('./core/routes/specialized');
const configStore = require('./core/config-store');

async function start(cfg) {
  console.log('[Aiproxy] Starting...');
  console.log('[Aiproxy] Dashboard: ' + (process.env.DASHBOARD_USER ? 'enabled' : 'disabled (set DASHBOARD_USER/PASS)'));

  await registry.initialize();
  modelStatus.initialize(registry.getPublicModels());
  modelStatus.loadFromDisk();
  modelStatus._cleanupOldFiles();
  requestLogger.loadFromDisk();
  requestLogger.cleanupOldFiles();
  require('./core/usage-tracker').cleanupOldFiles();
  require('./core/token-savings').cleanupOldFiles();
  healthChecker.start();
  rateLimiter.start();
  writeBuffer.start();

  const dashboardApp = require('./core/dashboard');
  authRoutes.register(dashboardApp);
  statusRoutes.register(dashboardApp);
  providersRoutes.register(dashboardApp);
  breakersRoutes.register(dashboardApp);
  healthRoutes.register(dashboardApp);
  logsRoutes.register(dashboardApp);
  settingsRoutes.register(dashboardApp);
  routingRoutes.register(dashboardApp);
  memoriesRoutes.register(dashboardApp);
  usageRoutes.register(dashboardApp);
  tokenSavingsRoutes.register(dashboardApp);
  skillsRoutes.register(dashboardApp);
  specializedRoutes.register(dashboardApp);

  const server = http.createServer(async (req, res) => {
    const infraCfg = configStore.getSection('infra');
    res.setHeader('Access-Control-Allow-Origin', infraCfg.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');

    const clientIp = rateLimiter.getClientIp(req);
    const isLocal = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
    if (req.method !== 'OPTIONS' && !isLocal) {
      const group = rateLimiter.getEndpointGroup(req.url, req.method);
      if (group) {
        const rlResult = rateLimiter.checkRateLimit(clientIp, group);
        if (!rlResult.allowed) {
          const retryAfter = Math.ceil(rlResult.retryAfterMs / 1000);
          res.writeHead(429, {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter,
            'X-RateLimit-Limit': rlResult.limit,
            'X-RateLimit-Remaining': 0,
            'X-RateLimit-Reset': Math.floor(rlResult.resetAt / 1000),
          });
          res.end(JSON.stringify({
            error: {
              message: 'Rate limit exceeded. Please try again in ' + retryAfter + ' seconds.',
              type: 'invalid_request_error',
              code: 'rate_limit_exceeded',
            }
          }));
          return;
        }
        res.setHeader('X-RateLimit-Limit', rlResult.limit);
        res.setHeader('X-RateLimit-Remaining', rlResult.remaining);
        res.setHeader('X-RateLimit-Reset', Math.floor(rlResult.resetAt / 1000));
      }
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/' || req.url === '') {
      res.writeHead(302, { Location: '/dashboard' });
      res.end();
      return;
    }

    if (req.url.startsWith('/dashboard')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return handleDashboard(req, res);
    }

    // Serve public files (favicon, manifest, logos) with cache and async read
    const publicPath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
    if (publicPath.startsWith(PUBLIC_DIR)) {
      const serveStatic = async () => {
        try {
          const stat = await fs.promises.stat(publicPath);
          const cached = _staticCache.get(publicPath);
          if (cached && cached.mtime === stat.mtimeMs) {
            const ext = path.extname(publicPath);
            const contentType = PUBLIC_MIME[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=' + infraCfg.staticCacheMaxAge });
            res.end(cached.content);
            return true;
          }
          const content = await fs.promises.readFile(publicPath);
          _staticCache.set(publicPath, { content, mtime: stat.mtimeMs });
          const ext = path.extname(publicPath);
          const contentType = PUBLIC_MIME[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=' + infraCfg.staticCacheMaxAge });
          res.end(content);
          return true;
        } catch {
          return false;
        }
      };
      const served = await serveStatic();
      if (served) return;
    }

    handleRequest(req, res);
  });

  const port = cfg ? cfg.port : config.port;
  const hostname = cfg ? cfg.hostname : config.hostname;

  server.listen(port, hostname, () => {
    console.log('[Aiproxy] Listening on http://' + hostname + ':' + port);
  });

  process.on('SIGTERM', async () => {
    await writeBuffer.shutdown();
    registry.shutdown();
    healthChecker.stop();
    rateLimiter.stop();
    server.close();
  });
}

module.exports = { start };
