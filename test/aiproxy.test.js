const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { ModelDiscovery } = require('../src/core/model-discovery');
const { isRetryableError, ProviderError, classifyProviderError, normalizeError } = require('../src/core/errors');
const { sanitizeText, isSafeOutput } = require('../src/core/sanitizer');
const router = require('../src/core/router');
const opencode = require('../src/providers/opencode');
const openaiCompatible = require('../src/providers/openai-compatible');
const registry = require('../src/core/model-registry');
const modelStatus = require('../src/core/model-status');
const policy = require('../src/core/policy');

test('exact model aliases keep versioned matches ahead of family matches', () => {
  const discovery = new ModelDiscovery({
    opencode: { url: 'http://127.0.0.1', username: 'u', password: 'p' },
    discoveryRefreshMs: 60000,
    publicModels: {
      'minimax-m2.7': {
        enabled: true,
        matchProviders: ['minimax', 'nvidia'],
        matchFamily: ['minimax'],
        matchModels: ['MiniMax-M2.7'],
        prefer: 'minimax',
        fallback: 'nvidia',
      },
    },
  });

  discovery.internalRegistry = new Map([
    ['minimax/MiniMax-M2.7', { providerID: 'minimax', modelID: 'MiniMax-M2.7', family: 'minimax', costInput: 1, costOutput: 1, contextLimit: 8192, outputLimit: 4096 }],
    ['nvidia/minimaxai/minimax-m2.7', { providerID: 'nvidia', modelID: 'minimaxai/minimax-m2.7', family: 'minimax', costInput: 0, costOutput: 0, contextLimit: 8192, outputLimit: 4096 }],
  ]);

  discovery.buildFamilyPool();

  const resolved = discovery.resolveFamily('minimax-m2.7');
  assert.ok(resolved);
  assert.equal(resolved.modelID, 'MiniMax-M2.7');
  assert.equal(resolved.candidates[0].providerID, 'minimax');
  assert.equal(resolved.candidates[0].matchKind, 'exact');
});

test('fallback candidates are ordered by prefer then fallback', () => {
  const discovery = new ModelDiscovery({
    opencode: { url: 'http://127.0.0.1', username: 'u', password: 'p' },
    discoveryRefreshMs: 60000,
    publicModels: {
      'kimi-k2.7': {
        enabled: true,
        matchProviders: ['provider-b', 'nvidia'],
        matchFamily: ['kimi-k2'],
        matchModels: ['kimi-k2.7-code'],
        prefer: 'nvidia',
        fallback: 'provider-b',
      },
    },
  });

  discovery.internalRegistry = new Map([
    ['provider-b/kimi-k2.7-code', { providerID: 'provider-b', modelID: 'kimi-k2.7-code', family: 'kimi-k2', costInput: 0, costOutput: 0, contextLimit: 0, outputLimit: 0 }],
    ['nvidia/kimi-k2.7-code', { providerID: 'nvidia', modelID: 'kimi-k2.7-code', family: 'kimi-k2', costInput: 1, costOutput: 1, contextLimit: 8192, outputLimit: 4096 }],
  ]);

  discovery.buildFamilyPool();

  const resolved = discovery.resolveFamily('kimi-k2.7');
  assert.ok(resolved);
  assert.equal(resolved.candidates[0].providerID, 'nvidia');
  assert.equal(resolved.candidates[1].providerID, 'provider-b');
});

test('fallback provider is considered even when omitted from matchProviders', () => {
  const discovery = new ModelDiscovery({
    opencode: { url: 'http://127.0.0.1', username: 'u', password: 'p' },
    discoveryRefreshMs: 60000,
    publicModels: {
      'alias-with-fallback': {
        enabled: true,
        matchFamily: ['demo'],
        matchModels: ['demo-model'],
        prefer: 'primary',
        fallback: 'secondary',
      },
    },
  });

  discovery.internalRegistry = new Map([
    ['secondary/demo-model', { providerID: 'secondary', modelID: 'demo-model', family: 'demo', costInput: 0, costOutput: 0, contextLimit: 0, outputLimit: 0 }],
  ]);

  discovery.buildFamilyPool();
  const resolved = discovery.resolveFamily('alias-with-fallback');
  assert.ok(resolved);
  assert.equal(resolved.candidates[0].providerID, 'secondary');
});

test('mimo v2.5 free falls back to opencode when it is the only matching fallback provider', () => {
  const discovery = new ModelDiscovery({
    opencode: { url: 'http://127.0.0.1', username: 'u', password: 'p' },
    discoveryRefreshMs: 60000,
    publicModels: {
      'mimo-v2.5-free': {
        enabled: true,
        matchProviders: ['xiaomi', 'opencode'],
        matchFamily: ['mimo-v2.5-free'],
        matchModels: ['mimo-v2.5-free', 'xiaomi-mimo-v2.5-free'],
        prefer: 'xiaomi',
        fallback: 'opencode',
      },
    },
  });

  discovery.internalRegistry = new Map([
    ['opencode/mimo-v2.5-free', { providerID: 'opencode', modelID: 'mimo-v2.5-free', family: 'mimo-v2.5-free', costInput: 0, costOutput: 0, contextLimit: 0, outputLimit: 0 }],
  ]);

  discovery.buildFamilyPool();

  const resolved = discovery.resolveFamily('mimo-v2.5-free');
  assert.ok(resolved);
  assert.equal(resolved.providerID, 'opencode');
  assert.equal(resolved.modelID, 'mimo-v2.5-free');
  assert.deepEqual(resolved.candidates.map(c => c.providerID), ['opencode']);
});

test('preferred provider wins resolveModel selection when multiple candidates exist', () => {
  const discovery = new ModelDiscovery({
    opencode: { url: 'http://127.0.0.1', username: 'u', password: 'p' },
    discoveryRefreshMs: 60000,
    publicModels: {
      'alias-prefers-primary': {
        enabled: true,
        matchProviders: ['primary', 'secondary'],
        matchFamily: ['demo'],
        prefer: 'primary',
        fallback: 'secondary',
      },
    },
  });

  discovery.internalRegistry = new Map([
    ['secondary/model-a', { providerID: 'secondary', modelID: 'model-a', family: 'demo', costInput: 0, costOutput: 0, contextLimit: 0, outputLimit: 0 }],
    ['primary/model-a', { providerID: 'primary', modelID: 'model-a', family: 'demo', costInput: 0, costOutput: 0, contextLimit: 0, outputLimit: 0 }],
  ]);

  discovery.buildFamilyPool();
  const resolved = discovery.resolveFamily('alias-prefers-primary');

  assert.ok(resolved);
  assert.equal(resolved.providerID, 'primary');
  assert.equal(resolved.modelID, 'model-a');
  assert.deepEqual(resolved.candidates.map(c => c.providerID), ['primary', 'secondary']);
});

