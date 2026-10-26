const configStore = require('./config-store');

const KEY_STATE = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
  PROBATION: 'probation',
};

const keyStates = new Map();

function kp() { return configStore.getSection('keyPool') || {}; }

function getKeyState(keyId) {
  if (!keyStates.has(keyId)) {
    keyStates.set(keyId, {
      state: KEY_STATE.CLOSED,
      openUntil: 0,
      failures: 0,
      activeRequests: 0,
      lastLatency: null,
      successStreak: 0,
      probationUntil: 0,
    });
  }
  return keyStates.get(keyId);
}

function recordKeySuccess(keyId, latencyMs) {
  const state = getKeyState(keyId);
  state.successStreak = (state.successStreak || 0) + 1;
  state.failures = 0;
  state.lastLatency = latencyMs;
  state.activeRequests = Math.max(0, state.activeRequests - 1);

  const cfg = kp();
  const probationRampMs = cfg.halfOpenTrafficRampUpMs || 30000;

  if (state.state === KEY_STATE.HALF_OPEN) {
    state.state = KEY_STATE.PROBATION;
    state.probationUntil = Date.now() + probationRampMs;
    state.openUntil = 0;
  } else if (state.state === KEY_STATE.PROBATION) {
    if (state.successStreak >= (cfg.halfOpenProbeSuccessThreshold || 3) || Date.now() >= state.probationUntil) {
      state.state = KEY_STATE.CLOSED;
      state.probationUntil = 0;
    }
  } else {
    state.state = KEY_STATE.CLOSED;
  }
}

function recordKeyFailure(keyId, errorType) {
  const state = getKeyState(keyId);
  state.failures = (state.failures || 0) + 1;
  state.activeRequests = Math.max(0, state.activeRequests - 1);
  state.successStreak = 0;

  const cfg = kp() || {};
  const errorCooldowns = configStore.getSection('errorCooldowns') || {};

  let cooldownMs = cfg.defaultCooldownMs || 30000;
  let scope = 'candidate';

  if (errorType === 'auth_billing' || errorType === 'quota_exhausted') {
    cooldownMs = errorCooldowns.quotaCooldownMs || 600000;
    scope = 'provider';
  } else if (errorType === 'rate_limit') {
    cooldownMs = errorCooldowns.rateLimitCooldownMs || 30000;
  } else if (errorType === 'timeout') {
    cooldownMs = errorCooldowns.timeoutCooldownMs || 15000;
  } else if (errorType === 'provider_unavailable') {
    cooldownMs = errorCooldowns.providerUnavailableCooldownMs || 30000;
  }

  state.state = KEY_STATE.OPEN;
  state.openUntil = Date.now() + cooldownMs;

  return { cooldownMs, scope };
}

function selectKey(keys) {
  if (!keys || keys.length === 0) return null;
  if (keys.length === 1) return { key: keys[0], isProbe: false };

  const now = Date.now();
  const healthy = [];
  const halfOpen = [];
  const open = [];

  for (const key of keys) {
    const state = getKeyState(key.id);
    if (state.state === KEY_STATE.OPEN && state.openUntil > now) {
      open.push(key);
      continue;
    }
    if (state.state === KEY_STATE.HALF_OPEN) {
      halfOpen.push(key);
      continue;
    }
    healthy.push(key);
  }

  if (healthy.length > 0) {
    const scored = healthy.map(k => {
      const state = getKeyState(k.id);
      const weightMultiplier = state.state === KEY_STATE.PROBATION ? 0.5 : 1.0;
      const effectiveWeight = (k.weight || 100) * weightMultiplier;
      const activePenalty = 1 + (state.activeRequests || 0);
      return { key: k, score: effectiveWeight / activePenalty };
    });

    const totalScore = scored.reduce((s, x) => s + Math.max(0.01, x.score), 0);
    let random = Math.random() * totalScore;
    for (const s of scored) {
      random -= Math.max(0.01, s.score);
      if (random <= 0) return { key: s.key, isProbe: false };
    }
    return { key: scored[scored.length - 1].key, isProbe: true };
  }

  const cfg = kp();
  const maxHalfOpen = cfg.halfOpenMaxProbes || 1;
  const halfOpenAvailable = halfOpen.filter(k => {
    const state = getKeyState(k.id);
    return state.successStreak < maxHalfOpen;
  });

  if (halfOpenAvailable.length > 0) {
    const state = getKeyState(halfOpenAvailable[0].id);
    state.successStreak = (state.successStreak || 0) + 1;
    return { key: halfOpenAvailable[0], isProbe: true };
  }

  const soonest = open.sort((a, b) => {
    const aState = getKeyState(a.id);
    const bState = getKeyState(b.id);
    return (aState.openUntil || 0) - (bState.openUntil || 0);
  })[0];

  return soonest ? { key: soonest, isProbe: true, allOpen: true, retryAfter: Math.max(0, (getKeyState(soonest.id).openUntil || 0) - Date.now()) } : null;
}

function markKeyActive(keyId) {
  const state = getKeyState(keyId);
  state.activeRequests = (state.activeRequests || 0) + 1;
}

function getKeyPoolStatus(keys) {
  return (keys || []).map(k => {
    const state = getKeyState(k.id);
    return {
      id: k.id,
      state: state?.state || KEY_STATE.CLOSED,
      failures: state?.failures || 0,
      activeRequests: state?.activeRequests || 0,
      successStreak: state?.successStreak || 0,
      lastLatency: state?.lastLatency || null,
      openUntil: state?.openUntil && state.openUntil > Date.now() ? state.openUntil : null,
      probationUntil: state?.probationUntil && state.probationUntil > Date.now() ? state.probationUntil : null,
      weight: k.weight || 100,
      rpm: k.rpm || 500,
      source: k.source || 'none',
    };
  });
}

function resetKeyStates() {
  keyStates.clear();
}

module.exports = {
  KEY_STATE,
  getKeyState,
  recordKeySuccess,
  recordKeyFailure,
  selectKey,
  markKeyActive,
  getKeyPoolStatus,
  resetKeyStates,
};
