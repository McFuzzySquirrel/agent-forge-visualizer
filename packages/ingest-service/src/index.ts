import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import Fastify, { type FastifyInstance } from "fastify";
import { parseEvent, type EventEnvelope } from "../../../shared/event-schema/src/index.js";
import { rebuildState, reduceEvent, initialSessionState, type SessionState } from "../../../shared/state-machine/src/index.js";

export type { SessionState };

export async function parseJsonlFile(filePath: string): Promise<EventEnvelope[]> {
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  const events: EventEnvelope[] = [];

  for (const line of lines) {
    const parsed = parseEvent(JSON.parse(line));
    if (parsed.ok) {
      events.push(parsed.value);
    }
  }

  return events;
}

/**
 * Parses a JSONL file and replays all valid events through the deterministic
 * state machine to reconstruct the current SessionState (STAT-FR-03).
 */
export async function rebuildStateFromFile(filePath: string): Promise<SessionState> {
  const events = await parseJsonlFile(filePath);
  return rebuildState(events);
}

export async function createIngestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  const acceptedEvents: EventEnvelope[] = [];
  let currentState: SessionState = initialSessionState("unknown");

  type PushFn = (data: string) => void;
  const sseSubscribers = new Set<PushFn>();

  function broadcastState(): void {
    const payload = `data: ${JSON.stringify(currentState)}\n\n`;
    for (const push of sseSubscribers) {
      push(payload);
    }
  }

  server.post("/events", async (request, reply) => {
    const parsed = parseEvent(request.body);
    if (!parsed.ok) {
      return reply.status(400).send({ ok: false, error: parsed.error });
    }
    acceptedEvents.push(parsed.value);
    if (currentState.sessionId === "unknown") {
      currentState = initialSessionState(parsed.value.sessionId);
    }
    currentState = reduceEvent(currentState, parsed.value);
    broadcastState();
    return reply.send({ ok: true });
  });

  server.get("/events", async () => {
    return { count: acceptedEvents.length, events: acceptedEvents };
  });

  /**
   * GET /state/stream — SSE endpoint for real-time state push (LIVE-FR-03).
   * Immediately emits the current SessionState on connect, then streams updates
   * as events are ingested via POST /events.
   */
  server.get("/state/stream", (request, reply) => {
    const stream = new PassThrough();

    void reply
      .type("text/event-stream")
      .header("Cache-Control", "no-cache")
      .header("Connection", "keep-alive")
      .header("Access-Control-Allow-Origin", "*")
      .send(stream);

    stream.write(`data: ${JSON.stringify(currentState)}\n\n`);

    const pushFn: PushFn = (data) => {
      if (!stream.destroyed) stream.write(data);
    };
    sseSubscribers.add(pushFn);

    request.raw.on("close", () => {
      sseSubscribers.delete(pushFn);
      if (!stream.destroyed) stream.destroy();
    });
  });

  return server;
}
