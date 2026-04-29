import {
  runDoctorExpertChat,
  runDoctorExpertChatStream,
} from "../ai/doctorExpertChat.js";
import { clearSession } from "../ai/conversationStore.js";

function generateSessionId() {
  return `doc_session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

const chatWithDoctorExpert = async (req, res) => {
  try {
    const {
      message,
      sessionId: clientSessionId,
      mode,
      appointmentId,
      patientSummary,
    } = req.body;

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a non-empty message.",
      });
    }

    const sessionId = clientSessionId || generateSessionId();

    const result = await runDoctorExpertChat({
      message,
      sessionId,
      doctorId: req.docId,
      context: {
        mode,
        appointmentId,
        patientSummary,
      },
    });

    return res.json({
      success: true,
      sessionId: result.sessionId,
      reply: result.reply,
    });
  } catch (error) {
    console.error("[Doctor AI Chat Error]", error);
    return res.status(500).json({
      success: false,
      message:
        "An error occurred while processing your request. Please try again.",
    });
  }
};

const clearDoctorChatSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Please provide a session ID.",
      });
    }

    clearSession(sessionId);

    return res.json({
      success: true,
      message: "Doctor AI conversation session cleared.",
    });
  } catch (error) {
    console.error("[Doctor AI Session Clear Error]", error);
    return res.status(500).json({
      success: false,
      message: "Error clearing doctor AI session.",
    });
  }
};

const chatWithDoctorExpertStream = async (req, res) => {
  const {
    message,
    sessionId: clientSessionId,
    mode,
    appointmentId,
    patientSummary,
  } = req.body || {};

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: "Please provide a non-empty message.",
    });
  }

  const sessionId = clientSessionId || generateSessionId();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (res.flushHeaders) res.flushHeaders();

  const sendEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    sendEvent({ type: "session", sessionId });

    await runDoctorExpertChatStream({
      message,
      sessionId,
      doctorId: req.docId,
      context: {
        mode,
        appointmentId,
        patientSummary,
      },
      onChunk: (text) => sendEvent({ type: "chunk", text }),
    });

    sendEvent({ type: "done" });
    res.end();
  } catch (error) {
    console.error("[Doctor AI Stream Error]", error);
    sendEvent({
      type: "error",
      message:
        "An error occurred while processing your request. Please try again.",
    });
    res.end();
  }
};

export {
  chatWithDoctorExpert,
  chatWithDoctorExpertStream,
  clearDoctorChatSession,
};
