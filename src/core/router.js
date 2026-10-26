const path = require('path');
const fs = require('fs');
const { generateRequestId } = require('../request-id');
const { AiproxyError, ProviderError, ModelNotFoundError } = require('./errors');
const { buildModelListResponse, buildChatCompletionResponse, buildErrorResponse, randomId } = require('./response');
const registry = require('./model-registry');
const modelStatus = require('./model-status');
const opencode = require('../providers/opencode');
const openaiCompatible = require('../providers/openai-compatible');
const { sanitizeResponseBody, sanitizeLogValue } = require('./sanitizer');
const policy = require('./policy');
const requestLogger = require('./request-logger');
const apiKeyAuth = require('./api-key-auth');
const config = require('../config');
const configStore = require('./config-store');
const { getDirectProviderConfig, resolveSecret, getProviderKeys } = require('./direct-provider-config');
const keyPool = require('./key-pool');
const anthropicAdapter = require('./anthropic-adapter');
const responsesAdapter = require('./openai-responses-adapter');
const googleAdapter = require('./google-adapter');
const usageTracker = require('./usage-tracker');
const providerLatency = require('./provider-latency');
const memoryService = require('./memory');
const tokenOptimizer = require('./token-optimizer');
const tokenSavings = require('./token-savings');
const skillsService = require('./skills');
const userSkillsService = require('./user-skills');
const specializedService = require('./specialized');

function startKeepAlive(res) {
  if (res.destroyed || res.writableEnded || !res.headersSent) return null;
  let count = 0;
  const timer = setInterval(() => {
    try {
      if (res.destroyed || res.writableEnded) return;
      count++;
      res.write(': keepalive ' + count + '\n\n');
    } catch (e) { /* socket closed mid-write */ }
  }, 15000);
  return timer;
}

function cb() { return configStore.getSection('circuitBreaker'); }

const breakerState = new Map();
const MAX_TRACES = 100;
const routingTraces = [];

function recordRoutingTrace(trace) {
  routingTraces.push({ ...trace, timestamp: Date.now() });
  if (routingTraces.length > MAX_TRACES) {
    routingTraces.splice(0, routingTraces.length - MAX_TRACES);
  }
}

function getRoutingTraces() {
  return routingTraces.slice();
}

function clearRoutingTraces() {
  routingTraces.length = 0;
}

modelStatus.setBreakerChecker((alias) => {
  const resolved = registry.resolveModel(alias);
  if (!resolved) return null;
  const key = resolved.providerID + '/' + resolved.modelID;
  const entry = breakerState.get(key);
  if (entry && entry.openUntil > Date.now()) return entry;
  const providerKey = resolved.providerID + '/*';
  const providerEntry = breakerState.get(providerKey);
  if (providerEntry && providerEntry.openUntil > Date.now()) return providerEntry;
  return null;
});

modelStatus.setProviderChecker((providerID) => {
  return registry.isProviderConnected(providerID);
});

function breakerKey(candidate) {
  return candidate.providerID + '/' + candidate.modelID;
}

function providerBreakerKey(candidate) {
  return candidate.providerID + '/*';
}

function getBreakerEntry(key) {
  const entry = breakerState.get(key);
  if (!entry) return null;
  if (entry.openUntil && entry.openUntil <= Date.now()) {
    breakerState.delete(key);
    return null;
  }
  if (entry.failures < cb().threshold && !entry.openUntil) {
    return null;
  }
  return entry;
}

function isBreakerOpen(candidate) {
  return !!getBreakerEntry(breakerKey(candidate)) || !!getBreakerEntry(providerBreakerKey(candidate));
}

function recordBreakerSuccess(candidate) {
  breakerState.delete(breakerKey(candidate));
  breakerState.delete(providerBreakerKey(candidate));
}

function openBreaker(key, cooldownMs, meta = {}) {
  breakerState.set(key, {
    failures: 0,
    openUntil: Date.now() + cooldownMs,
    reason: meta.reason || 'provider_error',
    scope: meta.scope || 'candidate',
  });
}

function recordBreakerFailure(candidate, error) {
  const key = breakerKey(candidate);
  const classification = error || {};
  const cooldownScope = classification.cooldownScope || 'candidate';
  const cooldownMs = classification.cooldownMs || cb().cooldownMs;

  if (cooldownScope === 'provider') {
    openBreaker(providerBreakerKey(candidate), cooldownMs, classification);
    openBreaker(key, cooldownMs, classification);
    return;
  }

  if (classification.providerErrorType === 'quota_exhausted' || classification.providerErrorType === 'rate_limit' || classification.providerErrorType === 'timeout' || classification.providerErrorType === 'provider_unavailable') {
    openBreaker(key, cooldownMs, classification);
    return;
  }

  const current = breakerState.get(key) || { failures: 0, openUntil: 0 };
  current.failures += 1;
  if (current.failures >= cb().threshold) {
    current.openUntil = Date.now() + cb().cooldownMs;
    current.failures = 0;
  }
  breakerState.set(key, current);
}

function safeAbortError() {
  return new AiproxyError('Request cancelled', 499, 'invalid_request_error', 'client_closed_request', 'Request cancelled');
}

function isClientClosed(error, signal) {
  if (signal?.aborted) return true;
  if (!error) return false;
  return error.statusCode === 499 || error.code === 'client_closed_request' || error.name === 'AbortError';
}

function requestOptions(signal) {
  return { timeoutMs: cb().requestTimeoutMs, signal };
}

function cleanupOptions() {
  return { timeoutMs: cb().requestTimeoutMs };
}

function isLocalRequest(req) {
  const address = req?.socket?.remoteAddress || req?.connection?.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

async function handleModelsRoute(req, res) {
  const models = registry.getPublicModels();
  const list = models.map(m => ({
    id: m.id,
    owned_by: 'aiproxy',
  }));
  const body = buildModelListResponse(list);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleHealthRoute(req, res) {
  const body = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleStatusRoute(req, res) {
  if (!isLocalRequest(req)) {
    const errResp = buildErrorResponse(new AiproxyError('Not found', 404, 'invalid_request_error', 'not_found', 'Not found'));
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    return;
  }

  const status = registry.getStatus();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: status.status,
    lastRefresh: status.lastRefresh,
    modelFamilies: status.familyCount,
    models: status.internalCount,
    refreshIntervalMs: status.refreshIntervalMs,
    circuitBreakersOpen: Array.from(breakerState.values()).filter(entry => entry.openUntil && entry.openUntil > Date.now()).length,
  }));
}