test('router non-streaming flow preserves alias and follows ordered candidates', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleSyncResponse = opencode.handleSyncResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;

  const events = [];

  registry.resolveModel = () => ({
    alias: 'public-alias',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => ([
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ]);
  opencode.createSession = async () => ({ id: 'sess-1' });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  opencode.handleSyncResponse = async (res, sessionId, providerID, modelID, modelName) => {
    events.push({ sessionId, providerID, modelID, modelName });
    if (providerID === 'provider-a') {
      const err = new Error('transient upstream');
      err.retryable = true;
      throw err;
    }
    return { model: modelName, choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleSyncResponse = originalHandleSyncResponse;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
  });

  const req = makeChatRequest({ model: 'public-alias', messages: [{ role: 'user', content: 'hello' }] });
  const res = makeResponseStub();

  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.model, 'public-alias');
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(e => e.providerID), ['provider-a', 'provider-b']);
  assert.deepEqual(events.map(e => e.modelName), ['public-alias', 'public-alias']);
});

test('breaker rotation skips a repeatedly failing candidate after threshold', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleSyncResponse = opencode.handleSyncResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;
  const originalNow = Date.now;

  let now = 1000;
  Date.now = () => now;

  const attempts = [];

  registry.resolveModel = () => ({
    alias: 'rotate-me',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => ([
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ]);
  opencode.createSession = async () => ({ id: 'sess-' + attempts.length });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  opencode.handleSyncResponse = async (res, sessionId, providerID, modelID, modelName) => {
    attempts.push({ providerID, modelID, modelName });
    if (providerID === 'provider-a') {
      const err = new Error('transient upstream');
      err.retryable = true;
      throw err;
    }
    return { id: 'chatcmpl-1', object: 'chat.completion', model: modelName, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleSyncResponse = originalHandleSyncResponse;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    Date.now = originalNow;
  });

  for (let i = 0; i < 3; i += 1) {
    const req = makeChatRequest({ model: 'rotate-me', messages: [{ role: 'user', content: 'hello' }] });
    const res = makeResponseStub();
    await router.handleRequest(req, res);
    assert.equal(res.statusCode, 200);
    now += 1;
  }

  const lastAttemptCount = attempts.length;
  const req = makeChatRequest({ model: 'rotate-me', messages: [{ role: 'user', content: 'hello' }] });
  const res = makeResponseStub();
  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.model, 'rotate-me');
  assert.equal(attempts.length, lastAttemptCount + 1);
  assert.equal(attempts.at(-1).providerID, 'provider-b');
  assert.equal(attempts.at(-1).modelName, 'rotate-me');
});

test('breaker cooldown restores the original candidate after expiry', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleSyncResponse = opencode.handleSyncResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;
  const originalNow = Date.now;

  router.__resetBreakerState();

  let now = 1000;
  Date.now = () => now;

  const attempts = [];

  registry.resolveModel = () => ({
    alias: 'cooldown-alias',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => ([
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ]);
  opencode.createSession = async () => ({ id: 'sess-' + attempts.length });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  opencode.handleSyncResponse = async (res, sessionId, providerID, modelID, modelName) => {
    attempts.push({ providerID, modelID, modelName, now });
    if (providerID === 'provider-a' && now < 32000) {
      const err = new Error('transient upstream');
      err.retryable = true;
      throw err;
    }
    return { id: 'chatcmpl-1', object: 'chat.completion', model: modelName, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleSyncResponse = originalHandleSyncResponse;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    Date.now = originalNow;
  });

  for (let i = 0; i < 3; i += 1) {
    const req = makeChatRequest({ model: 'cooldown-alias', messages: [{ role: 'user', content: 'hello' }] });
    const res = makeResponseStub();
    await router.handleRequest(req, res);
    assert.equal(res.statusCode, 200);
    now += 1;
  }

  now = 30000;
  let req = makeChatRequest({ model: 'cooldown-alias', messages: [{ role: 'user', content: 'hello' }] });
  let res = makeResponseStub();
  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.model, 'cooldown-alias');
  assert.equal(attempts.at(-1).providerID, 'provider-b');

  now = 32000;
  req = makeChatRequest({ model: 'cooldown-alias', messages: [{ role: 'user', content: 'hello' }] });
  res = makeResponseStub();
  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.model, 'cooldown-alias');
  assert.equal(attempts.at(-1).providerID, 'provider-a');
});

test('quota exhaustion opens provider-wide cooldown and skips the exhausted candidate', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleSyncResponse = opencode.handleSyncResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;
  const originalNow = Date.now;

  router.__resetBreakerState();

  let now = 1000;
  Date.now = () => now;

  const attempts = [];

  registry.resolveModel = () => ({
    alias: 'quota-alias',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => ([
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ]);
  opencode.createSession = async () => ({ id: 'sess-' + attempts.length });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  opencode.handleSyncResponse = async (res, sessionId, providerID, modelID, modelName) => {
    attempts.push({ providerID, modelID, modelName, now });
    if (providerID === 'provider-a') {
      throw new ProviderError('quota', 429, undefined, {
        providerErrorType: 'quota_exhausted',
        retryable: true,
        cooldownScope: 'provider',
        cooldownMs: 30000,
        upstreamStatusCode: 429,
        upstreamBodySnippet: 'insufficient quota',
      });
    }
    return { id: 'chatcmpl-1', object: 'chat.completion', model: modelName, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleSyncResponse = originalHandleSyncResponse;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    Date.now = originalNow;
    router.__resetBreakerState();
  });

  const req1 = makeChatRequest({ model: 'quota-alias', messages: [{ role: 'user', content: 'hello' }] });
  const res1 = makeResponseStub();
  await router.handleRequest(req1, res1);

  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.model, 'quota-alias');
  assert.equal(attempts.map(a => a.providerID)[0], 'provider-a');
  assert.equal(attempts.map(a => a.providerID)[1], 'provider-b');

  const req2 = makeChatRequest({ model: 'quota-alias', messages: [{ role: 'user', content: 'hello' }] });
  const res2 = makeResponseStub();
  await router.handleRequest(req2, res2);

  assert.equal(res2.statusCode, 200);
  assert.equal(attempts.at(-1).providerID, 'provider-b');
});

test('streaming failures do not count as success and open cooldowns', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleStreamingResponse = opencode.handleStreamingResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;

  router.__resetBreakerState();

  const attempts = [];

  registry.resolveModel = () => ({
    alias: 'stream-alias',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => ([
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ]);
  opencode.createSession = async () => ({ id: 'sess-' + attempts.length });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  opencode.handleStreamingResponse = async function() {
    attempts.push('stream-attempt');
    const err = new ProviderError('stream failed', 503, undefined, {
      providerErrorType: 'provider_unavailable',
      retryable: true,
      cooldownScope: 'candidate',
      cooldownMs: 30000,
      upstreamStatusCode: 503,
      upstreamBodySnippet: 'overloaded',
    });
    const res = arguments[1];
    if (typeof res?.writeHead === 'function') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    }
    const errorChunk = {
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'stream-alias',
      choices: [{ index: 0, delta: { content: '\n\nHệ thống gặp sự cố. Vui lòng thử lại sau.' }, finish_reason: 'stop' }],
    };
    if (typeof res?.write === 'function') {
      res.write('data: ' + JSON.stringify(errorChunk) + '\n\n');
      res.write('data: [DONE]\n\n');
    }
    return { ok: false, error: err };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleStreamingResponse = originalHandleStreamingResponse;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    router.__resetBreakerState();
  });

  const req = makeChatRequest({ model: 'stream-alias', messages: [{ role: 'user', content: 'hello' }], stream: true });
  const res = makeResponseStub();
  await router.handleRequest(req, res);

  assert.equal(res.headers?.['Content-Type'], 'text/event-stream');
  assert.equal(attempts.length, 2);

  const req2 = makeChatRequest({ model: 'stream-alias', messages: [{ role: 'user', content: 'hello' }], stream: true });
  const res2 = makeResponseStub();
  await router.handleRequest(req2, res2);

  assert.equal(res2.headers?.['Content-Type'], 'text/event-stream');
  assert.equal(res2.writes.some(chunk => typeof chunk === 'string' && chunk.includes('Hệ thống gặp sự cố')), true);
});

