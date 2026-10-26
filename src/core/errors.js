const configStore = require('./config-store');
const { DEFAULT_SAFE_MESSAGE } = require('./constants');
function ec() { return configStore.getSection('errorCooldowns'); }

function boundedSnippet(value, limit = 512) {
  if (typeof value !== 'string') return '';
  if (value.length <= limit) return value;
  return value.slice(0, limit) + '…';
}

function parseRetryAfterMs(retryAfter) {
  if (!retryAfter) return null;
  const value = Array.isArray(retryAfter) ? retryAfter[0] : retryAfter;
  if (typeof value !== 'string') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.floor(seconds * 1000));
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - Date.now());
}

function normalizeStatusCode(statusCode) {
  return Number.isInteger(statusCode) ? statusCode : 502;
}

function classifyProviderError({ statusCode, bodySnippet, headers, message } = {}) {
  const normalizedStatus = normalizeStatusCode(statusCode);
  const snippet = `${bodySnippet || ''} ${message || ''}`.toLowerCase();
  const retryAfterMs = parseRetryAfterMs(headers?.['retry-after'] || headers?.['Retry-After']);

  const quotaPattern = /(?:quota|insufficient quota|balance exhausted|credits? exhausted|billing|payment required|plan limit|out of credits)/i;
  const rateLimitPattern = /(?:rate limit|too many requests|slow down|try again later)/i;
  const timeoutPattern = /(?:timeout|timed out|deadline exceeded|request aborted)/i;
  const authPattern = /(?:unauthori[sz]ed|forbidden|invalid api key|authentication|auth failed|billing|payment required)/i;
  const unavailablePattern = /(?:overloaded|busy|unavailable|temporarily unavailable|service unavailable|capacity|maintenance)/i;
  const badRequestPattern = /(?:bad request|invalid request|unprocessable|malformed|unsupported|invalid parameter|invalid input)/i;
  const modelNotFoundPattern = /(?:model not found|unknown model|no such model|model unavailable)/i;
  const policyPattern = /(?:policy|safety|blocked|refus|disallowed|content filter|violation)/i;

  if (normalizedStatus === 401 || normalizedStatus === 403 || authPattern.test(snippet)) {
    return {
      providerErrorType: 'auth_billing',
      retryable: false,
      cooldownScope: 'provider',
      cooldownMs: retryAfterMs || ec().authCooldownMs,
      retryAfterMs,
    };
  }

  if (quotaPattern.test(snippet) || normalizedStatus === 429 && /(?:quota|insufficient|balance|credits|billing|payment)/i.test(snippet)) {
    return {
      providerErrorType: 'quota_exhausted',
      retryable: true,
      cooldownScope: 'provider',
      cooldownMs: retryAfterMs || ec().quotaCooldownMs,
      retryAfterMs,
    };
  }

  if (normalizedStatus === 429 || rateLimitPattern.test(snippet)) {
    return {
      providerErrorType: 'rate_limit',
      retryable: true,
      cooldownScope: 'candidate',
      cooldownMs: retryAfterMs || ec().rateLimitCooldownMs,
      retryAfterMs,
    };
  }

  if (normalizedStatus === 408 || timeoutPattern.test(snippet)) {
    return {
      providerErrorType: 'timeout',
      retryable: true,
      cooldownScope: 'candidate',
      cooldownMs: retryAfterMs || ec().timeoutCooldownMs,
      retryAfterMs,
    };
  }

  if (policyPattern.test(snippet)) {
    return {
      providerErrorType: 'policy_violation',
      retryable: false,
      cooldownScope: null,
      cooldownMs: 0,
      retryAfterMs,
    };
  }

  if (modelNotFoundPattern.test(snippet) || badRequestPattern.test(snippet) || normalizedStatus === 400 || normalizedStatus === 404) {
    return {
      providerErrorType: modelNotFoundPattern.test(snippet) ? 'bad_request_model_not_found' : 'bad_request',
      retryable: false,
      cooldownScope: null,
      cooldownMs: 0,
      retryAfterMs,
    };
  }

  if (normalizedStatus === 500 || normalizedStatus === 502 || normalizedStatus === 503 || normalizedStatus === 504 || unavailablePattern.test(snippet)) {
    return {
      providerErrorType: 'provider_unavailable',
      retryable: true,
      cooldownScope: 'candidate',
      cooldownMs: retryAfterMs || ec().providerUnavailableCooldownMs,
      retryAfterMs,
    };
  }

  return {
    providerErrorType: 'generic_provider_error',
    retryable: normalizedStatus === 408 || normalizedStatus === 425 || normalizedStatus === 429 || normalizedStatus === 500 || normalizedStatus === 502 || normalizedStatus === 503 || normalizedStatus === 504,
    cooldownScope: normalizedStatus === 429 || normalizedStatus >= 500 ? 'candidate' : null,
    cooldownMs: retryAfterMs || 0,
    retryAfterMs,
  };
}

