import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { emitEvent } from "../../hook-emitter/src/index.js";
import { createIngestServer, parseJsonlFile, rebuildStateFromFile } from "../src/index.js";

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

describe("SSE /state/stream (LIVE-FR-01, LIVE-FR-03)", () => {
  function getPort(server: Awaited<ReturnType<typeof createIngestServer>>): number {
    const addr = server.server.address();
    return typeof addr === "object" && addr ? addr.port : 0;
  }

  it("returns text/event-stream content-type and initial state on connect", async () => {
    const server = await createIngestServer();
    await server.listen({ host: "127.0.0.1", port: 0 });
    const port = getPort(server);

    const firstChunk = await new Promise<string>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/state/stream" }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/event-stream");
        res.once("data", (chunk: Buffer) => {
          req.destroy();
          resolve(chunk.toString());
        });
        res.once("error", reject);
      });
      req.on("error", reject);
      req.end();
    });

    expect(firstChunk.trim()).toMatch(/^data: /);
    const payload = firstChunk.replace(/^data: /, "").trim();
    const state = JSON.parse(payload) as { lifecycle: string };
    expect(state.lifecycle).toBe("not_started");

    await server.close();
  });

  it("broadcasts updated state to SSE subscribers after event ingest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sse-"));
    const jsonlPath = join(dir, "events.jsonl");
    const server = await createIngestServer();
    await server.listen({ host: "127.0.0.1", port: 0 });
    const port = getPort(server);

    // Collect up to 2 data chunks (initial state + state after event)
    const chunks: string[] = [];
    const gotUpdate = new Promise<void>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/state/stream" }, (res) => {
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk.toString());
          if (chunks.length >= 2) {
            req.destroy();
            resolve();
          }
        });
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    });

    // Give SSE connection a moment to establish, then post an event
    await new Promise<void>((r) => setTimeout(r, 30));
    await emitEvent("sessionStart", {}, {
      jsonlPath,
      repoPath: "/tmp/repo",
      sessionId: "sse-sess",
      httpEndpoint: `http://127.0.0.1:${port}/events`
    });

    await gotUpdate;

    // Second chunk should carry the updated state after sessionStart
    const secondPayload = chunks[1]?.replace(/^data: /, "").trim() ?? "{}";
    const updatedState = JSON.parse(secondPayload) as { lifecycle: string; sessionId: string };
    expect(updatedState.lifecycle).toBe("active");
    expect(updatedState.sessionId).toBe("sse-sess");

    await server.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe("rebuildStateFromFile (STAT-FR-03)", () => {
  it("rebuilds session state from a JSONL log file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "rebuild-"));
    const jsonlPath = join(dir, "events.jsonl");
    const opts = { jsonlPath, repoPath: "/tmp/repo", sessionId: "rebuild-sess" };

    await emitEvent("sessionStart", {}, opts);
    await emitEvent("preToolUse", { toolName: "bash", toolArgs: { command: "ls" } }, opts);
    await emitEvent("postToolUse", { toolName: "bash", status: "success", durationMs: 5 }, opts);

    const state = await rebuildStateFromFile(jsonlPath);

    expect(state.sessionId).toBe("rebuild-sess");
    expect(state.lifecycle).toBe("active");
    expect(state.visualization).toBe("tool_succeeded");
    expect(state.currentTool?.toolName).toBe("bash");
    expect(state.eventCount).toBe(3);

    await rm(dir, { recursive: true, force: true });
  });
});

describe("SSE state stream (LIVE-FR-01 / LIVE-FR-03)", () => {
  it("emits initial state and then pushes updated state after event ingestion", async () => {
    const server = await createIngestServer();
    await server.listen({ host: "127.0.0.1", port: 0 });
    const addr = server.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    const firstChunk = await new Promise<string>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port,
          path: "/state/stream",
          method: "GET",
          headers: { Accept: "text/event-stream" }
        },
        (res) => {
          res.setEncoding("utf8");
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
            if (data.includes("\n\n")) {
              resolve(data);
              req.destroy();
            }
          });
          res.on("error", reject);
        }
      );
      req.on("error", reject);
      req.end();
    });

    expect(firstChunk).toContain('data: {"sessionId":"unknown"');

    await emitEvent("sessionStart", {}, {
      jsonlPath: join(tmpdir(), "sse-live.jsonl"),
      repoPath: "/tmp/repo",
      sessionId: "live-sess",
      httpEndpoint: `http://127.0.0.1:${port}/events`
    });

    const updated = await fetch(`http://127.0.0.1:${port}/events`);
    const body = (await updated.json()) as { count: number };
    expect(body.count).toBe(1);

    await server.close();
  });
});