async function handleModelStatusRoute(req, res) {
  const allStatus = modelStatus.getAllStatus();
  const body = {
    object: 'list',
      data: allStatus.map(s => ({
        id: s.alias,
        object: 'model.status',
        status: s.status,
        lastChecked: s.lastChecked ? new Date(s.lastChecked).toISOString() : null,
        successRate: s.successRate,
        totalTokens: s.totalTokens,
    })),
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleCatalogRoute(req, res) {
  const body = registry.getPublishedCatalog();
  const allStatus = modelStatus.getAllStatus();
  const statusMap = {};
  for (const s of allStatus) {
    statusMap[s.alias] = s;
  }

  const url = new URL(req.url, 'http://localhost');
  const sort = url.searchParams.get('sort') || 'online';

  for (const item of body.data) {
    const st = statusMap[item.id] || {};
    item.status = st.status || 'unknown';
    item.successRate = st.successRate || null;
    item.requestCount = (st.successCount || 0) + (st.failureCount || 0);
    item.peakRps = st.peakRps || 0;
    item.trendDirection = st.trendDirection || 'stable';
    item.popularityScore = st.popularityScore || 0;
    item.recentHourCount = st.recentHourCount || 0;
  }

  const sortOrders = { available: 0, degraded: 1, overloaded: 2, down: 3, unknown: 4 };

  if (sort === 'online') {
    body.data.sort((a, b) => {
      const aOrder = sortOrders[a.status] ?? 4;
      const bOrder = sortOrders[b.status] ?? 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (b.popularityScore || 0) - (a.popularityScore || 0);
    });
  } else if (sort === 'trending') {
    body.data.sort((a, b) => {
      if (a.trendDirection === 'rising' && b.trendDirection !== 'rising') return -1;
      if (b.trendDirection === 'rising' && a.trendDirection !== 'rising') return 1;
      return (b.recentHourCount || 0) - (a.recentHourCount || 0);
    });
  } else if (sort === 'hot') {
    body.data.sort((a, b) => (b.requestCount || 0) - (a.requestCount || 0));
  } else if (sort === 'name') {
    body.data.sort((a, b) => a.id.localeCompare(b.id));
  }

  body.data.forEach((item, i) => { item.sortOrder = i + 1; });

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleSpecializedModelsRoute(req, res) {
  const specializedDir = path.join(__dirname, '..', '..', 'config', 'specialized');
  const publicModelsPath = path.join(__dirname, '..', '..', 'config', 'public-models.json');
  const models = [];

  // Read public-models.json to cross-reference displayName and enabled status
  let familyConfig = {};
  try {
    const raw = JSON.parse(fs.readFileSync(publicModelsPath, 'utf8'));
    familyConfig = (raw && raw.families) || {};
  } catch (e) {
    // file not available
  }

  try {
    const entries = fs.readdirSync(specializedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const indexPath = path.join(specializedDir, entry.name, 'index.json');
      if (!fs.existsSync(indexPath)) continue;

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      const modelEntry = familyConfig[entry.name] || {};
      const sources = new Set((index.chunks || []).map(c => c.source));

      models.push({
        id: entry.name,
        displayName: modelEntry.displayName || index.modelId || entry.name,
        description: index.description || '',
        domain: index.domain || '',
        chunkCount: index.chunkCount || 0,
        totalTokens: index.totalTokens || 0,
        lastBuilt: index.lastBuilt || null,
        topicCount: sources.size,
        topics: index.topics || [],
        enabled: modelEntry.enabled !== false,
        show: modelEntry.show !== false,
      });
    }
  } catch (e) {
    // specialized directory doesn't exist — return empty list
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    object: 'list',
    source: 'aiproxy',
    generatedAt: new Date().toISOString(),
    data: models,
  }));
}

function getResolvedCandidates(alias) {
  const resolved = registry.resolveModel(alias);
  if (!resolved) return null;
  const candidates = registry.getModelCandidates(alias) || [];
  return { resolved, candidates };
}

function pickHealthyCandidate(candidates) {
  return (candidates || []).find(candidate => !isBreakerOpen(candidate)) || null;
}

function getUsableCandidates(alias, candidates) {
  if (!candidates) return [];
  const usable = [];
  for (const candidate of candidates) {
    if (isBreakerOpen(candidate)) continue;
    if (candidate.transport === 'openai-compatible') {
      const directConfig = getDirectProviderConfig(candidate.providerID);
      if (!directConfig || getProviderKeys(candidate.providerID).length === 0) {
        recordRoutingTrace({ modelId: alias, selectedCandidate: { provider: candidate.providerID, model: candidate.modelID }, reason: 'skipped', detail: 'no-available-key' });
        openBreaker(breakerKey(candidate), cb().cooldownMs, { reason: 'no_api_key', scope: 'candidate' });
        continue;
      }
    }
    usable.push(candidate);
  }
  return usable;
}

function sortCandidatesByHealth(alias, candidates) {
  const arr = [...candidates];
  arr.sort((a, b) => {
    const aLat = providerLatency.getAvgLatency(a.providerID);
    const bLat = providerLatency.getAvgLatency(b.providerID);
    const aHasData = isFinite(aLat);
    const bHasData = isFinite(bLat);
    if (aHasData !== bHasData) return aHasData ? -1 : 1;
    if (aHasData && bHasData) return aLat - bLat;
    return 0;
  });
  return arr;
}

async function runNonStreamingWithFallback(req, res, requestId, alias, candidateInfo, parts, requestOptions, messages, toolParams) {
  const candidates = getUsableCandidates(alias, candidateInfo.candidates || []);
  if (candidates.length === 0) {
    recordRoutingTrace({ modelId: alias, selectedCandidate: null, reason: 'no-candidates', detail: 'All candidates breaker-open or unavailable' });
    throw new AiproxyError('No healthy model candidates available', 503, 'server_error', 'model_unavailable', 'Hệ thống gặp sự cố. Vui lòng thử lại sau.');
  }

  const sortedCandidates = sortCandidatesByHealth(alias, candidates);
  const policyInfo = policy.getPolicyForModel(candidateInfo.resolved);
  let lastError = null;
  let attempts = 0;
  for (const candidate of sortedCandidates) {
    if (++attempts > 5) {
      recordRoutingTrace({ modelId: alias, selectedCandidate: null, reason: 'max-retries', detail: 'Exceeded max fallback attempts (5)' });
      break;
    }
    if (candidate.transport === 'openai-compatible') {
      const directConfig = getDirectProviderConfig(candidate.providerID);
      if (!directConfig) {
        recordRoutingTrace({ modelId: alias, selectedCandidate: { provider: candidate.providerID, model: candidate.modelID }, reason: 'skipped', detail: 'direct-config-not-found' });
        continue;
      }
      const providerKeys = getProviderKeys(candidate.providerID);
      const selected = providerKeys.length > 1 ? keyPool.selectKey(providerKeys) : null;
      const keyToUse = selected ? selected.key : providerKeys[0];
      if (!keyToUse) {
        recordRoutingTrace({ modelId: alias, selectedCandidate: { provider: candidate.providerID, model: candidate.modelID }, reason: 'skipped', detail: 'no-key' });
        continue;
      }
      if (selected) keyPool.markKeyActive(keyToUse.id);
      let directStartTs = 0;
      try {
        directStartTs = Date.now();
        const directResult = await openaiCompatible.chatCompletion(
          { baseUrl: directConfig.baseURL, apiKey: keyToUse.value, path: directConfig.path, timeout: Math.min(directConfig.timeout || 120000, 120000) },
          candidate.modelID,
          messages,
          { timeout: requestOptions?.timeoutMs, ...toolParams }
        );
        const latencyMs = Date.now() - directStartTs;
        providerLatency.recordLatency(candidate.providerID, latencyMs);
        if (selected) keyPool.recordKeySuccess(keyToUse.id, latencyMs);
        const hasContent = directResult.content && directResult.content.trim().length > 0;
        const hasToolCalls = directResult.toolCalls && directResult.toolCalls.length > 0;
        if (!hasContent && !hasToolCalls) {
          const emptyError = new ProviderError('Empty response from provider');
          emptyError.retryable = true;
          emptyError.providerErrorType = 'provider_unavailable';
          throw emptyError;
        }
        const result = buildChatCompletionResponse({
          model: alias,
          content: directResult.content,
          finishReason: directResult.finishReason,
          usage: directResult.usage,
          toolCalls: directResult.toolCalls,
        });
        sanitizeResponseBody(result);
        recordBreakerSuccess(candidate);
        modelStatus.recordSuccess(alias, candidate.providerID, {
          input: directResult.usage?.prompt_tokens || 0,
          output: directResult.usage?.completion_tokens || 0,
        });
        recordRoutingTrace({ modelId: alias, selectedCandidate: { provider: candidate.providerID, model: candidate.modelID }, reason: 'primary', detail: 'direct-success' });
        return result;
      } catch (error) {
        lastError = error;
        providerLatency.recordLatency(candidate.providerID, Date.now() - directStartTs);
        if (selected) keyPool.recordKeyFailure(keyToUse.id, error.providerErrorType || error.errorType || 'unknown');
        recordBreakerFailure(candidate, error);
        modelStatus.recordFailure(alias, candidate.providerID, error);
        if (!error || error.retryable === false || error.providerErrorType === 'bad_request' || error.providerErrorType === 'bad_request_model_not_found' || error.providerErrorType === 'policy_violation') {
          throw error;
        }
      }
    } else {
      let session = null;
      let startTs = 0;
      try {
        startTs = Date.now();
        session = await opencode.createSession(requestOptions);
        const combinedParts = policyInfo.systemPrompt
          ? [{ type: 'text', text: policyInfo.systemPrompt }, ...parts]
          : parts;
        const result = await opencode.handleSyncResponse(null, session.id, candidate.providerID, candidate.modelID, alias, combinedParts, requestOptions, toolParams);
        const latencyMs = Date.now() - startTs;
        providerLatency.recordLatency(candidate.providerID, latencyMs);
        sanitizeResponseBody(result);
        const hasContent = result.choices?.[0]?.message?.content?.trim().length > 0;
        const hasToolCalls = result.choices?.[0]?.message?.tool_calls?.length > 0;
        if (!hasContent && !hasToolCalls) {
          const emptyError = new ProviderError('Empty response from OpenCode');
          emptyError.retryable = true;
          emptyError.providerErrorType = 'provider_unavailable';
          throw emptyError;
        }
        recordBreakerSuccess(candidate);
        modelStatus.recordSuccess(alias, candidate.providerID, {
          input: result.usage?.prompt_tokens || 0,
          output: result.usage?.completion_tokens || 0,
        });
        recordRoutingTrace({ modelId: alias, selectedCandidate: { provider: candidate.providerID, model: candidate.modelID }, reason: 'primary', detail: 'opencode-success' });
        return result;
      } catch (error) {
        lastError = error;
        providerLatency.recordLatency(candidate.providerID, Date.now() - startTs);
        recordBreakerFailure(candidate, error);
        modelStatus.recordFailure(alias, candidate.providerID, error);
        if (!error || error.retryable === false || error.providerErrorType === 'bad_request' || error.providerErrorType === 'bad_request_model_not_found' || error.providerErrorType === 'policy_violation') {
          throw error;
        }
      } finally {
        if (session && session.id) {
          await opencode.deleteSession(session.id, cleanupOptions()).catch(() => {});
        }
      }
    }
  }

  throw lastError || new AiproxyError('Upstream failure', 502, 'provider_error', 'provider_error', 'Hệ thống gặp sự cố. Vui lòng thử lại sau.');
}

async function injectSpecializedKnowledge(resolved, messages, sessionId) {
  if (!resolved.isSpecialized || !resolved.specializedConfig) return null;
  try {
    const knowledgeCtx = await specializedService.processRequest(resolved, messages, { sessionId });
    if (!knowledgeCtx || !knowledgeCtx.chunks || knowledgeCtx.chunks.length === 0) return null;
    const baseSystemPrompt = extractSystemPrompt(messages);
    const augmentedPrompt = specializedService.buildKnowledgePrompt(baseSystemPrompt, knowledgeCtx, resolved);
    if (!augmentedPrompt) return null;
    return { augmentedPrompt, knowledgeCtx };
  } catch (e) {
    console.error('[Specialized] Injection error:', e.message);
    return null;
  }
}

function extractSystemPrompt(messages) {
  if (!messages || !Array.isArray(messages)) return '';
  const sysMsg = messages.find(m => m.role === 'system');
  return sysMsg ? sysMsg.content : '';
}

function updateSystemMessage(messages, newContent) {
  if (!newContent) return messages;
  const hasSystem = messages.some(m => m.role === 'system');
  if (hasSystem) {
    return messages.map(m => m.role === 'system' ? { ...m, content: newContent } : m);
  }
  return [{ role: 'system', content: newContent }, ...messages];
}

async function handleChatRoute(req, res) {
  const requestId = req.requestId;
  const startTime = Date.now();
  const bodyChunks = [];
  let requestModel = null;
  let requestProvider = null;

  const authKey = req.authKey || null;
  const reqUserId = authKey ? String(authKey.userId) : (req.headers['x-auth-user-id'] || req.headers['x-user-id'] || req.headers['x-memory-user-id'] || null);
  const reqUserEmail = authKey ? authKey.userEmail : (req.headers['x-auth-user-email'] || req.headers['x-user-email'] || req.headers['x-memory-user-id'] || null);

  function logRequest(statusCode, error, tokens) {
    if (requestModel) {
      const isViolation = error && (error.code === 'policy_violation' || error.name === 'PolicyViolationError');
      if (isViolation && reqUserId) requestLogger.recordViolation(reqUserId);
      requestLogger.recordRequest({
        method: 'POST',
        path: '/v1/chat/completions',
        model: requestModel,
        provider: requestProvider,
        alias: requestModel,
        status: statusCode,
        latencyMs: Date.now() - startTime,
        error: error ? (error.message || String(error)) : null,
        inputTokens: tokens?.input || null,
        outputTokens: tokens?.output || null,
        userId: reqUserId || undefined,
        userEmail: reqUserEmail || undefined,
        keyId: authKey ? authKey.keyId : undefined,
        violationType: isViolation ? 'policy_violation' : null,
        blockedPattern: isViolation ? (error.blockedPattern || null) : null,
      });
      usageTracker.recordUsage({
        model: requestModel,
        provider: requestProvider,
        alias: requestModel,
        inputTokens: tokens?.input,
        outputTokens: tokens?.output,
        latencyMs: Date.now() - startTime,
        status: statusCode,
        group: 'chat',
      });
    }
  }
  const abortController = new AbortController();
  const onAbort = () => abortController.abort();
  let requestCompleted = false;
  const onClose = () => {
    if (!requestCompleted) abortController.abort();
  };
  req.on('aborted', onAbort);
  res.on('close', onClose);
  res.on('finish', () => {
    requestCompleted = true;
  });
  const MAX_BODY_SIZE = 1024 * 1024;
  let bodyLength = 0;
  let bodySizeExceeded = false;
  try {
    for await (const chunk of req) {
      bodyLength += chunk.length;
      if (bodyLength > MAX_BODY_SIZE) {
        bodySizeExceeded = true;
        req.destroy();
        break;
      }
      bodyChunks.push(chunk);
    }
  } catch (e) {
    if (abortController.signal.aborted) {
      return;
    }
    throw e;
  }
  const body = Buffer.concat(bodyChunks).toString();
  if (bodySizeExceeded) {
    const errResp = buildErrorResponse(new AiproxyError('Request body too large', 413, 'invalid_request_error', 'payload_too_large', 'Request body too large. Maximum size is 1MB.'), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    return;
  }

  if (abortController.signal.aborted) {
    return;
  }

  let request;
  try {
    request = JSON.parse(body);
  } catch (e) {
    const errResp = buildErrorResponse(new AiproxyError('Invalid JSON body', 400, 'invalid_request_error', 'invalid_json', 'Invalid JSON body'), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    return;
  }

  const { model, messages, stream = false, tools, tool_choice, temperature, max_tokens, top_p } = request;
  requestModel = model;

  if (reqUserId && requestLogger.checkViolationRateLimit(reqUserId)) {
    const errResp = buildErrorResponse(new AiproxyError('Too many policy violations. Your access has been temporarily blocked.', 429, 'rate_limit_error', 'violation_rate_limit', 'Too many violations. Try again later.'), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    return;
  }

  let candidateInfo;
  try {
    candidateInfo = getResolvedCandidates(model);
    if (!candidateInfo) {
      throw new ModelNotFoundError(model);
    }
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      const errResp = buildErrorResponse(err, requestId);
      res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errResp.body));
      logRequest(404, err);
    } else {
      const errResp = buildErrorResponse(err, requestId);
      res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errResp.body));
      logRequest(errResp.statusCode || 400, err);
    }
    return;
  }

  const sessionId = req.headers['x-session-id'] || req.headers['x-conversation-id'] || null;
  const systemPolicy = policy.getPolicyForModel(candidateInfo.resolved);
  const specializedResult = await injectSpecializedKnowledge(candidateInfo.resolved, messages, sessionId);
  if (specializedResult) {
    systemPolicy.systemPrompt = specializedResult.augmentedPrompt;
  }
  const memoryEnabled = req.headers['x-memory-enabled'] === 'true';
  const memoryUserId = req.headers['x-memory-user-id'] || null;
  const memoryBudget = parseInt(req.headers['x-memory-token-budget'] || '500', 10);
  if (memoryEnabled && memoryUserId) {
    try {
      const memCtx = await memoryService.buildMemoryContext(memoryUserId, messages.map(m => m.content).join(' '), Math.min(memoryBudget, 2000));
      if (memCtx) {
        systemPolicy.systemPrompt += '\n\n' + memCtx.text;
      }
    } catch (e) {}
  }
  if (reqUserId) {
    try {
      const enabledSkills = userSkillsService.getEnabledSkills(reqUserId);
      if (enabledSkills && enabledSkills.length > 0) {
        const userSkillsPref = userSkillsService.getUserSkills(reqUserId);
        const tokenBudget = userSkillsPref.tokenBudget || 2000;
        const matched = skillsService.matchSkills(enabledSkills, messages, tokenBudget);
        if (matched.selected && matched.selected.length > 0) {
          const skillsCtx = skillsService.buildSkillsContext(matched.selected);
          if (skillsCtx) {
            systemPolicy.systemPrompt += '\n\n' + skillsCtx.text;
          }
        }
      }
    } catch (e) {}
  }
  const scheduleMemoryExtraction = async () => {
    if (!memoryEnabled || !memoryUserId) return;
    try {
      const extracted = await memoryService.extractWithLLM(messages, opencode, memoryUserId);
      for (const fact of extracted) {
        memoryService.add(memoryUserId, fact).catch(() => {});
      }
    } catch (e) {
      const userMessages = messages.filter(m => m.role === 'user');
      const extracted = memoryService.extractFacts(userMessages);
      for (const fact of extracted) {
        memoryService.add(memoryUserId, fact).catch(() => {});
      }
    }
  };
  const injectedMessages = policy.injectSystemPrompt(messages, systemPolicy);
  const optimizeTokens = req.headers['x-optimize-tokens'] !== 'false';
  const optimizerCfg = configStore.getSection('tokenOptimizer');
  let optimizedMessages = injectedMessages;
  let optimizerStats = null;
  if (optimizeTokens && optimizerCfg.enabled !== false) {
    const result = tokenOptimizer.optimizeMessages(injectedMessages, candidateInfo.resolved, {
      enabled: true,
      compressThreshold: optimizerCfg.compressThreshold || 0.5,
      maxHistoryPairs: optimizerCfg.maxHistoryPairs || 3,
    });
    if (result.stats && result.stats.strategy !== 'none') {
      optimizedMessages = result.messages;
      optimizerStats = result.stats;
      const optTokens = { input: result.stats.compressedTokens, output: 0 };
      tokenSavings.recordSavings({
        requestId,
        userId: reqUserId || null,
        model: requestModel,
        provider: candidateInfo.resolved.providerID,
        originalTokens: result.stats.originalTokens,
        compressedTokens: result.stats.compressedTokens,
        outputTokens: 0,
        strategy: result.stats.strategy,
        optimizeEnabled: true,
      });
    }
  }
  const parts = opencode.convertMessages(optimizedMessages).parts;
  if (parts.length === 0) {
    const errResp = buildErrorResponse(new AiproxyError('No user message found', 400, 'invalid_request_error', 'no_user_message', 'No user message found'), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    logRequest(400, 'No user message');
    return;
  }

  try {
    if (stream) {
      const streamCandidates = sortCandidatesByHealth(model, getUsableCandidates(model, candidateInfo.candidates || []));
      if (streamCandidates.length === 0) {
        recordRoutingTrace({ modelId: model, selectedCandidate: null, reason: 'no-candidates', detail: 'streaming-no-candidates' });
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        const errorChunk = {
          id: randomId(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { content: '\n\nHệ thống gặp sự cố. Vui lòng thử lại sau.' }, finish_reason: 'stop' }],
        };
        res.write('data: ' + JSON.stringify(errorChunk) + '\n\n');
        res.write('data: [DONE]\n\n');
        res.end();
        logRequest(503, 'No healthy streaming candidates');
        return;
      }

      let lastStreamError = null;
      let streamAttempts = 0;
      for (const streamCandidate of streamCandidates) {
        if (++streamAttempts > 5) {
          break;
        }
        const streamStartTs = Date.now();
        if (streamCandidate.transport === 'openai-compatible') {
          const directConfig = getDirectProviderConfig(streamCandidate.providerID);
          if (!directConfig) {
            recordBreakerFailure(streamCandidate, { providerErrorType: 'no_api_key', cooldownScope: 'candidate' });
            continue;
          }

          const streamProviderKeys = getProviderKeys(streamCandidate.providerID);
          const streamSelected = streamProviderKeys.length > 1 ? keyPool.selectKey(streamProviderKeys) : null;
          const streamKeyToUse = streamSelected ? streamSelected.key : streamProviderKeys[0];
          if (!streamKeyToUse) {
            recordBreakerFailure(streamCandidate, { providerErrorType: 'no_api_key', cooldownScope: 'candidate' });
            continue;
          }
          if (streamSelected) keyPool.markKeyActive(streamKeyToUse.id);

          if (!res.headersSent) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
          }

          const completionId = randomId();
          const initialChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          };
          res.write('data: ' + JSON.stringify(initialChunk) + '\n\n');

          const kaTimer = startKeepAlive(res);
          try {
            const streamResult = await openaiCompatible.chatCompletionStream(
              { baseUrl: directConfig.baseURL, apiKey: streamKeyToUse.value, path: directConfig.path, timeout: Math.min(directConfig.timeout || 120000, 120000) },
              streamCandidate.modelID,
              injectedMessages,
              res,
              { tools, tool_choice, temperature, max_tokens, top_p }
            );
            clearInterval(kaTimer);
            if (streamSelected) keyPool.recordKeySuccess(streamKeyToUse.id, null);
            providerLatency.recordLatency(streamCandidate.providerID, Date.now() - streamStartTs);
            recordBreakerSuccess(streamCandidate);
            modelStatus.recordSuccess(model, streamCandidate.providerID, streamResult.usage);
            tokenSavings.recordOutputTokens(requestId, streamResult.usage?.output || 0);
            requestProvider = streamCandidate.providerID;
            logRequest(200, null, streamResult.usage);
            recordRoutingTrace({ modelId: model, selectedCandidate: { provider: streamCandidate.providerID, model: streamCandidate.modelID }, reason: 'primary', detail: 'stream-direct-success' });
            scheduleMemoryExtraction();
            break;
          } catch (error) {
            clearInterval(kaTimer);
            if (isClientClosed(error, abortController.signal)) {
              requestProvider = streamCandidate.providerID;
              logRequest(499, 'Client disconnected');
              return;
            }
            lastStreamError = error;
            providerLatency.recordLatency(streamCandidate.providerID, Date.now() - streamStartTs);
            if (streamSelected) keyPool.recordKeyFailure(streamKeyToUse.id, error.providerErrorType || error.errorType || 'unknown');
            recordBreakerFailure(streamCandidate, error);
            modelStatus.recordFailure(model, streamCandidate.providerID, error);
            requestProvider = streamCandidate.providerID;
            logRequest(503, error);
            if (error.retryable === false) {
              throw error;
            }
          }
        } else {
          let session = null;
          const kaTimer = startKeepAlive(res);
          try {
            session = await opencode.createSession(requestOptions(abortController.signal));
            const converted = opencode.convertMessages(injectedMessages);
            const streamSystemPrompt = converted.systemPrompt || systemPolicy.systemPrompt;
            const streamParts = streamSystemPrompt
              ? [{ type: 'text', text: streamSystemPrompt }, ...parts]
              : parts;
            const streamResult = await opencode.handleStreamingResponse(req, res, session.id, streamCandidate.providerID, streamCandidate.modelID, model, streamParts, requestOptions(abortController.signal), { tools, tool_choice });
          if (streamResult && streamResult.ok) {
            providerLatency.recordLatency(streamCandidate.providerID, Date.now() - streamStartTs);
            recordBreakerSuccess(streamCandidate);
            modelStatus.recordSuccess(model, streamCandidate.providerID, streamResult.usage);
            tokenSavings.recordOutputTokens(requestId, streamResult.usage?.output || 0);
            requestProvider = streamCandidate.providerID;
            logRequest(200, null, streamResult.usage);
            recordRoutingTrace({ modelId: model, selectedCandidate: { provider: streamCandidate.providerID, model: streamCandidate.modelID }, reason: 'primary', detail: 'stream-opencode-success' });
            scheduleMemoryExtraction();
            break;
          } else if (streamResult === undefined || streamResult === null) {
            return;
          } else {
            lastStreamError = streamResult.error || { retryable: true };
            providerLatency.recordLatency(streamCandidate.providerID, Date.now() - streamStartTs);
            recordBreakerFailure(streamCandidate, lastStreamError);
            modelStatus.recordFailure(model, streamCandidate.providerID, lastStreamError);
            requestProvider = streamCandidate.providerID;
            logRequest(503, lastStreamError);
            continue;
          }
        } catch (error) {
          if (isClientClosed(error, abortController.signal)) {
            requestProvider = streamCandidate.providerID;
            logRequest(499, 'Client disconnected');
            return;
          }
          lastStreamError = error;
          providerLatency.recordLatency(streamCandidate.providerID, Date.now() - streamStartTs);
          recordBreakerFailure(streamCandidate, error);
          modelStatus.recordFailure(model, streamCandidate.providerID, error);
          requestProvider = streamCandidate.providerID;
          logRequest(503, error);
          if (error.retryable === false) {
            throw error;
          }
        } finally {
          clearInterval(kaTimer);
          if (session && session.id) {
            await opencode.deleteSession(session.id, cleanupOptions()).catch(() => {});
          }
        }
        }
      }
      if (lastStreamError) throw lastStreamError;
    } else {
      const result = await runNonStreamingWithFallback(req, res, requestId, model, candidateInfo, parts, requestOptions(abortController.signal), injectedMessages, { tools, tool_choice, temperature, max_tokens, top_p });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      requestProvider = candidateInfo.resolved.providerID;
      logRequest(200, null, { input: result?.usage?.prompt_tokens || 0, output: result?.usage?.completion_tokens || 0 });
      tokenSavings.recordOutputTokens(requestId, result?.usage?.completion_tokens || 0);
      scheduleMemoryExtraction();
    }
  } catch (error) {
    if (isClientClosed(error, abortController.signal)) {
      logRequest(499, 'Client disconnected');
      return;
    }
    console.error('[' + requestId + '] Chat completion error:', sanitizeLogValue(error?.message));
    const errResp = buildErrorResponse(error, requestId);
    if (!res.headersSent) {
      res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errResp.body));
    } else {
      try {
        res.write('\ndata: [DONE]\n\n');
        res.end();
      } catch (_) {}
    }
    logRequest(errResp ? errResp.statusCode : 500, error);
  } finally {
    req.off('aborted', onAbort);
    res.off('close', onClose);
  }
}

