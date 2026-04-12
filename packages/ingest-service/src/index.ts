import { readFile } from "node:fs/promises";
import Fastify, { type FastifyInstance } from "fastify";
import { parseEvent, type EventEnvelope } from "../../../shared/event-schema/src/index.js";

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

export async function createIngestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  const acceptedEvents: EventEnvelope[] = [];

  server.post("/events", async (request, reply) => {
    const parsed = parseEvent(request.body);
    if (!parsed.ok) {
      return reply.status(400).send({ ok: false, error: parsed.error });
    }
    acceptedEvents.push(parsed.value);
    return reply.send({ ok: true });
  });

  server.get("/events", async () => {
    return { count: acceptedEvents.length, events: acceptedEvents };
  });

  return server;
}
