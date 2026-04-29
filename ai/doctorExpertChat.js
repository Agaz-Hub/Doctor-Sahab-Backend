import { HfInference } from "@huggingface/inference";
import { getSession, saveSession } from "./conversationStore.js";
import DOCTOR_EXPERT_SYSTEM_PROMPT from "./doctorExpertPrompt.js";

let hf = null;

function getClient() {
  if (!hf) {
    if (!process.env.HF_TOKEN) {
      throw new Error(
        "Missing HF_TOKEN environment variable. Please add it to .env.",
      );
    }
    hf = new HfInference(process.env.HF_TOKEN);
  }
  return hf;
}

function buildContextBlock(context = {}) {
  const lines = [];

  if (context.mode) lines.push(`Mode: ${context.mode}`);
  if (context.appointmentId)
    lines.push(`Appointment ID: ${context.appointmentId}`);
  if (context.patientSummary)
    lines.push(`Patient summary: ${context.patientSummary}`);

  return lines.length > 0 ? `\n\n[Clinical context]\n${lines.join("\n")}` : "";
}

async function runDoctorExpertChat({
  message,
  sessionId,
  doctorId = null,
  context = {},
}) {
  const client = getClient();
  const { history, metadata } = getSession(sessionId);

  if (!history || history.length === 0) {
    history.push({ role: "system", content: DOCTOR_EXPERT_SYSTEM_PROMPT });
  }

  const contextBlock = buildContextBlock(context);
  const doctorScope = doctorId ? `\nDoctor ID: ${doctorId}` : "";
  const userMessage = `${message.trim()}${contextBlock}${doctorScope}`;

  history.push({ role: "user", content: userMessage });

  const response = await client.chatCompletion({
    model: "Qwen/Qwen2.5-72B-Instruct",
    messages: history,
    max_tokens: 1200,
    temperature: 0.35,
  });

  const reply =
    response?.choices?.[0]?.message?.content?.trim() ||
    "I could not generate a response right now. Please try again.";

  history.push({ role: "assistant", content: reply });
  saveSession(sessionId, history, metadata);

  return { sessionId, reply };
}

async function runDoctorExpertChatStream({
  message,
  sessionId,
  doctorId = null,
  context = {},
  onChunk,
}) {
  const client = getClient();
  const { history, metadata } = getSession(sessionId);

  if (!history || history.length === 0) {
    history.push({ role: "system", content: DOCTOR_EXPERT_SYSTEM_PROMPT });
  }

  const contextBlock = buildContextBlock(context);
  const doctorScope = doctorId ? `\nDoctor ID: ${doctorId}` : "";
  const userMessage = `${message.trim()}${contextBlock}${doctorScope}`;

  history.push({ role: "user", content: userMessage });

  const stream = client.chatCompletionStream({
    model: "Qwen/Qwen2.5-72B-Instruct",
    messages: history,
    max_tokens: 1200,
    temperature: 0.35,
  });

  let reply = "";

  for await (const chunk of stream) {
    const delta = chunk?.choices?.[0]?.delta;
    if (!delta?.content) continue;
    reply += delta.content;
    if (onChunk) onChunk(delta.content);
  }

  if (!reply.trim()) {
    reply = "I could not generate a response right now. Please try again.";
    if (onChunk) onChunk(reply);
  }

  history.push({ role: "assistant", content: reply });
  saveSession(sessionId, history, metadata);

  return { sessionId, reply };
}

export { runDoctorExpertChat, runDoctorExpertChatStream };