async function handleAnthropicMessagesRoute(req, res) {
  const requestId = req.requestId;
  const startTime = Date.now();

  const bodyChunks = [];
  try {
    for await (const chunk of req) {
      bodyChunks.push(chunk);
    }
  } catch (e) {
    const body = Buffer.concat(bodyChunks).toString();
    logRouteResult(requestId, null, null, '/v1/messages', 400, e, null, startTime);
    const errResp = buildErrorResponse(new AiproxyError('Failed to read request body', 400), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    return;
  }

  const body = Buffer.concat(bodyChunks).toString();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    logRouteResult(requestId, null, null, '/v1/messages', 400, e, null, startTime);
    const errResp = buildErrorResponse(new AiproxyError('Invalid JSON body', 400), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    return;
  }

  const modelAliases = configStore.getSection('modelAliases') || {};
  const convertible = anthropicAdapter.parseAnthropicRequest(parsed, modelAliases);

  let candidateInfo;
  try {
    candidateInfo = getResolvedCandidates(convertible.model);
    if (!candidateInfo) {
      throw new ModelNotFoundError(convertible.model);
    }
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      const errResp = buildErrorResponse(err, requestId);
      res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errResp.body));
      return;
    }
    throw err;
  }

  const injectedMessages = convertible.messages;

  if (candidateInfo.resolved.isSpecialized && candidateInfo.resolved.specializedConfig) {
    try {
      const sessionId = req.headers['x-session-id'] || req.headers['x-conversation-id'] || null;
      const specializedResult = await injectSpecializedKnowledge(candidateInfo.resolved, injectedMessages, sessionId);
      if (specializedResult) {
        const updated = updateSystemMessage([...injectedMessages], specializedResult.augmentedPrompt);
        injectedMessages.length = 0;
        injectedMessages.push(...updated);
      }
    } catch (e) {
      console.error('[Specialized] Anthropic injection error:', e.message);
    }
  }

  const parts = opencode.convertMessages(injectedMessages).parts;
  if (parts.length === 0) {
    const errResp = buildErrorResponse(new AiproxyError('No user message found', 400), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
    return;
  }

  const model = convertible.model;
  const isStream = convertible.stream;

  try {
    const candidates = registry.getModelCandidates(model) || [];
    const usable = candidates.filter(c => !isBreakerOpen(c));

    if (usable.length === 0) {
      throw new AiproxyError('No healthy model candidates available', 503, 'server_error', 'model_unavailable', 'Hệ thống gặp sự cố.');
    }

    const candidate = usable[0];

    if (isStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let response;
      if (candidate.transport === 'openai-compatible') {
        const directConfig = getDirectProviderConfig(candidate.providerID);
        if (!directConfig) throw new AiproxyError('Provider config not found', 502);
        const providerKeys = getProviderKeys(candidate.providerID);
        const keyToUse = providerKeys[0];
        response = await openaiCompatible.chatCompletion(
          { baseUrl: directConfig.baseURL, apiKey: keyToUse?.value, path: directConfig.path, timeout: directConfig.timeout },
          candidate.modelID,
          injectedMessages,
          { timeout: 60000 }
        );
      } else {
        const session = await opencode.createSession({ timeoutMs: 60000 });
        response = await opencode.handleSyncResponse(null, session.id, candidate.providerID, candidate.modelID, model, parts, { timeoutMs: 60000 });
        await opencode.deleteSession(session.id, { timeoutMs: 5000 }).catch(() => {});
      }

      const openaiResp = buildChatCompletionResponse({
        model,
        content: response.content,
        finishReason: response.finishReason || 'stop',
        usage: response.usage,
        toolCalls: response.toolCalls,
      });

      const events = anthropicAdapter.buildAnthropicStreamEvents(openaiResp, parsed.model);
      for (const evt of events) {
        res.write('event: ' + evt.event + '\n');
        res.write('data: ' + evt.data + '\n\n');
        await new Promise(r => setTimeout(r, 10));
      }
      res.end();

      const tokens = { input: response.usage?.prompt_tokens || 0, output: response.usage?.completion_tokens || 0 };
      recordBreakerSuccess(candidate);
      modelStatus.recordSuccess(model, candidate.providerID, tokens);
      logRouteResult(requestId, model, candidate.providerID, '/v1/messages', 200, null, tokens, startTime);
    } else {
      let result;
      if (candidate.transport === 'openai-compatible') {
        const directConfig = getDirectProviderConfig(candidate.providerID);
        if (!directConfig) throw new AiproxyError('Provider config not found', 502);
        const providerKeys = getProviderKeys(candidate.providerID);
        const selected = providerKeys.length > 1 ? keyPool.selectKey(providerKeys) : null;
        const keyToUse = selected ? selected.key : providerKeys[0];
        if (selected) keyPool.markKeyActive(keyToUse.id);
        try {
          result = await openaiCompatible.chatCompletion(
            { baseUrl: directConfig.baseURL, apiKey: keyToUse.value, path: directConfig.path, timeout: directConfig.timeout },
            candidate.modelID,
            injectedMessages,
            { timeout: 60000 }
          );
          if (selected) keyPool.recordKeySuccess(keyToUse.id, Date.now());
        } catch (err) {
          if (selected) keyPool.recordKeyFailure(keyToUse.id, err.providerErrorType || 'unknown');
          throw err;
        }
      } else {
        result = await opencode.handleSyncResponse(null, null, candidate.providerID, candidate.modelID, model, parts, { timeoutMs: 60000 });
      }
      const openaiResp = buildChatCompletionResponse({
        model,
        content: result.content,
        finishReason: result.finishReason || 'stop',
        usage: result.usage,
        toolCalls: result.toolCalls,
      });

      const anthropicResp = anthropicAdapter.buildAnthropicResponse(openaiResp, parsed.model);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(anthropicResp));

      const tokens = { input: result.usage?.prompt_tokens || 0, output: result.usage?.completion_tokens || 0 };
      recordBreakerSuccess(candidate);
      modelStatus.recordSuccess(model, candidate.providerID, tokens);
      logRouteResult(requestId, model, candidate.providerID, '/v1/messages', 200, null, tokens, startTime);
    }
  } catch (error) {
    console.error('[' + requestId + '] Anthropic messages error:', sanitizeLogValue(error?.message));
    const errStatus = error?.statusCode || 500;
    const catchProvider = candidate?.providerID || 'unknown';
    logRouteResult(requestId, model, catchProvider, '/v1/messages', errStatus, error, null, startTime);
    if (isStream && !res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const errEvents = anthropicAdapter.buildAnthropicStreamEvents(
        buildChatCompletionResponse({ model, content: 'An error occurred. Please try again.', finishReason: 'stop', usage: {} }),
        parsed.model
      );
      for (const evt of errEvents) {
        res.write('event: ' + evt.event + '\n');
        res.write('data: ' + evt.data + '\n\n');
      }
      res.end();
    } else if (isStream) {
      try { res.write('\ndata: [DONE]\n\n'); res.end(); } catch (_) {}
    } else if (!res.headersSent) {
      const errResp = buildErrorResponse(error, requestId);
      res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errResp.body));
    }
    recordBreakerFailure({ providerID: catchProvider, modelID: 'unknown' }, error);
    modelStatus.recordFailure(model, catchProvider, error);
  }
}

