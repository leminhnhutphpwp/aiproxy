const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000;
const MAX_SESSIONS = 1000;

function getSession(sessionId) {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.lastAccess > SESSION_TTL) {
    sessions.delete(sessionId);
    return null;
  }
  session.lastAccess = Date.now();
  return session;
}

function createSession(sessionId) {
  if (sessions.size >= MAX_SESSIONS) {
    let oldest = null;
    let oldestAccess = Infinity;
    for (const [id, s] of sessions) {
      if (s.lastAccess < oldestAccess) {
        oldestAccess = s.lastAccess;
        oldest = id;
      }
    }
    if (oldest) sessions.delete(oldest);
  }

  const session = {
    id: sessionId,
    createdAt: Date.now(),
    lastAccess: Date.now(),
    turns: [],
    activeFiles: new Set(),
    codePatterns: new Set(),
    frameworkHints: new Set(),
    accumulatedTopics: new Set(),
    chunksUsed: new Set(),
  };
  sessions.set(sessionId, session);
  return session;
}

function getOrCreateSession(sessionId) {
  if (!sessionId) return null;
  let session = getSession(sessionId);
  if (!session) {
    session = createSession(sessionId);
  }
  return session;
}

function updateSession(sessionId, context, chunks) {
  if (!sessionId) return;
  const session = getOrCreateSession(sessionId);
  if (!session) return;

  session.turns.push({
    query: context.currentQuery || '',
    topic: context.conversationTopic || 'general',
    chunks: (chunks || []).map(c => c.id).filter(Boolean),
    timestamp: Date.now(),
  });

  if (session.turns.length > 20) {
    session.turns = session.turns.slice(-20);
  }

  if (context.codeContext) {
    for (const f of context.codeContext.activeFiles || []) session.activeFiles.add(f);
    for (const p of context.codeContext.codePatterns || []) session.codePatterns.add(p);
    for (const h of context.codeContext.frameworkHints || []) session.frameworkHints.add(h);
  }

  if (context.conversationTopic && context.conversationTopic !== 'general') {
    session.accumulatedTopics.add(context.conversationTopic);
  }

  for (const chunk of chunks || []) {
    if (chunk.id) session.chunksUsed.add(chunk.id);
  }

  session.lastAccess = Date.now();
}

function getSessionContext(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const recentChunks = [];
  const recentTurnChunks = session.turns.slice(-3);
  for (const turn of recentTurnChunks) {
    for (const cid of turn.chunks) {
      if (!recentChunks.includes(cid)) recentChunks.push(cid);
    }
  }

  return {
    recentTopics: [...session.accumulatedTopics],
    activeFiles: [...session.activeFiles],
    codePatterns: [...session.codePatterns],
    frameworkHints: [...session.frameworkHints],
    recentChunkIds: recentChunks,
    turnCount: session.turns.length,
    recentQueries: session.turns.slice(-3).map(t => t.query),
  };
}

function getRecentChunkIds(sessionId, count) {
  const session = getSession(sessionId);
  if (!session) return [];
  const recent = [];
  for (let i = session.turns.length - 1; i >= 0 && recent.length < (count || 10); i--) {
    for (const cid of session.turns[i].chunks) {
      if (!recent.includes(cid)) recent.push(cid);
    }
  }
  return recent;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastAccess > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanupSessions, 5 * 60 * 1000).unref();

module.exports = {
  getSession,
  createSession,
  getOrCreateSession,
  updateSession,
  getSessionContext,
  getRecentChunkIds,
  cleanupSessions,
};