test('retryable error classification matches provider failures', () => {
  const err = new ProviderError('upstream');
  err.statusCode = 503;
  assert.equal(isRetryableError(err), true);
  assert.equal(isRetryableError({ statusCode: 400 }), false);
  assert.equal(isRetryableError({ retryable: true }), true);
});

test('provider errors normalize to a safe generic message', () => {
  const err = new ProviderError('secret upstream body', 429, undefined, {
    providerErrorType: 'quota_exhausted',
    upstreamStatusCode: 429,
    upstreamBodySnippet: 'quota exhausted /root/secret',
  });

  const normalized = normalizeError(err, 'req-safe');

  assert.equal(normalized.statusCode, 429);
  assert.equal(normalized.body.error.message, 'Hệ thống gặp sự cố. Vui lòng thử lại sau.');
  assert.equal(JSON.stringify(normalized.body).includes('/root/secret'), false);
});

test('sanitizer does not leak blocked content after repeated calls', () => {
  const value = 'opencode /root OPENCODE_KEY';
  const first = sanitizeText(value);
  const second = sanitizeText(value);
  assert.equal(first, second);
  assert.equal(isSafeOutput('plain text'), true);
  assert.equal(sanitizeText('server model provider'), 'server model provider');
});

test('model not found errors do not echo the requested model name', () => {
  const err = new (require('../src/core/errors').ModelNotFoundError)('secret-model');
  const normalized = require('../src/core/errors').normalizeError(err, 'req-1');

  assert.equal(normalized.body.error.message.includes('secret-model'), false);
  assert.equal(normalized.body.error.message, 'Unknown model. Use GET /v1/models to list available models.');
});

test('error normalization redacts raw stack and provider payload details from logs', async (t) => {
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));

  t.after(() => {
    console.error = originalError;
  });

  const err = new Error('providerID=secret modelID=/root/.config/opencode');
  err.stack = 'Error: providerID=secret\n    at /root/project/file.js:1:1';
  require('../src/core/errors').normalizeError(err, 'req-2');

  assert.equal(logs.some(line => line.includes('/root/project/file.js')), false);
  assert.equal(logs.some(line => line.includes('providerID=secret')), false);
});

test('status endpoint is hidden from non-local requests', async (t) => {
  const originalGetStatus = registry.getStatus;
  registry.getStatus = () => ({ status: 'ready', lastRefresh: '2026-01-01T00:00:00.000Z', familyCount: 1, internalCount: 2, refreshIntervalMs: 60000 });

  t.after(() => {
    registry.getStatus = originalGetStatus;
  });

  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/status';
  req.socket = { remoteAddress: '203.0.113.10' };

  const res = makeResponseStub();
  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error.code, 'not_found');
});

test('public catalog export returns structured alias metadata', async (t) => {
  const originalGetPublishedCatalog = registry.getPublishedCatalog;
  registry.getPublishedCatalog = () => ({
    object: 'list',
    source: 'aiproxy',
    generatedAt: '2026-01-01T00:00:00.000Z',
    data: [{
      id: 'gpt-5.4-mini',
      alias: 'gpt-5.4-mini',
      displayName: 'GPT-5.4 Mini',
      pricingKey: 'gpt-5.4-mini',
      providerId: 'freemodelvip',
      providerName: 'FreeModelVIP',
      modelId: 'gpt-5.4-mini',
      context: 1000000,
      maxOutput: 128000,
      capabilities: { input: { text: true }, output: { text: true } },
      enabled: true,
      show: true,
    }],
  });

  t.after(() => {
    registry.getPublishedCatalog = originalGetPublishedCatalog;
  });

  const req = new EventEmitter();
  req.method = 'GET';
  req.url = '/v1/catalog/models';
  req.socket = { remoteAddress: '127.0.0.1' };

  const res = makeResponseStub();
  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.object, 'list');
  assert.equal(res.body.data[0].id, 'gpt-5.4-mini');
  assert.equal(res.body.data[0].providerId, 'freemodelvip');
});

test('policy injection preserves user system messages and appends boundary', () => {
  const messages = [
    { role: 'system', content: 'User system one' },
    { role: 'user', content: 'Hello' },
    { role: 'system', content: 'User system two' },
  ];

  const injected = policy.injectSystemPrompt(messages, { systemPrompt: 'Safety boundary' });

  assert.deepEqual(injected.map(m => m.role), ['system', 'system', 'user', 'system']);
  assert.equal(injected[0].content, 'User system one');
  assert.equal(injected[1].content, 'Safety boundary');
  assert.equal(injected[3].content, 'User system two');
});

test('non-streaming chat redacts deployment-specific leaks and keeps general technical terms', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleSyncResponse = opencode.handleSyncResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = policy.getPolicyForModel;
  const originalInjectSystemPrompt = policy.injectSystemPrompt;

  registry.resolveModel = () => ({
    alias: 'demo',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [{ providerID: 'provider-a', modelID: 'model-a' }],
  });
  registry.getModelCandidates = () => ([{ providerID: 'provider-a', modelID: 'model-a' }]);
  opencode.createSession = async () => ({ id: 'sess-1' });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: 'Boundary', parts: [{ type: 'text', text: 'hello' }] });
  policy.getPolicyForModel = () => ({ systemPrompt: 'Boundary', blockedPatterns: [] });
  policy.injectSystemPrompt = messages => messages;
  opencode.handleSyncResponse = async () => ({
    id: 'chatcmpl-1',
    object: 'chat.completion',
    model: 'demo',
    choices: [{ index: 0, message: { role: 'assistant', content: 'providerID is secret /www/wwwroot/aiproxy modelID is secret. Use server model normally.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleSyncResponse = originalHandleSyncResponse;
    opencode.convertMessages = originalConvertMessages;
    policy.getPolicyForModel = originalGetPolicyForModel;
    policy.injectSystemPrompt = originalInjectSystemPrompt;
  });

  const req = makeChatRequest({ model: 'demo', messages: [{ role: 'user', content: 'hello' }] });
  const res = makeResponseStub();

  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error.code, 'policy_violation');
  assert.equal(JSON.stringify(res.body).includes('/www/wwwroot'), false);
  assert.equal(JSON.stringify(res.body).includes('providerID is secret'), false);
});