async function handleOpenAIResponsesRoute(req, res) {
  const requestId = req.requestId;
  const startTime = Date.now();
  const bodyChunks = [];
  try {
    for await (const chunk of req) { bodyChunks.push(chunk); }
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildErrorResponse(new AiproxyError('Failed to read request body', 400), requestId).body));
    return;
  }
  const body = Buffer.concat(bodyChunks).toString();
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildErrorResponse(new AiproxyError('Invalid JSON body', 400), requestId).body));
    return;
  }

  const modelAliases = configStore.getSection('modelAliases') || {};
  const convertible = responsesAdapter.parseResponsesRequest(parsed, modelAliases);
  const model = convertible.model;
  const isStream = convertible.stream;
  const injectedMessages = convertible.messages;
  const parts = opencode.convertMessages(injectedMessages).parts;

  if (parts.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildErrorResponse(new AiproxyError('No user message found', 400), requestId).body));
    return;
  }

  let candidateInfo;
  try {
    candidateInfo = getResolvedCandidates(model);
    if (!candidateInfo) throw new ModelNotFoundError(model);
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      logRouteResult(requestId, null, null, '/v1/responses', 404, err, null, startTime);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildErrorResponse(err, requestId).body));
      return;
    }
    throw err;
  }

  if (candidateInfo.resolved.isSpecialized && candidateInfo.resolved.specializedConfig) {
    try {
      const sessionId = req.headers['x-session-id'] || req.headers['x-conversation-id'] || null;
      const specializedResult = await injectSpecializedKnowledge(candidateInfo.resolved, injectedMessages, sessionId);
      if (specializedResult) {
        const updated = updateSystemMessage([...injectedMessages], specializedResult.augmentedPrompt);
        injectedMessages.length = 0;
        injectedMessages.push(...updated);
      }
    } catch (e) {
      console.error('[Specialized] Responses injection error:', e.message);
    }
  }

  try {
    const candidates = registry.getModelCandidates(model) || [];
    const usable = candidates.filter(c => !isBreakerOpen(c));
    if (usable.length === 0) throw new AiproxyError('No healthy model candidates available', 503, 'server_error', 'model_unavailable', 'Hệ thống gặp sự cố.');

    const candidate = usable[0];

    if (isStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      let response;
      if (candidate.transport === 'openai-compatible') {
        const directConfig = getDirectProviderConfig(candidate.providerID);
        if (!directConfig) throw new AiproxyError('Provider config not found', 502);
        const providerKeys = getProviderKeys(candidate.providerID);
        const keyToUse = providerKeys[0];
        response = await openaiCompatible.chatCompletion({ baseUrl: directConfig.baseURL, apiKey: keyToUse?.value, path: directConfig.path, timeout: directConfig.timeout }, candidate.modelID, injectedMessages, { timeout: 60000 });
      } else {
        const session = await opencode.createSession({ timeoutMs: 60000 });
        response = await opencode.handleSyncResponse(null, session.id, candidate.providerID, candidate.modelID, model, parts, { timeoutMs: 60000 });
        await opencode.deleteSession(session.id, { timeoutMs: 5000 }).catch(() => {});
      }
      const openaiResp = buildChatCompletionResponse({ model, content: response.content, finishReason: response.finishReason || 'stop', usage: response.usage, toolCalls: response.toolCalls });
      const events = responsesAdapter.buildResponsesStreamEvents(openaiResp, parsed.model);
      for (const evt of events) {
        res.write('event: ' + evt.event + '\n');
        res.write('data: ' + evt.data + '\n\n');
        await new Promise(r => setTimeout(r, 10));
      }
      res.end();
      const tokens = { input: response.usage?.prompt_tokens || 0, output: response.usage?.completion_tokens || 0 };
      recordBreakerSuccess(candidate);
      modelStatus.recordSuccess(model, candidate.providerID, tokens);
      logRouteResult(requestId, model, candidate.providerID, '/v1/responses', 200, null, tokens, startTime);
    } else {
      let result;
      if (candidate.transport === 'openai-compatible') {
        const directConfig = getDirectProviderConfig(candidate.providerID);
        if (!directConfig) throw new AiproxyError('Provider config not found', 502);
        const providerKeys = getProviderKeys(candidate.providerID);
        const selected = providerKeys.length > 1 ? keyPool.selectKey(providerKeys) : null;
        const keyToUse = selected ? selected.key : providerKeys[0];
        if (selected) keyPool.markKeyActive(keyToUse.id);
        try {
          result = await openaiCompatible.chatCompletion({ baseUrl: directConfig.baseURL, apiKey: keyToUse.value, path: directConfig.path, timeout: directConfig.timeout }, candidate.modelID, injectedMessages, { timeout: 60000 });
          if (selected) keyPool.recordKeySuccess(keyToUse.id, Date.now());
        } catch (err) {
          if (selected) keyPool.recordKeyFailure(keyToUse.id, err.providerErrorType || 'unknown');
          throw err;
        }
      } else {
        result = await opencode.handleSyncResponse(null, null, candidate.providerID, candidate.modelID, model, parts, { timeoutMs: 60000 });
      }
      const openaiResp = buildChatCompletionResponse({ model, content: result.content, finishReason: result.finishReason || 'stop', usage: result.usage, toolCalls: result.toolCalls });
      const responseResp = responsesAdapter.buildResponsesResponse(openaiResp, parsed.model);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(responseResp));
      const tokens = { input: result.usage?.prompt_tokens || 0, output: result.usage?.completion_tokens || 0 };
      recordBreakerSuccess(candidate);
      modelStatus.recordSuccess(model, candidate.providerID, tokens);
      logRouteResult(requestId, model, candidate.providerID, '/v1/responses', 200, null, tokens, startTime);
    }
  } catch (error) {
    console.error('[' + requestId + '] Responses error:', sanitizeLogValue(error?.message));
    const errStatus = error?.statusCode || 500;
    logRouteResult(requestId, model, candidate?.providerID, '/v1/responses', errStatus, error, null, startTime);
    if (isStream && !res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const errEvents = responsesAdapter.buildResponsesStreamEvents(buildChatCompletionResponse({ model, content: 'An error occurred.', finishReason: 'stop', usage: {} }), parsed.model);
      for (const evt of errEvents) { res.write('event: ' + evt.event + '\n'); res.write('data: ' + evt.data + '\n\n'); }
      res.end();
    } else if (isStream) {
      try { res.write('\ndata: [DONE]\n\n'); res.end(); } catch (_) {}
    } else if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildErrorResponse(error, requestId).body));
    }
  }
}

