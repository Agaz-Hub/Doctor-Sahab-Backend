import express from "express";
import authDoctor from "../middlewares/authDoctor.js";
import {
  chatWithDoctorExpert,
  chatWithDoctorExpertStream,
  clearDoctorChatSession,
} from "../controllers/doctorAiController.js";

const doctorAiRouter = express.Router();

// Doctor-only AI medical expert chat (non-agentic)
doctorAiRouter.post("/chat", authDoctor, chatWithDoctorExpert);
doctorAiRouter.post("/chat/stream", authDoctor, chatWithDoctorExpertStream);
doctorAiRouter.delete("/chat/:sessionId", authDoctor, clearDoctorChatSession);

export default doctorAiRouter;
