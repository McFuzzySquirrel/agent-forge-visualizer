import type { EventEnvelope } from "../../event-schema/src/index.js";

export function applyRedaction(event: EventEnvelope): EventEnvelope {
  if (event.eventType !== "userPromptSubmitted") {
    return event;
  }

  const payload = { ...event.payload } as Record<string, unknown>;
  if (typeof payload.prompt === "string") {
    payload.prompt = "[REDACTED_PROMPT]";
  }

  return {
    ...event,
    payload
  };
}