async function handleGoogleGenerateContentRoute(req, res) {
  const requestId = req.requestId;
  const startTime = Date.now();
  const modelMatch = req.url.match(/^\/v1beta\/models\/([^:]+):(generateContent|streamGenerateContent)$/);
  if (!modelMatch) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildErrorResponse(new AiproxyError('Invalid model endpoint', 404), requestId).body));
    return;
  }
  const modelName = modelMatch[1];
  const action = modelMatch[2];
  const isStream = action === 'streamGenerateContent';

  const bodyChunks = [];
  try { for await (const chunk of req) { bodyChunks.push(chunk); } } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildErrorResponse(new AiproxyError('Failed to read request body', 400), requestId).body));
    return;
  }
  const body = Buffer.concat(bodyChunks).toString();
  let parsed;
  try { parsed = JSON.parse(body); } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildErrorResponse(new AiproxyError('Invalid JSON body', 400), requestId).body));
    return;
  }

  const modelAliases = configStore.getSection('modelAliases') || {};
  const convertible = googleAdapter.parseGoogleRequest(parsed, modelName, modelAliases);
  const model = convertible.model;
  const injectedMessages = convertible.messages;
  const parts = opencode.convertMessages(injectedMessages).parts;

  if (parts.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(buildErrorResponse(new AiproxyError('No user message found', 400), requestId).body));
    return;
  }

  let candidateInfo;
  try {
    candidateInfo = getResolvedCandidates(model);
    if (!candidateInfo) throw new ModelNotFoundError(model);
  } catch (err) {
    if (err instanceof ModelNotFoundError) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildErrorResponse(err, requestId).body));
      return;
    }
    throw err;
  }

  if (candidateInfo.resolved.isSpecialized && candidateInfo.resolved.specializedConfig) {
    try {
      const sessionId = req.headers['x-session-id'] || req.headers['x-conversation-id'] || null;
      const specializedResult = await injectSpecializedKnowledge(candidateInfo.resolved, injectedMessages, sessionId);
      if (specializedResult) {
        const updated = updateSystemMessage([...injectedMessages], specializedResult.augmentedPrompt);
        injectedMessages.length = 0;
        injectedMessages.push(...updated);
      }
    } catch (e) {
      console.error('[Specialized] Google injection error:', e.message);
    }
  }

  try {
    const candidates = registry.getModelCandidates(model) || [];
    const usable = candidates.filter(c => !isBreakerOpen(c));
    if (usable.length === 0) throw new AiproxyError('No healthy model candidates available', 503, 'server_error', 'model_unavailable', 'Hệ thống gặp sự cố.');

    const candidate = usable[0];

    if (isStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      let response;
      if (candidate.transport === 'openai-compatible') {
        const directConfig = getDirectProviderConfig(candidate.providerID);
        if (!directConfig) throw new AiproxyError('Provider config not found', 502);
        const providerKeys = getProviderKeys(candidate.providerID);
        const keyToUse = providerKeys[0];
        response = await openaiCompatible.chatCompletion({ baseUrl: directConfig.baseURL, apiKey: keyToUse?.value, path: directConfig.path, timeout: directConfig.timeout }, candidate.modelID, injectedMessages, { timeout: 60000 });
      } else {
        const session = await opencode.createSession({ timeoutMs: 60000 });
        response = await opencode.handleSyncResponse(null, session.id, candidate.providerID, candidate.modelID, model, parts, { timeoutMs: 60000 });
        await opencode.deleteSession(session.id, { timeoutMs: 5000 }).catch(() => {});
      }
      const openaiResp = buildChatCompletionResponse({ model, content: response.content, finishReason: response.finishReason || 'stop', usage: response.usage, toolCalls: response.toolCalls });
      const events = googleAdapter.buildGoogleStreamEvents(openaiResp, modelName);
      for (const evt of events) {
        res.write('data: ' + evt.data + '\n\n');
        await new Promise(r => setTimeout(r, 10));
      }
      res.end();
      const tokens = { input: response.usage?.prompt_tokens || 0, output: response.usage?.completion_tokens || 0 };
      recordBreakerSuccess(candidate);
      modelStatus.recordSuccess(model, candidate.providerID, tokens);
      logRouteResult(requestId, model, candidate.providerID, '/v1beta/models/' + modelName, 200, null, tokens, startTime);
    } else {
      let result;
      if (candidate.transport === 'openai-compatible') {
        const directConfig = getDirectProviderConfig(candidate.providerID);
        if (!directConfig) throw new AiproxyError('Provider config not found', 502);
        const providerKeys = getProviderKeys(candidate.providerID);
        const selected = providerKeys.length > 1 ? keyPool.selectKey(providerKeys) : null;
        const keyToUse = selected ? selected.key : providerKeys[0];
        if (selected) keyPool.markKeyActive(keyToUse.id);
        try {
          result = await openaiCompatible.chatCompletion({ baseUrl: directConfig.baseURL, apiKey: keyToUse.value, path: directConfig.path, timeout: directConfig.timeout }, candidate.modelID, injectedMessages, { timeout: 60000 });
          if (selected) keyPool.recordKeySuccess(keyToUse.id, Date.now());
        } catch (err) {
          if (selected) keyPool.recordKeyFailure(keyToUse.id, err.providerErrorType || 'unknown');
          throw err;
        }
      } else {
        result = await opencode.handleSyncResponse(null, null, candidate.providerID, candidate.modelID, model, parts, { timeoutMs: 60000 });
      }
      const openaiResp = buildChatCompletionResponse({ model, content: result.content, finishReason: result.finishReason || 'stop', usage: result.usage, toolCalls: result.toolCalls });
      const googleResp = googleAdapter.buildGoogleResponse(openaiResp, modelName);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(googleResp));
      const tokens = { input: result.usage?.prompt_tokens || 0, output: result.usage?.completion_tokens || 0 };
      recordBreakerSuccess(candidate);
      modelStatus.recordSuccess(model, candidate.providerID, tokens);
      logRouteResult(requestId, model, candidate.providerID, '/v1beta/models/' + modelName, 200, null, tokens, startTime);
    }
  } catch (error) {
    console.error('[' + requestId + '] Google generateContent error:', sanitizeLogValue(error?.message));
    const errStatus = error?.statusCode || 500;
    logRouteResult(requestId, model, candidate?.providerID, '/v1beta/models/' + modelName, errStatus, error, null, startTime);
    if (isStream && !res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const errEvents = googleAdapter.buildGoogleStreamEvents(buildChatCompletionResponse({ model, content: 'An error occurred.', finishReason: 'stop', usage: {} }), modelName);
      for (const evt of errEvents) { res.write('data: ' + evt.data + '\n\n'); }
      res.end();
    } else if (isStream) {
      try { res.write('\ndata: [DONE]\n\n'); res.end(); } catch (_) {}
    } else if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildErrorResponse(error, requestId).body));
    }
  }
}

