import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitEvent, emitRawAndValidate, getHookEventTypes } from "../src/index.js";

describe("hook emitter", () => {
  it("emits all MVP event types with schema-compliant envelopes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "emitter-"));
    const jsonlPath = join(dir, "events.jsonl");

    for (const eventType of getHookEventTypes()) {
      const payload = eventType === "preToolUse"
        ? { toolName: "bash", toolArgs: { command: "echo hi" } }
        : eventType === "postToolUse"
        ? { toolName: "bash", status: "success", durationMs: 5 }
        : eventType === "postToolUseFailure"
        ? { toolName: "bash", status: "failure", durationMs: 5, errorSummary: "x" }
        : eventType === "subagentStart"
        ? { agentName: "Explore" }
        : eventType === "subagentStop"
        ? { agentName: "Explore" }
        : eventType === "notification"
        ? { notificationType: "done", title: "Done", message: "Done" }
        : eventType === "errorOccurred"
        ? { message: "oops" }
        : eventType === "userPromptSubmitted"
        ? { prompt: "secret prompt" }
        : {};

      const result = await emitEvent(eventType as never, payload, {
        jsonlPath,
        repoPath: "/tmp/repo",
        sessionId: "session-1"
      });
      expect(result.accepted).toBe(true);
    }

    const lines = (await readFile(jsonlPath, "utf8")).trim().split("\n");
    expect(lines.length).toBe(getHookEventTypes().length);

    await rm(dir, { recursive: true, force: true });
  });

  it("rejects malformed records without crashing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "emitter-"));
    const jsonlPath = join(dir, "events.jsonl");

    const parsed = await emitRawAndValidate({ bad: true }, { jsonlPath });
    expect(parsed.ok).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  it("supports optional EJS metadata overlay payload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "emitter-"));
    const jsonlPath = join(dir, "events.jsonl");

    const result = await emitEvent(
      "sessionStart",
      {
        ejsMetadata: {
          journeyId: "journey-1"
        }
      },
      { jsonlPath, repoPath: "/tmp/repo", sessionId: "session-1" }
    );
    expect(result.accepted).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});
