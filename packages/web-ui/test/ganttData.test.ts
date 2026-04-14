import { describe, it, expect } from "vitest";
import { buildGanttData, computeTimeRange } from "../src/ganttData.js";
import type { EventEnvelope } from "../../../shared/event-schema/src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = "sess-gantt-01";
const REPO = "/tmp/gantt-repo";
let seq = 0;
let timeCounter = Date.now();

function nextId(): string {
  return `0000000${++seq}-0000-4000-8000-000000000000`;
}
function ts(): string {
  timeCounter += 1000;
  return new Date(timeCounter).toISOString();
}

function makeEvent<T extends EventEnvelope["eventType"]>(
  eventType: T,
  payload: Extract<EventEnvelope, { eventType: T }>["payload"]
): Extract<EventEnvelope, { eventType: T }> {
  return {
    schemaVersion: "1.0.0",
    eventId: nextId(),
    eventType,
    timestamp: ts(),
    sessionId: SESSION_ID,
    source: "copilot-cli" as const,
    repoPath: REPO,
    payload,
  } as Extract<EventEnvelope, { eventType: T }>;
}

// ---------------------------------------------------------------------------
// buildGanttData
// ---------------------------------------------------------------------------

describe("buildGanttData", () => {
  it("creates session, tool, and subagent rows from a complete event sequence", () => {
    const events: EventEnvelope[] = [
      makeEvent("sessionStart", {}),
      makeEvent("preToolUse", { toolName: "bash" }),
      makeEvent("postToolUse", { toolName: "bash", status: "success" }),
      makeEvent("sessionEnd", {}),
    ];
    const rows = buildGanttData(events);

    expect(rows.length).toBe(2); // session + tool:bash
    expect(rows[0].rowId).toBe("session");
    expect(rows[1].rowId).toBe("tool:bash");
    expect(rows[1].label).toBe("Tool: bash");
  });

  it("marks tool as running when only preToolUse is received", () => {
    const events: EventEnvelope[] = [
      makeEvent("sessionStart", {}),
      makeEvent("preToolUse", { toolName: "grep" }),
    ];
    const rows = buildGanttData(events);
    const toolRow = rows.find((r) => r.rowId === "tool:grep");

    expect(toolRow).toBeDefined();
    expect(toolRow!.segments[0].status).toBe("running");
    expect(toolRow!.segments[0].endTime).toBeNull();
  });

  it("marks tool as failed on postToolUseFailure", () => {
    const events: EventEnvelope[] = [
      makeEvent("sessionStart", {}),
      makeEvent("preToolUse", { toolName: "rm" }),
      makeEvent("postToolUseFailure", {
        toolName: "rm",
        status: "failure",
        errorSummary: "Permission denied",
      }),
    ];
    const rows = buildGanttData(events);
    const toolRow = rows.find((r) => r.rowId === "tool:rm");

    expect(toolRow!.segments[0].status).toBe("failed");
    expect(toolRow!.segments[0].endTime).not.toBeNull();
  });

  it("auto-closes open tool segments when sessionEnd arrives", () => {
    const events: EventEnvelope[] = [
      makeEvent("sessionStart", {}),
      makeEvent("preToolUse", { toolName: "bash" }),
      // No postToolUse — tool is still open
      makeEvent("sessionEnd", {}),
    ];
    const rows = buildGanttData(events);
    const toolRow = rows.find((r) => r.rowId === "tool:bash");

    expect(toolRow).toBeDefined();
    expect(toolRow!.segments[0].endTime).not.toBeNull();
    expect(toolRow!.segments[0].status).toBe("succeeded");
  });

  it("auto-closes open subagent segments when sessionEnd arrives", () => {
    const events: EventEnvelope[] = [
      makeEvent("sessionStart", {}),
      makeEvent("subagentStart", { agentName: "explore" }),
      // No subagentStop — subagent is still open
      makeEvent("sessionEnd", {}),
    ];
    const rows = buildGanttData(events);
    const agentRow = rows.find((r) => r.rowId === "subagent:explore");

    expect(agentRow).toBeDefined();
    expect(agentRow!.segments[0].endTime).not.toBeNull();
    expect(agentRow!.segments[0].status).toBe("succeeded");
  });

  it("uses agentDisplayName for subagent labels when available", () => {
    const events: EventEnvelope[] = [
      makeEvent("sessionStart", {}),
      makeEvent("subagentStart", {
        agentName: "explore-id",
        agentDisplayName: "Explorer Agent",
      }),
      makeEvent("subagentStop", { agentName: "explore-id" }),
    ];
    const rows = buildGanttData(events);
    const agentRow = rows.find((r) => r.rowId === "subagent:Explorer Agent");

    expect(agentRow).toBeDefined();
    expect(agentRow!.label).toBe("Agent: Explorer Agent");
  });

  it("returns empty rows for no events", () => {
    expect(buildGanttData([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeTimeRange
// ---------------------------------------------------------------------------

describe("computeTimeRange", () => {
  it("returns [0, 0] for empty rows", () => {
    expect(computeTimeRange([])).toEqual([0, 0]);
  });

  it("computes range from completed segments", () => {
    const events: EventEnvelope[] = [
      makeEvent("sessionStart", {}),
      makeEvent("preToolUse", { toolName: "bash" }),
      makeEvent("postToolUse", { toolName: "bash", status: "success" }),
      makeEvent("sessionEnd", {}),
    ];
    const rows = buildGanttData(events);
    const [min, max] = computeTimeRange(rows);

    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThanOrEqual(min);
  });
});
