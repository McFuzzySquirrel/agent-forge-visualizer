import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIngestServer } from "../packages/ingest-service/src/index.js";
import { emitEvent } from "../packages/hook-emitter/src/index.js";

interface EventsResponse {
  count: number;
  events: Array<{ eventType: string; sessionId: string }>;
}

async function run(): Promise<void> {
  const server = await createIngestServer();
  const tempDir = await mkdtemp(join(tmpdir(), "visualizer-smoke-"));
  const jsonlPath = join(tempDir, "events.jsonl");

  try {
    await server.listen({ host: "127.0.0.1", port: 0 });
    const address = server.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    if (!port) {
      throw new Error("Failed to resolve ingest-service port");
    }

    const sessionId = "smoke-session";
    const options = {
      jsonlPath,
      repoPath: process.cwd(),
      sessionId,
      httpEndpoint: `http://127.0.0.1:${port}/events`
    };

    await emitEvent("sessionStart", {}, options);
    await emitEvent("preToolUse", { toolName: "bash", toolArgs: { command: "echo smoke" } }, options);
    await emitEvent("postToolUse", { toolName: "bash", status: "success", durationMs: 5 }, options);
    await emitEvent("sessionEnd", {}, options);

    const eventsResponse = await fetch(`http://127.0.0.1:${port}/events`);
    if (!eventsResponse.ok) {
      throw new Error(`GET /events failed with ${eventsResponse.status}`);
    }

    const body = (await eventsResponse.json()) as EventsResponse;
    if (body.count !== 4) {
      throw new Error(`Expected 4 ingested events, received ${body.count}`);
    }

    const expectedOrder = ["sessionStart", "preToolUse", "postToolUse", "sessionEnd"];
    const actualOrder = body.events.map((event) => event.eventType);
    if (expectedOrder.join(",") !== actualOrder.join(",")) {
      throw new Error(`Unexpected event order: ${actualOrder.join(" -> ")}`);
    }

    const streamResponse = await fetch(`http://127.0.0.1:${port}/state/stream`, {
      headers: { Accept: "text/event-stream" },
      signal: AbortSignal.timeout(2000)
    });

    if (!streamResponse.ok || !streamResponse.body) {
      throw new Error(`GET /state/stream failed with ${streamResponse.status}`);
    }

    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    const firstChunk = await reader.read();
    await reader.cancel();

    const streamText = decoder.decode(firstChunk.value ?? new Uint8Array());
    if (!streamText.includes(`\"sessionId\":\"${sessionId}\"`) || !streamText.includes("\"lifecycle\":\"completed\"")) {
      throw new Error(`Unexpected state stream payload: ${streamText}`);
    }

    console.log("SMOKE_OK: emitter -> ingest -> state stream flow verified");
  } finally {
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

await run();