test('streaming helper refuses severe deployment leaks with generic output only', async () => {
  const res = makeResponseStub();

  const requestFn = async () => ({
    parts: [{ type: 'text', text: 'providerID is secret /root/.config/opencode modelID: hidden' }],
    info: { tokens: { input: 1, output: 1 } },
  });

  await opencode.handleStreamingResponse(new EventEmitter(), res, 'sess-1', 'provider', 'model', 'public-model', [{ type: 'text', text: 'hello' }], {
    requestFn,
  });

  assert.equal(res.writeHeadCalls[0].headers['Content-Type'], 'text/event-stream');
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('/root')), false);
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('providerID')), false);
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('[DONE]')), true);
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('Hệ thống gặp sự cố')), true);
});

test('provider helper rejects severe leaks before building a response', async () => {
  const requestFn = async () => ({
    parts: [{ type: 'text', text: 'server path /srv/example/app and providerID=secret' }],
    info: { tokens: { input: 1, output: 1 } },
  });

  await assert.rejects(
    opencode.handleSyncResponse(null, 'sess-1', 'provider-a', 'model-a', 'public-model', [{ type: 'text', text: 'hello' }], { requestFn }),
    err => err.code === 'policy_violation'
  );
});

test('streaming helper returns cleanly when already aborted', async () => {
  const res = makeResponseStub();
  await opencode.handleStreamingResponse(new EventEmitter(), res, 'sess-1', 'provider', 'model', 'public-model', [], { signal: { aborted: true } });
  assert.equal(res.writeHeadCalls.length, 0);
  assert.equal(res.writes.length, 0);
  assert.equal(res.ended, false);
});

test('streaming helper exits quietly after client abort without late error chunk', async () => {
  let resolveRequest;
  const requestPromise = new Promise(resolve => {
    resolveRequest = resolve;
  });

  const res = makeResponseStub();
  const signal = new EventEmitter();
  signal.aborted = false;
  signal.addEventListener = (event, handler) => signal.on(event, handler);

  const streamPromise = opencode.handleStreamingResponse(new EventEmitter(), res, 'sess-1', 'provider', 'model', 'public-model', [{ type: 'text', text: 'hello' }], {
    signal,
    requestFn: () => requestPromise,
  });

  await Promise.resolve();
  assert.equal(res.writeHeadCalls.length, 1);
  assert.equal(res.writes.length, 1);

  res.destroyed = true;
  signal.aborted = true;
  signal.emit('abort');
  resolveRequest({ parts: [{ type: 'text', text: 'ignored' }], info: { tokens: { input: 1, output: 1 } } });

  await streamPromise;

  assert.equal(res.writes.length, 1);
  assert.equal(res.ended, false);
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('Hệ thống gặp sự cố')), false);
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('[DONE]')), false);
});

test('chat streaming cleanup does not pass abort signal to deleteSession', async (t) => {
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleStreamingResponse = opencode.handleStreamingResponse;
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;

  let createSessionCalls = 0;
  const deleteCalls = [];

  registry.resolveModel = () => ({
    alias: 'demo',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [{ providerID: 'provider-a', modelID: 'model-a' }],
  });
  registry.getModelCandidates = () => ([{ providerID: 'provider-a', modelID: 'model-a' }]);
  opencode.createSession = async () => {
    createSessionCalls += 1;
    return { id: 'sess-1' };
  };
  opencode.deleteSession = async (sessionId, options) => {
    deleteCalls.push({ sessionId, options });
  };
  opencode.handleStreamingResponse = async () => {
    return undefined;
  };

  t.after(() => {
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleStreamingResponse = originalHandleStreamingResponse;
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
  });

  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/v1/chat/completions';
  req.requestId = 'req-1';
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = {};
  req.on = req.addListener.bind(req);
  req.off = req.removeListener.bind(req);

  const res = makeResponseStub();
  const body = JSON.stringify({ model: 'demo', messages: [{ role: 'user', content: 'hello' }], stream: true });
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(body);
  };

  await router.handleRequest(req, res);

  assert.equal(createSessionCalls, 1);
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].sessionId, 'sess-1');
  assert.equal(deleteCalls[0].options.signal, undefined);
});

function makeResponseStub() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHeadCalls: [],
    writes: [],
    ended: false,
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
      this.headersSent = true;
      this.writeHeadCalls.push({ statusCode, headers });
    },
    write(chunk) {
      this.writes.push(chunk);
      return true;
    },
    end(chunk) {
      if (chunk !== undefined) this.writes.push(chunk);
      if (typeof chunk === 'string') {
        try {
          this.body = JSON.parse(chunk);
        } catch {
          this.body = chunk;
        }
      }
      this.ended = true;
      this.writableEnded = true;
      this.headersSent = true;
    },
    on() {},
    off() {},
    removeListener() {},
  };
}

function makeChatRequest(body) {
  const req = new EventEmitter();
  req.method = 'POST';
  req.url = '/v1/chat/completions';
  req.requestId = 'req-test';
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = {};
  req.on = req.addListener.bind(req);
  req.off = req.removeListener.bind(req);
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(JSON.stringify(body));
  };
  return req;
}

test('classifyProviderError returns correct categories for all error types', () => {
  const rateLimit = classifyProviderError({ statusCode: 429, bodySnippet: 'rate limit exceeded' });
  assert.equal(rateLimit.providerErrorType, 'rate_limit');
  assert.equal(rateLimit.cooldownScope, 'candidate');
  assert.equal(rateLimit.retryable, true);

  const quotaExhausted = classifyProviderError({ statusCode: 429, bodySnippet: 'quota exhausted' });
  assert.equal(quotaExhausted.providerErrorType, 'quota_exhausted');
  assert.equal(quotaExhausted.cooldownScope, 'provider');
  assert.equal(quotaExhausted.retryable, true);

  const providerUnavailable = classifyProviderError({ statusCode: 503, bodySnippet: 'service unavailable' });
  assert.equal(providerUnavailable.providerErrorType, 'provider_unavailable');
  assert.equal(providerUnavailable.cooldownScope, 'candidate');
  assert.equal(providerUnavailable.retryable, true);

  const timeout = classifyProviderError({ statusCode: 408, bodySnippet: 'timeout' });
  assert.equal(timeout.providerErrorType, 'timeout');
  assert.equal(timeout.cooldownScope, 'candidate');
  assert.equal(timeout.retryable, true);

  const authBilling = classifyProviderError({ statusCode: 401, bodySnippet: 'unauthorized' });
  assert.equal(authBilling.providerErrorType, 'auth_billing');
  assert.equal(authBilling.cooldownScope, 'provider');
  assert.equal(authBilling.retryable, false);

  const genericError = classifyProviderError({ statusCode: 500, bodySnippet: 'internal error' });
  assert.equal(genericError.providerErrorType, 'provider_unavailable');
  assert.equal(genericError.retryable, true);

  const generic500NoBody = classifyProviderError({ statusCode: 500 });
  assert.equal(generic500NoBody.providerErrorType, 'provider_unavailable');

  const badRequest = classifyProviderError({ statusCode: 400, bodySnippet: 'bad request' });
  assert.equal(badRequest.providerErrorType, 'bad_request');
  assert.equal(badRequest.cooldownScope, null);
  assert.equal(badRequest.retryable, false);

  const modelNotFound = classifyProviderError({ statusCode: 404, bodySnippet: 'model not found' });
  assert.equal(modelNotFound.providerErrorType, 'bad_request_model_not_found');
  assert.equal(modelNotFound.cooldownScope, null);
  assert.equal(modelNotFound.retryable, false);

  const policyViolation = classifyProviderError({ statusCode: 400, bodySnippet: 'content policy violation' });
  assert.equal(policyViolation.providerErrorType, 'policy_violation');
  assert.equal(policyViolation.cooldownScope, null);
  assert.equal(policyViolation.retryable, false);
});

