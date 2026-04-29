/**
 * Core AI agent — orchestrates the conversation loop with Hugging Face Inference API.
 *
 * Flow:
 *  1. Restore conversation history
 *  2. Send user message + history to HF with tool config
 *  3. If HF returns a tool call → execute it → feed result back
 *  4. Loop until HF returns final text
 *  5. Save updated history
 *  6. Return final text response
 */

import { HfInference } from "@huggingface/inference";
import SYSTEM_PROMPT from "./systemPrompt.js";
import toolDefinitions from "./tools/toolDefinitions.js";
import { executeTool } from "./tools/toolExecutor.js";
import { getSession, saveSession } from "./conversationStore.js";

const MAX_TOOL_ITERATIONS = 5;

let hf = null;

function getClient() {
  if (!hf) {
    if (!process.env.HF_TOKEN) {
        throw new Error("Missing HF_TOKEN environment variable. Please add it to .env.");
    }
    hf = new HfInference(process.env.HF_TOKEN);
  }
  return hf;
}

// Convert Gemini tool definitions to standard OpenAI/HuggingFace tool format
const hfTools = toolDefinitions.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

/**
 * Run the agent for a single user message.
 */
async function runAgent(userMessage, sessionId, userId = null, onChunk = null) {
  const client = getClient();
  const { history, metadata } = getSession(sessionId);

  // Initialize history if empty
  if (!history || history.length === 0) {
    history.push({ role: "system", content: SYSTEM_PROMPT });
  }

  // Inject context
  let enrichedMessage = userMessage;
  const today = new Date();
  const currentDateFormatted = `${today.getDate()}_${today.getMonth() + 1}_${today.getFullYear()}`;
  const currentTimeFormatted = today.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

  enrichedMessage += `\n\n[System context: Today's date is ${today.toDateString()} (Formatted: ${currentDateFormatted}) and the current time is ${currentTimeFormatted}. Use this to ensure you do not show or book past dates or past times for today.]`;

  if (userId) {
    enrichedMessage += `\n[System context: The authenticated user ID is "${userId}". Use this for any booking or cancellation tool calls.]`;
  }

  // Append user message to history
  history.push({ role: "user", content: enrichedMessage });

  let iterations = 0;

  // Agentic loop: handle tool calls until we get a text response
  while (iterations < MAX_TOOL_ITERATIONS) {
    const stream = client.chatCompletionStream({
      model: "Qwen/Qwen2.5-7B-Instruct", // Top agentic open-source model
      messages: history,
      tools: hfTools,
      max_tokens: 1500,
    });

    let fullContent = "";
    let functionCallArgsString = "";
    let functionCallName = null;
    let toolCallId = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        fullContent += delta.content;
        if (onChunk) onChunk(delta.content);
      }

      if (delta.tool_calls && delta.tool_calls.length > 0) {
        const toolCall = delta.tool_calls[0];
        if (toolCall.id) toolCallId = toolCall.id;
        if (toolCall.function?.name) functionCallName = toolCall.function.name;
        if (toolCall.function?.arguments) {
          functionCallArgsString += toolCall.function.arguments;
        }
      }
    }

    if (fullContent.trim() && !functionCallName) {
      // Model returned a standard text response, no tool calls
      history.push({ role: "assistant", content: fullContent });
      break;
    }

    if (!fullContent && !functionCallName) {
      // Empty response anomaly edge case
      break;
    }

    if (functionCallName) {
      // Parse safely
      let args = {};
      try {
        args = JSON.parse(functionCallArgsString);
      } catch (e) {
        console.error("Failed to parse tool arguments:", functionCallArgsString);
      }

      const generatedToolCallId =
        toolCallId || "call_" + Math.random().toString(36).substr(2, 9);
      
      // Append the assistant's request to call a tool to history
      history.push({
        role: "assistant",
        content: fullContent || null,
        tool_calls: [
          {
            type: "function",
            id: generatedToolCallId,
            function: {
              name: functionCallName,
              arguments: functionCallArgsString,
            },
          },
        ],
      });

      console.log(`[AI Agent] Tool call: ${functionCallName}`, JSON.stringify(args));

      // Execute tool
      const toolResult = await executeTool(functionCallName, args);
      console.log(
        `[AI Agent] Tool result:`,
        JSON.stringify(toolResult).substring(0, 200)
      );

      // Append tool result to history
      history.push({
        role: "tool",
        tool_call_id: generatedToolCallId,
        name: functionCallName,
        content: JSON.stringify(toolResult),
      });

      iterations++;
    } else {
      break;
    }
  }

  // Save updated conversation history
  saveSession(sessionId, history, metadata);

  return { sessionId };
}

export { runAgent };