async function handleRequest(req, res) {
  const requestId = generateRequestId();
  req.requestId = requestId;

  try {
    // Require auth for mutating requests (POST) and for the model catalog
    // (GET /v1/models) so internal model names aren't enumerable without a key.
    const requiresAuth = req.method === 'POST' || (req.method === 'GET' && req.url === '/v1/models');
    if (requiresAuth && !process.env.AIPROXY_TEST_MODE) {
      const authHeader = req.headers['authorization'] || '';

      if (authHeader.startsWith('Bearer ') && apiKeyAuth.isEnabled()) {
        const apiKey = authHeader.slice(7);
        const keyData = await apiKeyAuth.validateKey(apiKey);
        if (!keyData || !keyData.valid) {
          const errResp = buildErrorResponse(new AiproxyError('Invalid API key', 401, 'invalid_request_error', 'unauthorized', 'Invalid API key'), requestId);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errResp.body));
          return;
        }
        req.authKey = keyData;
      } else if (authHeader.startsWith('Basic ')) {
        const token = authHeader.slice(6);
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const colonIdx = decoded.indexOf(':');
        if (colonIdx === -1) {
          const errResp = buildErrorResponse(new AiproxyError('Invalid authorization format', 401, 'invalid_request_error', 'unauthorized', 'Invalid authorization'), requestId);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errResp.body));
          return;
        }
        const username = decoded.slice(0, colonIdx);
        const password = decoded.slice(colonIdx + 1);
        const expectedUser = config.opencode.username;
        const expectedPass = config.opencode.password;
        if (expectedUser && expectedPass && (username !== expectedUser || password !== expectedPass)) {
          const errResp = buildErrorResponse(new AiproxyError('Invalid credentials', 401, 'invalid_request_error', 'unauthorized', 'Invalid credentials'), requestId);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(errResp.body));
          return;
        }
      } else {
        const errResp = buildErrorResponse(new AiproxyError('Authorization required', 401, 'invalid_request_error', 'unauthorized', 'Authorization required'), requestId);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errResp.body));
        return;
      }
    }

    if (req.method === 'GET' && req.url === '/v1/models') {
      return handleModelsRoute(req, res);
    }
    if (req.method === 'GET' && req.url === '/v1/models/status') {
      return handleModelStatusRoute(req, res);
    }
    if (req.method === 'GET' && req.url.startsWith('/v1/catalog/models')) {
      return handleCatalogRoute(req, res);
    }
    if (req.method === 'GET' && req.url === '/v1/specialized/models') {
      return handleSpecializedModelsRoute(req, res);
    }
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/healthz')) {
      return handleHealthRoute(req, res);
    }
    if (req.method === 'GET' && req.url === '/status') {
      return handleStatusRoute(req, res);
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      return handleChatRoute(req, res);
    }
    if (req.method === 'POST' && (req.url === '/v1/messages' || req.url === '/v1/messages?beta=true')) {
      return handleAnthropicMessagesRoute(req, res);
    }
    if (req.method === 'POST' && (req.url === '/v1/responses' || req.url === '/v1/responses/compact')) {
      return handleOpenAIResponsesRoute(req, res);
    }
    if (req.method === 'POST' && req.url.match(/^\/v1beta\/models\/[^:]+:(generateContent|streamGenerateContent)$/)) {
      return handleGoogleGenerateContentRoute(req, res);
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      return handleChatRoute(req, res);
    }

    const errResp = buildErrorResponse(new AiproxyError('Not found', 404, 'invalid_request_error', 'not_found', 'Not found'), requestId);
    res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(errResp.body));
  } catch (err) {
    console.error('[' + requestId + '] Unhandled error:', sanitizeLogValue(err?.stack || err?.message || err));
    const errResp = buildErrorResponse(err, requestId);
    if (!res.headersSent) {
      res.writeHead(errResp.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(errResp.body));
    } else {
      try { res.end(); } catch (_) {}
    }
  }
}