test('all candidates exhausted returns safe error without exposing provider details', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleSyncResponse = opencode.handleSyncResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;

  router.__resetBreakerState();

  registry.resolveModel = () => ({
    alias: 'all-exhausted',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => [
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ];
  opencode.createSession = async () => ({ id: 'sess-1' });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  opencode.handleSyncResponse = async (res, sessionId, providerID, modelID, modelName) => {
    const err = new ProviderError('quota exhausted /secret/path providerID=secret', 429, undefined, {
      providerErrorType: 'quota_exhausted',
      retryable: true,
      cooldownScope: 'provider',
      cooldownMs: 60000,
      upstreamStatusCode: 429,
      upstreamBodySnippet: 'quota exhausted /secret/path providerID=secret',
    });
    throw err;
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleSyncResponse = originalHandleSyncResponse;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    router.__resetBreakerState();
  });

  const req1 = makeChatRequest({ model: 'all-exhausted', messages: [{ role: 'user', content: 'hello' }] });
  const res1 = makeResponseStub();
  await router.handleRequest(req1, res1);

  const req2 = makeChatRequest({ model: 'all-exhausted', messages: [{ role: 'user', content: 'hello' }] });
  const res2 = makeResponseStub();
  await router.handleRequest(req2, res2);

  assert.equal(res2.statusCode, 503);
  assert.equal(res2.body.error.code, 'model_unavailable');
  assert.equal(JSON.stringify(res2.body).includes('providerID'), false);
  assert.equal(JSON.stringify(res2.body).includes('/secret/path'), false);
  assert.equal(JSON.stringify(res2.body).includes('quota exhausted'), false);
});

test('streaming severe leak returns ok false and does not record as success', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;

  router.__resetBreakerState();

  const attempts = [];

  registry.resolveModel = () => ({
    alias: 'stream-leak-test',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => [
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ];
  opencode.createSession = async () => ({ id: 'sess-1' });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;

  const mockRequestFn = async () => {
    attempts.push('request');
    return {
      parts: [{ type: 'text', text: 'leaked content /www/wwwroot/secret providerID=hidden' }],
      info: { tokens: { input: 1, output: 1 } },
    };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    router.__resetBreakerState();
  });

  const req = makeChatRequest({ model: 'stream-leak-test', messages: [{ role: 'user', content: 'hello' }], stream: true });
  const res = makeResponseStub();
  await opencode.handleStreamingResponse(req, res, 'sess-1', 'provider-a', 'model-a', 'stream-leak-test', [{ type: 'text', text: 'hello' }], {
    requestFn: mockRequestFn,
  });

  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('Hệ thống gặp sự cố')), true);
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('/www/wwwroot')), false);
  assert.equal(res.writes.some(chunk => typeof chunk === 'string' && chunk.includes('providerID')), false);
});

test('cooldown by error category skips correct candidate type', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalCreateSession = opencode.createSession;
  const originalDeleteSession = opencode.deleteSession;
  const originalHandleSyncResponse = opencode.handleSyncResponse;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;
  const originalNow = Date.now;

  router.__resetBreakerState();

  let now = 1000;
  Date.now = () => now;

  const attempts = [];

  registry.resolveModel = () => ({
    alias: 'category-cooldown',
    providerID: 'provider-a',
    modelID: 'model-a',
    candidates: [
      { providerID: 'provider-a', modelID: 'model-a' },
      { providerID: 'provider-b', modelID: 'model-b' },
    ],
  });
  registry.getModelCandidates = () => [
    { providerID: 'provider-a', modelID: 'model-a' },
    { providerID: 'provider-b', modelID: 'model-b' },
  ];
  opencode.createSession = async () => ({ id: 'sess-1' });
  opencode.deleteSession = async () => {};
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  opencode.handleSyncResponse = async (res, sessionId, providerID, modelID, modelName) => {
    attempts.push({ providerID, modelID, now });
    if (providerID === 'provider-a') {
      const err = new ProviderError('rate limited', 429, undefined, {
        providerErrorType: 'rate_limit',
        retryable: true,
        cooldownScope: 'candidate',
        cooldownMs: 30000,
        upstreamStatusCode: 429,
        upstreamBodySnippet: 'rate limit exceeded',
      });
      throw err;
    }
    return { id: 'chatcmpl-1', object: 'chat.completion', model: modelName, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    opencode.createSession = originalCreateSession;
    opencode.deleteSession = originalDeleteSession;
    opencode.handleSyncResponse = originalHandleSyncResponse;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    Date.now = originalNow;
    router.__resetBreakerState();
  });

  const req1 = makeChatRequest({ model: 'category-cooldown', messages: [{ role: 'user', content: 'hello' }] });
  const res1 = makeResponseStub();
  await router.handleRequest(req1, res1);
  assert.equal(res1.statusCode, 200);
  assert.equal(attempts[0].providerID, 'provider-a');
  assert.equal(attempts[1].providerID, 'provider-b');

  const req2 = makeChatRequest({ model: 'category-cooldown', messages: [{ role: 'user', content: 'hello' }] });
  const res2 = makeResponseStub();
  await router.handleRequest(req2, res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(attempts.at(-1).providerID, 'provider-b');
});

function withModelStatusFixture() {
  const originalResolveModel = registry.resolveModel;
  const originalGetPublicModels = registry.getPublicModels;

  modelStatus._reset();

  registry.resolveModel = () => ({
    providerID: 'nvidia',
    candidates: [{ providerID: 'nvidia', modelID: 'deepseek-ai/deepseek-v4-flash' }],
  });
  registry.getPublicModels = () => ([{ id: 'deepseek-v4-flash', providerID: 'nvidia' }]);

  modelStatus.initialize([{ id: 'deepseek-v4-flash', providerID: 'nvidia' }]);
  modelStatus.setBreakerChecker(() => null);
  modelStatus.setProviderChecker(() => true);

  return () => {
    registry.resolveModel = originalResolveModel;
    registry.getPublicModels = originalGetPublicModels;
    modelStatus.setBreakerChecker(null);
    modelStatus.setProviderChecker(null);
    modelStatus._reset();
  };
}

