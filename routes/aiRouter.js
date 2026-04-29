/**
 * AI Router — routes for the AI chatbot API.
 *
 * POST   /api/ai/chat              → chat with the agent
 * DELETE /api/ai/chat/:sessionId   → clear a conversation session
 *
 * The chat endpoint optionally accepts an auth token to enable
 * booking/cancellation functionality for authenticated users.
 */

import express from "express";
import { chatWithAgent, clearChatSession } from "../controllers/aiController.js";
import authUser from "../middlewares/authUser.js";

const aiRouter = express.Router();

/**
 * Optional auth middleware — tries to authenticate but doesn't block
 * anonymous users. This lets unauthenticated users still chat with
 * the agent for symptom inquiries and doctor search, while
 * authenticated users can also book/cancel appointments.
 */
const optionalAuth = (req, res, next) => {
  const { token } = req.headers;
  if (token) {
    // Run the real auth middleware
    return authUser(req, res, next);
  }
  // No token — proceed as anonymous
  next();
};

// Chat endpoint (optionally authenticated)
aiRouter.post("/chat", optionalAuth, chatWithAgent);

// Clear session (no auth needed)
aiRouter.delete("/chat/:sessionId", clearChatSession);

export default aiRouter;
