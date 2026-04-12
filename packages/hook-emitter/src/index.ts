import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import { v4 as uuidv4 } from "uuid";
import { EVENT_TYPES, SCHEMA_VERSION, parseEvent, type EventEnvelope, type ParseResult } from "../../../shared/event-schema/src/index.js";
import { applyRedaction } from "../../../shared/redaction/src/index.js";

export interface EmitOptions {
  jsonlPath: string;
  repoPath: string;
  sessionId: string;
  source?: "copilot-cli";
  httpEndpoint?: string;
  now?: () => string;
  eventIdFactory?: () => string;
}

export interface EmitResult {
  accepted: boolean;
  event?: EventEnvelope;
  error?: string;
}

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function sendHttp(event: EventEnvelope, endpoint: string): Promise<void> {
  await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event)
  });
}

export async function emitEvent(
  eventType: (typeof EVENT_TYPES)[number],
  payload: Record<string, unknown>,
  options: EmitOptions
): Promise<EmitResult> {
  const rawEvent = {
    schemaVersion: SCHEMA_VERSION,
    eventId: options.eventIdFactory?.() ?? uuidv4(),
    eventType,
    timestamp: options.now?.() ?? new Date().toISOString(),
    sessionId: options.sessionId,
    source: options.source ?? "copilot-cli",
    repoPath: options.repoPath,
    payload
  };

  const parsed = parseEvent(rawEvent);
  if (!parsed.ok) {
    return { accepted: false, error: parsed.error };
  }

  const redacted = applyRedaction(parsed.value);
  await ensureParent(options.jsonlPath);
  await appendFile(options.jsonlPath, `${JSON.stringify(redacted)}\n`, "utf8");

  if (options.httpEndpoint) {
    await sendHttp(redacted, options.httpEndpoint);
  }

  return { accepted: true, event: redacted };
}

export async function emitRawAndValidate(
  raw: unknown,
  options: Pick<EmitOptions, "jsonlPath">
): Promise<ParseResult> {
  const parsed = parseEvent(raw);
  if (parsed.ok) {
    await ensureParent(options.jsonlPath);
    await appendFile(options.jsonlPath, `${JSON.stringify(parsed.value)}\n`, "utf8");
  }
  return parsed;
}

export function getHookEventTypes(): readonly string[] {
  return EVENT_TYPES;
}