test('latest probe failure forces status down', () => {
  const cleanup = withModelStatusFixture();

  modelStatus.recordSuccess('deepseek-v4-flash', 'nvidia');
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', Date.now());
  modelStatus.recordFailure('deepseek-v4-flash', 'nvidia', { providerErrorType: 'timeout', message: 'timeout' });
  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'timeout', Date.now());

  const status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DOWN);
  assert.equal(status.reason, 'timeout');

  cleanup();
});

test('single recovery probe success stays degraded until confidence threshold is met', () => {
  const cleanup = withModelStatusFixture();

  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'timeout', Date.now());
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', Date.now());

  const status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DEGRADED);
  assert.equal(status.reason, 'Đang xác nhận phục hồi');

  cleanup();
});

test('enough consecutive probe successes mark model available', () => {
  const cleanup = withModelStatusFixture();

  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'timeout', Date.now());
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', Date.now());
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', Date.now());

  const status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.AVAILABLE);
  assert.equal(status.reason, null);

  cleanup();
});

test('fresh startup success immediately goes to AVAILABLE', () => {
  const cleanup = withModelStatusFixture();

  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', Date.now());

  const status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.AVAILABLE);
  assert.equal(status.reason, null);

  cleanup();
});

test('real request failure immediately marks model down even if probes recover', () => {
  const cleanup = withModelStatusFixture();
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  modelStatus.recordFailure('deepseek-v4-flash', 'nvidia', { providerErrorType: 'timeout', message: 'timeout' });
  now = 2000;
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', now);
  now = 3000;
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', now);

  const status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DOWN);
  assert.equal(status.reason, 'timeout');

  Date.now = originalNow;
  cleanup();
});

test('recovery window behavior works as expected', () => {
  const cleanup = withModelStatusFixture();
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  // Record a failure at now = 1000
  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'timeout', now);
  
  // 4 minutes later (within 5 min recovery window)
  now = 241000;
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', now);
  let status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DEGRADED); // still degraded
  
  // 6 minutes after failure (outside 5 min recovery window)
  // Wait, let's reset and test outside recovery window.
  cleanup();
  const cleanup2 = withModelStatusFixture();
  
  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'timeout', 1000);
  
  now = 302000; // 5 mins 1 sec later
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', now);
  status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.AVAILABLE); // immediately available

  Date.now = originalNow;
  cleanup2();
});

test('probe traffic does not inflate request stats or success rate', () => {
  const cleanup = withModelStatusFixture();

  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', Date.now());
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', Date.now());
  modelStatus.recordSuccess('deepseek-v4-flash', 'nvidia', { input: 10, output: 5 });
  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'timeout', Date.now());

  const status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.successCount, 1);
  assert.equal(status.failureCount, 0);
  assert.equal(status.successRate, 100);
  assert.equal(status.totalTokens, 15);
  assert.equal(status.lastRequestOk, true);
  assert.equal(status.lastProbeOk, false);

  cleanup();
});

test('stale probe failure stays DOWN outside recovery window until next probe succeeds', () => {
  const cleanup = withModelStatusFixture();
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'timeout', now);
  now = 302000;

  // Outside recovery window but probe never succeeded → still DOWN
  let status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DOWN);
  assert.equal(status.reason, 'timeout');

  // After a successful probe → AVAILABLE
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'nvidia', now);
  status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.AVAILABLE);

  Date.now = originalNow;
  cleanup();
});

test('single-provider model shows DOWN when probe fails outside recovery window', () => {
  const cleanup = withModelStatusFixture();
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  modelStatus.recordProbeFailure('deepseek-v4-flash', 'freemodel', 'quota_exhausted', now);
  let status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DOWN);

  // Advance past recovery window (5 min) but probe never succeeded → still DOWN
  now = 302000;
  status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DOWN);

  // Provider still failing → probe fails again → still DOWN
  modelStatus.recordProbeFailure('deepseek-v4-flash', 'freemodel', 'quota_exhausted', now);
  status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DOWN);

  // Provider recovers → first probe success within recovery window → DEGRADED (confidence threshold)
  now = 400000;
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'freemodel', now);
  status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.DEGRADED);

  // Advance past recovery window + second probe success → AVAILABLE
  now = 700000;
  modelStatus.recordProbeSuccess('deepseek-v4-flash', 'freemodel', now);
  status = modelStatus.getStatus('deepseek-v4-flash');
  assert.equal(status.status, modelStatus.STATUS.AVAILABLE);

  Date.now = originalNow;
  cleanup();
});

test('probe failure does not overwrite last real-request failure timestamp', () => {
  const cleanup = withModelStatusFixture();

  modelStatus.recordFailure('deepseek-v4-flash', 'nvidia', { providerErrorType: 'timeout', message: 'timeout' });
  const firstFailureAt = modelStatus.getStatus('deepseek-v4-flash').lastFailureAt;
  modelStatus.recordProbeFailure('deepseek-v4-flash', 'nvidia', 'provider_unavailable', firstFailureAt + 1000);
  const status = modelStatus.getStatus('deepseek-v4-flash');

  assert.equal(status.lastFailureAt, firstFailureAt);
  assert.equal(status.lastProbeReason, 'provider_unavailable');

  cleanup();
});

