/**
 * In-memory conversation store with auto-expiry.
 * Tracks conversation history and metadata per session.
 *
 * For production, replace with Redis or a database-backed store.
 */

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** @type {Map<string, { history: Array, metadata: object, lastAccess: number }>} */
const sessions = new Map();

/**
 * Get a session by ID, or create a new one.
 * Automatically refreshes the TTL on access.
 */
function getSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) {
    return {
      history: [],
      metadata: {
        selectedDoctor: null,
        preferredDate: null,
        preferredTime: null,
        userIntent: null,
      },
    };
  }

  // Refresh TTL
  session.lastAccess = Date.now();
  return { history: session.history, metadata: session.metadata };
}

/**
 * Save/update a session.
 */
function saveSession(sessionId, history, metadata = {}) {
  const existing = sessions.get(sessionId);
  const mergedMetadata = {
    ...(existing?.metadata || {}),
    ...metadata,
  };

  sessions.set(sessionId, {
    history,
    metadata: mergedMetadata,
    lastAccess: Date.now(),
  });
}

/**
 * Clear a specific session.
 */
function clearSession(sessionId) {
  return sessions.delete(sessionId);
}

/**
 * Periodic cleanup of expired sessions.
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions) {
    if (now - session.lastAccess > SESSION_TTL_MS) {
      sessions.delete(sessionId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

export { getSession, saveSession, clearSession };
