import { describe, expect, it } from "vitest";
import { matchHookFilename, updateEjsHooksManifest, updateHookManifest } from "../bootstrap-existing-repo.js";

describe("matchHookFilename", () => {
  it("matches exact canonical names", () => {
    expect(matchHookFilename("session-start.sh")).toBeDefined();
    expect(matchHookFilename("session-start.sh")?.eventType).toBe("sessionStart");
  });

  it("matches case-insensitively", () => {
    expect(matchHookFilename("Session-Start.sh")).toBeDefined();
    expect(matchHookFilename("SESSION-START.SH")?.eventType).toBe("sessionStart");
  });

  it("matches joined variants", () => {
    expect(matchHookFilename("sessionstart.sh")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("sessionend.sh")?.eventType).toBe("sessionEnd");
  });

  it("returns undefined for unrecognized filenames", () => {
    expect(matchHookFilename("unrelated.sh")).toBeUndefined();
    expect(matchHookFilename("random-hook.sh")).toBeUndefined();
  });

  it("matches prefixed filenames when prefix is provided", () => {
    expect(matchHookFilename("viz-session-start.sh", "viz")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("copilot-pre-tool-use.sh", "copilot")?.eventType).toBe("preToolUse");
    expect(matchHookFilename("my-prefix-log-prompt.sh", "my-prefix")?.eventType).toBe("userPromptSubmitted");
  });

  it("does not match prefixed filenames without prefix argument", () => {
    expect(matchHookFilename("viz-session-start.sh")).toBeUndefined();
  });

  it("still matches direct names even when prefix is provided", () => {
    expect(matchHookFilename("session-start.sh", "viz")?.eventType).toBe("sessionStart");
  });

  it("extracts basename from paths with subdirectories", () => {
    expect(matchHookFilename("copilot/session-start.sh")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("nested/deep/pre-tool-use.sh")?.eventType).toBe("preToolUse");
  });

  it("matches prefixed filenames in subdirectories", () => {
    expect(matchHookFilename("copilot/viz-session-start.sh", "viz")?.eventType).toBe("sessionStart");
  });

  it("matches all canonical hook names", () => {
    const canonical = [
      ["session-start.sh", "sessionStart"],
      ["session-end.sh", "sessionEnd"],
      ["subagent-start.sh", "subagentStart"],
      ["subagent-stop.sh", "subagentStop"],
      ["log-prompt.sh", "userPromptSubmitted"],
      ["pre-tool-use.sh", "preToolUse"],
      ["post-tool-use.sh", "postToolUse"],
    ] as const;

    for (const [filename, expectedEventType] of canonical) {
      const result = matchHookFilename(filename);
      expect(result, `${filename} should match`).toBeDefined();
      expect(result?.eventType).toBe(expectedEventType);
    }
  });

  it("uses resilient subagent-start fallbacks for agent metadata", () => {
    const mapping = matchHookFilename("subagent-start.sh");

    expect(mapping).toBeDefined();
    expect(mapping?.payloadSnippet).toContain("AGENT_NAME");
    expect(mapping?.payloadSnippet).toContain("SUBAGENT_NAME");
    expect(mapping?.payloadSnippet).toContain("AGENT_DISPLAY_NAME");
    expect(mapping?.payloadSnippet).toContain("SUBAGENT_DISPLAY_NAME");
    expect(mapping?.payloadSnippet).toContain("AGENT_DESCRIPTION");
    expect(mapping?.payloadSnippet).toContain("TASK_DESC");
    expect(mapping?.payloadSnippet).toContain('"agentDescription":$description');
    expect(mapping?.payloadSnippet).toContain('"summary":$message');
  });
});

describe("updateEjsHooksManifest", () => {
  it("adds missing mapped events without changing existing ones", () => {
    const manifest = {
      version: 1,
      hooks: {
        sessionStart: [
          {
            type: "command",
            bash: "./.github/hooks/session-start.sh",
            cwd: ".",
            timeoutSec: 15,
          },
        ],
        subagentStop: [
          {
            type: "command",
            bash: "./.github/hooks/subagent-stop.sh",
            cwd: ".",
            timeoutSec: 10,
          },
        ],
      },
    };

    const { updated, addedEvents } = updateEjsHooksManifest(manifest, [
      "sessionStart",
      "subagentStart",
      "subagentStop",
    ]);

    expect(addedEvents).toEqual(["subagentStart"]);
    const hooks = updated.hooks as Record<string, unknown>;
    const startCommands = hooks.subagentStart as Array<Record<string, unknown>>;
    expect(startCommands[0]?.bash).toBe("./.github/hooks/subagent-start.sh");
    expect(startCommands[0]?.timeoutSec).toBe(10);

    const sessionCommands = hooks.sessionStart as Array<Record<string, unknown>>;
    expect(sessionCommands[0]?.bash).toBe("./.github/hooks/session-start.sh");
  });

  it("supports prefixed hook filenames", () => {
    const { updated, addedEvents } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      ["sessionStart", "subagentStart"],
      "viz"
    );

    expect(addedEvents).toEqual(["sessionStart", "subagentStart"]);
    const hooks = updated.hooks as Record<string, unknown>;
    const sessionCommands = hooks.sessionStart as Array<Record<string, unknown>>;
    const subagentCommands = hooks.subagentStart as Array<Record<string, unknown>>;
    expect(sessionCommands[0]?.bash).toBe("./.github/hooks/viz-session-start.sh");
    expect(subagentCommands[0]?.bash).toBe("./.github/hooks/viz-subagent-start.sh");
  });

  it("initializes hooks object when manifest shape is incomplete", () => {
    const { updated, addedEvents } = updateEjsHooksManifest({}, ["userPromptSubmitted"]);

    expect(addedEvents).toEqual(["userPromptSubmitted"]);
    expect((updated.hooks as Record<string, unknown>).userPromptSubmitted).toBeDefined();
  });

  it("exports the generic updater alias", () => {
    const { updated, addedEvents } = updateHookManifest(
      { version: 1, hooks: {} },
      ["subagentStart"]
    );

    expect(addedEvents).toEqual(["subagentStart"]);
    const hooks = updated.hooks as Record<string, unknown>;
    const subagentCommands = hooks.subagentStart as Array<Record<string, unknown>>;
    expect(subagentCommands[0]?.bash).toBe("./.github/hooks/subagent-start.sh");
  });
});