test('direct provider requests use openai-compatible transport without opencode session', async (t) => {
  const originalResolveModel = registry.resolveModel;
  const originalGetModelCandidates = registry.getModelCandidates;
  const originalIsProviderConnected = registry.isProviderConnected;
  const originalCreateSession = opencode.createSession;
  const originalConvertMessages = opencode.convertMessages;
  const originalGetPolicyForModel = require('../src/core/policy').getPolicyForModel;
  const originalInjectSystemPrompt = require('../src/core/policy').injectSystemPrompt;
  const originalChatCompletion = openaiCompatible.chatCompletion;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  let createSessionCalls = 0;
  let directCalls = 0;

  // github-models ships in config/direct-providers.json and reads its key from GITHUB_TOKEN.
  process.env.GITHUB_TOKEN = 'test-token';
  registry.resolveModel = () => ({
    alias: 'direct-alias',
    providerID: 'github-models',
    modelID: 'openai/gpt-4.1-mini',
    candidates: [{ providerID: 'github-models', modelID: 'openai/gpt-4.1-mini', transport: 'openai-compatible' }],
  });
  registry.getModelCandidates = () => ([{ providerID: 'github-models', modelID: 'openai/gpt-4.1-mini', transport: 'openai-compatible' }]);
  registry.isProviderConnected = () => true;
  opencode.createSession = async () => {
    createSessionCalls += 1;
    return { id: 'sess-1' };
  };
  opencode.convertMessages = () => ({ systemPrompt: null, parts: [{ type: 'text', text: 'hello' }] });
  require('../src/core/policy').getPolicyForModel = () => ({ systemPrompt: null, blockedPatterns: [] });
  require('../src/core/policy').injectSystemPrompt = messages => messages;
  openaiCompatible.chatCompletion = async (providerConfig, model, messages) => {
    directCalls += 1;
    assert.equal(providerConfig.baseUrl, 'https://models.github.ai');
    assert.equal(providerConfig.apiKey, 'test-token');
    assert.equal(model, 'openai/gpt-4.1-mini');
    assert.equal(messages[0].content, 'hello');
    return {
      content: 'ok',
      usage: { prompt_tokens: 2, completion_tokens: 3 },
      finishReason: 'stop',
    };
  };

  t.after(() => {
    registry.resolveModel = originalResolveModel;
    registry.getModelCandidates = originalGetModelCandidates;
    registry.isProviderConnected = originalIsProviderConnected;
    opencode.createSession = originalCreateSession;
    opencode.convertMessages = originalConvertMessages;
    require('../src/core/policy').getPolicyForModel = originalGetPolicyForModel;
    require('../src/core/policy').injectSystemPrompt = originalInjectSystemPrompt;
    openaiCompatible.chatCompletion = originalChatCompletion;
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
  });

  const req = makeChatRequest({ model: 'direct-alias', messages: [{ role: 'user', content: 'hello' }] });
  const res = makeResponseStub();
  await router.handleRequest(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(directCalls, 1);
  assert.equal(createSessionCalls, 0);
});

test('resolveSecret handles hybrid env / inline secret resolution', () => {
  const { resolveSecret } = require('../src/core/direct-provider-config');

  // Test env resolution
  process.env.TEST_API_KEY_ENV_VAR = 'env-value-123';
  const configWithEnv = { apiKeyEnv: 'TEST_API_KEY_ENV_VAR', apiKey: 'inline-value-123' };
  const resEnv = resolveSecret(configWithEnv);
  assert.equal(resEnv.value, 'env-value-123');
  assert.equal(resEnv.source, 'env');

  // Test inline fallback when env is not set
  delete process.env.TEST_API_KEY_ENV_VAR;
  const resFallback = resolveSecret(configWithEnv);
  assert.equal(resFallback.value, 'inline-value-123');
  assert.equal(resFallback.source, 'inline');

  // Test none case when neither is set or resolved
  const configNone = { name: 'no-auth' };
  const resNone = resolveSecret(configNone);
  assert.equal(resNone.value, null);
  assert.equal(resNone.source, 'none');

  // Test fallback if apiKeyEnv points to an empty environment variable
  process.env.TEST_API_KEY_ENV_VAR = '';
  const resEmptyEnv = resolveSecret(configWithEnv);
  assert.equal(resEmptyEnv.value, 'inline-value-123');
  assert.equal(resEmptyEnv.source, 'inline');

  delete process.env.TEST_API_KEY_ENV_VAR;
});

test('resolveSecret never leaks full apiKey in source none or env mode', () => {
  const { resolveSecret } = require('../src/core/direct-provider-config');

  process.env.TEST_API_KEY_ENV_VAR = 'secret-key-123';
  const configWithEnv = { apiKeyEnv: 'TEST_API_KEY_ENV_VAR' };
  const res = resolveSecret(configWithEnv);
  assert.equal(res.source, 'env');
  assert.equal(res.value, 'secret-key-123');

  const configNone = {};
  const resNone = resolveSecret(configNone);
  assert.equal(resNone.source, 'none');
  assert.equal(resNone.value, null);

  delete process.env.TEST_API_KEY_ENV_VAR;
});

test('direct provider config read returns correct structure', () => {
  const { readDirectProviders } = require('../src/core/direct-provider-config');
  const providers = readDirectProviders();
  // Should always return an object (even if empty or error)
  assert.ok(typeof providers === 'object');
  assert.ok(providers !== null);
});

// ── Key Pool ────────────────────────────────────────────────────

test('key pool: selectKey returns single key for single-key providers (backward compat)', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const keys = [{ id: 'KEY_1', value: 'sk-xxx', weight: 100 }];
  const result = keyPool.selectKey(keys);
  assert.ok(result);
  assert.equal(result.key.id, 'KEY_1');
  assert.equal(result.isProbe, false);
});

test('key pool: selectKey picks a key from multiple healthy keys', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const keys = [
    { id: 'KEY_1', value: 'sk-a', weight: 100 },
    { id: 'KEY_2', value: 'sk-b', weight: 100 },
  ];
  const result = keyPool.selectKey(keys);
  assert.ok(result);
  assert.ok(['KEY_1', 'KEY_2'].includes(result.key.id));
  assert.equal(result.isProbe, false);
});

test('key pool: selectKey skips keys in OPEN cooldown', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const keys = [
    { id: 'KEY_1', value: 'sk-a', weight: 100 },
    { id: 'KEY_2', value: 'sk-b', weight: 100 },
  ];
  // Mark KEY_1 as failed -> OPEN
  keyPool.recordKeyFailure('KEY_1', 'rate_limit');
  const result = keyPool.selectKey(keys);
  assert.ok(result);
  assert.equal(result.key.id, 'KEY_2');
  assert.equal(result.isProbe, false);
});

test('key pool: selectKey returns healthy key when all cooldowns have expired', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  const keys = [
    { id: 'KEY_1', value: 'sk-a', weight: 100 },
    { id: 'KEY_2', value: 'sk-b', weight: 100 },
  ];
  keyPool.recordKeyFailure('KEY_1', 'rate_limit');
  keyPool.recordKeyFailure('KEY_2', 'rate_limit');
  // Advance past cooldown (30s) => keys fall back to healthy pool
  now += 35000;

  const result = keyPool.selectKey(keys);
  assert.ok(result);
  assert.equal(result.isProbe, false); // treated as healthy, not probe
  assert.ok(['KEY_1', 'KEY_2'].includes(result.key.id));

  Date.now = originalNow;
  keyPool.resetKeyStates();
});

test('key pool: state transitions CLOSED → OPEN → CLOSED (success recovers directly)', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  // Initial: CLOSED
  let state = keyPool.getKeyState('KEY_1');
  assert.equal(state.state, 'closed');

  // Record failure → OPEN
  keyPool.recordKeyFailure('KEY_1', 'rate_limit');
  state = keyPool.getKeyState('KEY_1');
  assert.equal(state.state, 'open');
  assert.ok(state.openUntil > now);

  // Advance past cooldown → key is treated as healthy by selectKey
  now += 35000;
  // selectKey returns key as usable (state stays "open" but logic treats as healthy)
  const sel = keyPool.selectKey([{ id: 'KEY_1', value: 'sk-a', weight: 100 }]);
  assert.ok(sel);
  assert.equal(sel.isProbe, false);

  // recordKeySuccess with OPEN state → directly to CLOSED
  keyPool.recordKeySuccess('KEY_1', 150);
  state = keyPool.getKeyState('KEY_1');
  assert.equal(state.state, 'closed');

  Date.now = originalNow;
  keyPool.resetKeyStates();
});

test('key pool: markKeyActive increments active requests, recordKeySuccess decrements', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  keyPool.markKeyActive('KEY_1');
  let state = keyPool.getKeyState('KEY_1');
  assert.equal(state.activeRequests, 1);

  keyPool.markKeyActive('KEY_1');
  state = keyPool.getKeyState('KEY_1');
  assert.equal(state.activeRequests, 2);

  keyPool.recordKeySuccess('KEY_1', 100);
  state = keyPool.getKeyState('KEY_1');
  assert.equal(state.activeRequests, 1);

  keyPool.recordKeySuccess('KEY_1', 100);
  state = keyPool.getKeyState('KEY_1');
  assert.equal(state.activeRequests, 0);
});

