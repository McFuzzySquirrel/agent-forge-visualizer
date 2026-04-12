import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitEvent } from "../../hook-emitter/src/index.js";
import { createIngestServer, parseJsonlFile } from "../src/index.js";

describe("ingestion inputs", () => {
  it("parses append-only JSONL logs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ingest-"));
    const jsonlPath = join(dir, "events.jsonl");

    await emitEvent("preToolUse", { toolName: "bash", toolArgs: { command: "npm test" } }, {
      jsonlPath,
      repoPath: "/tmp/repo",
      sessionId: "session-1"
    });

    const events = await parseJsonlFile(jsonlPath);
    expect(events.length).toBe(1);
    expect(events[0]?.eventType).toBe("preToolUse");

    await rm(dir, { recursive: true, force: true });
  });

  it("accepts optional localhost HTTP stream input", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ingest-"));
    const jsonlPath = join(dir, "events.jsonl");

    const server = await createIngestServer();
    await server.listen({ host: "127.0.0.1", port: 0 });
    const addr = server.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    await emitEvent("sessionStart", {}, {
      jsonlPath,
      repoPath: "/tmp/repo",
      sessionId: "session-1",
      httpEndpoint: `http://127.0.0.1:${port}/events`
    });

    const response = await fetch(`http://127.0.0.1:${port}/events`);
    const body = (await response.json()) as { count: number };
    expect(body.count).toBe(1);

    await server.close();
    await rm(dir, { recursive: true, force: true });
  });
});