class AiproxyError extends Error {
  constructor(message, statusCode = 500, type = 'server_error', code = 'internal_error', safeMessage) {
    super(message);
    this.name = 'AiproxyError';
    this.statusCode = statusCode;
    this.type = type;
    this.code = code;
    this.safeMessage = safeMessage || DEFAULT_SAFE_MESSAGE;
  }
}

class ProviderError extends AiproxyError {
  constructor(message, statusCode = 502, safeMessage, meta = {}) {
    super(message, statusCode, 'provider_error', 'provider_error', safeMessage);
    this.name = 'ProviderError';
    this.providerErrorType = meta.providerErrorType || 'generic_provider_error';
    this.retryable = meta.retryable;
    this.cooldownScope = meta.cooldownScope || null;
    this.cooldownMs = meta.cooldownMs || 0;
    this.upstreamStatusCode = meta.upstreamStatusCode || statusCode;
    this.upstreamRetryAfterMs = meta.upstreamRetryAfterMs || null;
    this.upstreamBodySnippet = meta.upstreamBodySnippet || '';
  }
}

function isRetryableError(error) {
  if (!error) return false;
  if (error.retryable === true) return true;
  if (error instanceof ProviderError) return true;
  const statusCode = error.statusCode;
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503 || statusCode === 504;
}

class ModelNotFoundError extends AiproxyError {
  constructor(modelName) {
    const msg = 'Unknown model. Use GET /v1/models to list available models.';
    super(msg, 400, 'invalid_request_error', 'model_not_found', msg);
    this.name = 'ModelNotFoundError';
    this.modelName = modelName;
  }
}

class PolicyViolationError extends AiproxyError {
  constructor(message, blockedPattern) {
    super(message, 400, 'invalid_request_error', 'policy_violation', message);
    this.name = 'PolicyViolationError';
    this.blockedPattern = blockedPattern || null;
  }
}

function normalizeError(error, requestId) {
  const reqTag = requestId ? ` [${requestId}]` : '';
  const doSanitize = (v) => {
    const s = require('./sanitizer');
    return s.sanitizeLogValue(v);
  };

  if (error instanceof ProviderError) {
    console.error(`[ProviderError${reqTag}]`, error.providerErrorType, error.upstreamStatusCode, doSanitize(error.message), doSanitize(error.upstreamBodySnippet));
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          message: error.safeMessage,
          type: error.type,
          code: error.code,
        }
      }
    };
  }

  if (error instanceof AiproxyError) {
    console.error(`[AiproxyError${reqTag}]`, error.type, error.code, doSanitize(error.message));
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          message: error.safeMessage,
          type: error.type,
          code: error.code,
        }
      }
    };
  }

  if (error instanceof SyntaxError) {
    console.error(`[SyntaxError${reqTag}]`, doSanitize(error.message));
    return {
      statusCode: 400,
      body: {
        error: {
          message: 'Invalid request format',
          type: 'invalid_request_error',
          code: 'parse_error',
        }
      }
    };
  }

  console.error(`[UnhandledError${reqTag}]`, doSanitize(error?.stack || error?.message || error));
  return {
    statusCode: 500,
    body: {
      error: {
        message: DEFAULT_SAFE_MESSAGE,
        type: 'server_error',
        code: 'internal_error',
      }
    }
  };
}

module.exports = {
  AiproxyError,
  ProviderError,
  ModelNotFoundError,
  PolicyViolationError,
  boundedSnippet,
  classifyProviderError,
  parseRetryAfterMs,
  isRetryableError,
  normalizeError,
};