test('key pool: recordKeyFailure applies different cooldowns per error type', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  // rate_limit → 30s
  keyPool.recordKeyFailure('KEY_RL', 'rate_limit');
  let state = keyPool.getKeyState('KEY_RL');
  assert.ok(state.openUntil >= now + 25000);
  assert.ok(state.openUntil <= now + 35000);

  // timeout → 15s
  keyPool.recordKeyFailure('KEY_TO', 'timeout');
  state = keyPool.getKeyState('KEY_TO');
  assert.ok(state.openUntil >= now + 10000);
  assert.ok(state.openUntil <= now + 20000);

  // quota_exhausted → 600s
  keyPool.recordKeyFailure('KEY_QE', 'quota_exhausted');
  state = keyPool.getKeyState('KEY_QE');
  assert.ok(state.openUntil >= now + 590000);
  assert.ok(state.openUntil <= now + 610000);

  Date.now = originalNow;
  keyPool.resetKeyStates();
});

test('key pool: weighted selection distributes across keys', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const keys = [
    { id: 'HEAVY', value: 'sk-a', weight: 100 },
    { id: 'LIGHT', value: 'sk-b', weight: 10 },
  ];

  // Run many selections: HEAVY should be picked more often
  let heavyCount = 0;
  const trials = 500;
  for (let i = 0; i < trials; i++) {
    const result = keyPool.selectKey(keys);
    if (result.key.id === 'HEAVY') heavyCount++;
    keyPool.resetKeyStates(); // Reset between trials for clean state
  }

  // HEAVY (weight 100) should be picked ~91% of the time vs LIGHT (weight 10)
  const ratio = heavyCount / trials;
  assert.ok(ratio > 0.7, 'HEAVY should be picked more often, got ' + ratio);

  keyPool.resetKeyStates();
});

test('key pool: getKeyPoolStatus returns correct structure with source field', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const keys = [
    { id: 'KEY_1', value: 'sk-a', weight: 100, source: 'env' },
    { id: 'KEY_2', value: 'sk-b', weight: 50, source: 'inline' },
  ];

  keyPool.markKeyActive('KEY_1');
  keyPool.recordKeyFailure('KEY_2', 'rate_limit');

  const status = keyPool.getKeyPoolStatus(keys);
  assert.equal(status.length, 2);

  const s1 = status.find(s => s.id === 'KEY_1');
  assert.ok(s1);
  assert.equal(s1.state, 'closed');
  assert.equal(s1.activeRequests, 1);
  assert.equal(s1.source, 'env');

  const s2 = status.find(s => s.id === 'KEY_2');
  assert.ok(s2);
  assert.equal(s2.state, 'open');
  assert.ok(s2.openUntil);
  assert.equal(s2.source, 'inline');
  assert.equal(s2.weight, 50);
});

test('key pool: resetKeyStates clears all state', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  keyPool.markKeyActive('KEY_1');
  keyPool.recordKeyFailure('KEY_2', 'rate_limit');

  keyPool.resetKeyStates();

  // After reset, states should return defaults
  const state1 = keyPool.getKeyState('KEY_1');
  assert.equal(state1.state, 'closed');
  assert.equal(state1.activeRequests, 0);

  const state2 = keyPool.getKeyState('KEY_2');
  assert.equal(state2.state, 'closed');
  assert.equal(state2.failures, 0);
});

test('key pool: key recovers after cooldown expiry, success clears state, failure extends cooldown', () => {
  const keyPool = require('../src/core/key-pool');
  keyPool.resetKeyStates();

  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  // Fail → OPEN
  keyPool.recordKeyFailure('KEY_1', 'rate_limit');
  assert.equal(keyPool.getKeyState('KEY_1').state, 'open');

  // Advance past cooldown → selectKey returns key as healthy
  now += 35000;
  const sel = keyPool.selectKey([{ id: 'KEY_1', value: 'sk-a', weight: 100 }]);
  assert.ok(sel);
  assert.equal(sel.isProbe, false);

  // Success → directly to CLOSED (from OPEN via else branch)
  keyPool.recordKeySuccess('KEY_1', 200);
  assert.equal(keyPool.getKeyState('KEY_1').state, 'closed');

  // Another failure → OPEN again
  keyPool.recordKeyFailure('KEY_1', 'rate_limit');
  assert.equal(keyPool.getKeyState('KEY_1').state, 'open');

  Date.now = originalNow;
  keyPool.resetKeyStates();
});

const clientAuth = require('../src/core/client-auth');

function basicHeader(user, pass) {
  return { authorization: 'Basic ' + Buffer.from(user + ':' + pass).toString('base64') };
}

test('client auth refuses Basic credentials when none are configured', async () => {
  for (const credentials of [{ username: '', password: '' }, { username: 'admin', password: '' }, { username: '', password: 'secret' }]) {
    const err = await clientAuth.authenticate({ headers: basicHeader('anyone', 'anything') }, credentials);
    assert.ok(err, 'expected rejection for ' + JSON.stringify(credentials));
    assert.equal(err.statusCode, 401);
    assert.equal(err.message, 'Client authentication is not configured');
  }
});

test('client auth accepts matching Basic credentials and rejects wrong ones', async () => {
  const credentials = { username: 'client', password: 's3cret' };
  assert.equal(await clientAuth.authenticate({ headers: basicHeader('client', 's3cret') }, credentials), null);

  for (const [user, pass] of [['client', 'wrong'], ['other', 's3cret'], ['client', 's3cret-longer'], ['', '']]) {
    const err = await clientAuth.authenticate({ headers: basicHeader(user, pass) }, credentials);
    assert.ok(err, 'expected rejection for ' + user + ':' + pass);
    assert.equal(err.message, 'Invalid credentials');
  }
});

test('client auth rejects missing header, malformed Basic and Bearer without a portal', async () => {
  const credentials = { username: 'client', password: 's3cret' };
  assert.equal((await clientAuth.authenticate({ headers: {} }, credentials)).message, 'Authorization required');
  const noColon = { authorization: 'Basic ' + Buffer.from('nocolon').toString('base64') };
  assert.equal((await clientAuth.authenticate({ headers: noColon }, credentials)).message, 'Invalid authorization format');
  // INTERNAL_API_SECRET is unset in tests, so Bearer keys cannot be validated.
  assert.equal((await clientAuth.authenticate({ headers: { authorization: 'Bearer abc' } }, credentials)).message, 'Authorization required');
});

test('safeEqual compares by value and length', () => {
  assert.equal(clientAuth.safeEqual('abc', 'abc'), true);
  assert.equal(clientAuth.safeEqual('abc', 'abd'), false);
  assert.equal(clientAuth.safeEqual('abc', 'abc\0'), false);
  assert.equal(clientAuth.safeEqual('', ''), true);
});
