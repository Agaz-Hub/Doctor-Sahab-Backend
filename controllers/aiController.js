/**
 * AI Chat Controller — Express request handler.
 * Decoupled from AI internals; simply bridges HTTP ↔ agent.
 */

import { runAgent } from "../ai/agent.js";
import { clearSession } from "../ai/conversationStore.js";

/**
 * Generate a simple session ID (no external dependency needed).
 */
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * POST /api/ai/chat
 * Body: { message: string, sessionId?: string }
 * Headers: token (optional, for authenticated users)
 */
const chatWithAgent = async (req, res) => {
  // Set headers for Server-Sent Events (SSE)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  try {
    const { message, sessionId: clientSessionId } = req.body;
    const userId = req.userId || null;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "Please provide a non-empty message." })}\n\n`);
      return res.end();
    }

    const sessionId = clientSessionId || generateSessionId();

    console.log(`[AI Chat] Session: ${sessionId} | User: ${userId || "anonymous"} | Message: "${message.substring(0, 80)}"`);

    // Emit session ID immediately
    res.write(`data: ${JSON.stringify({ type: "session", sessionId })}\n\n`);

    // Callback for streaming chunks
    const onChunk = (text) => {
      res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
    };

    await runAgent(message.trim(), sessionId, userId, onChunk);

    // End of stream
    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  } catch (error) {
    console.error("[AI Chat Error]", error);
    res.write(`data: ${JSON.stringify({ type: "error", message: "An error occurred while processing your request. Please try again." })}\n\n`);
  } finally {
    res.end();
  }
};

/**
 * DELETE /api/ai/chat/:sessionId
 * Clears a conversation session.
 */
const clearChatSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Please provide a session ID.",
      });
    }

    clearSession(sessionId);

    res.json({
      success: true,
      message: "Conversation session cleared.",
    });
  } catch (error) {
    console.error("[AI Chat Error]", error);
    res.status(500).json({
      success: false,
      message: "Error clearing session.",
    });
  }
};

export { chatWithAgent, clearChatSession };