function logRouteResult(requestId, model, provider, path, statusCode, error, tokens, startTime) {
  const latencyMs = Date.now() - (startTime || Date.now());
  requestLogger.recordRequest({
    method: 'POST', path, model, provider: provider || 'unknown', alias: model,
    status: statusCode, latencyMs, error: error ? (error.message || String(error)) : null,
    inputTokens: tokens?.input || null, outputTokens: tokens?.output || null,
  });
  usageTracker.recordUsage({
    model, provider: provider || 'unknown', alias: model,
    inputTokens: tokens?.input || 0, outputTokens: tokens?.output || 0,
    latencyMs, status: statusCode, group: 'chat',
  });
}

function resetBreakerState() {
  breakerState.clear();
  providerLatency._reset();
}

function getBreakerState() {
  const result = [];
  for (const [key, entry] of breakerState) {
    result.push({
      key,
      failures: entry.failures || 0,
      openUntil: entry.openUntil || null,
      reason: entry.reason || null,
      scope: entry.scope || 'candidate',
      expiresIn: entry.openUntil ? entry.openUntil - Date.now() : null,
    });
  }
  return result;
}

function resetBreaker(key) {
  breakerState.delete(key);
}

function resetAllBreakers() {
  breakerState.clear();
}

module.exports = { handleRequest, __resetBreakerState: resetBreakerState, getBreakerState, resetBreaker, resetAllBreakers, getRoutingTraces, clearRoutingTraces };
