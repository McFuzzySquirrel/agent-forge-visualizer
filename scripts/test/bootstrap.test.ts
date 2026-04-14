import { describe, expect, it } from "vitest";
import { matchHookFilename, updateEjsHooksManifest, updateHookManifest, VISUALIZER_MANIFEST_NAME, VISUALIZER_HOOKS_SUBDIR } from "../bootstrap-existing-repo.js";

describe("matchHookFilename", () => {
  it("matches exact canonical names", () => {
    expect(matchHookFilename("session-start.sh")).toBeDefined();
    expect(matchHookFilename("session-start.sh")?.eventType).toBe("sessionStart");
  });

  it("matches .ps1 canonical names", () => {
    expect(matchHookFilename("session-start.ps1")).toBeDefined();
    expect(matchHookFilename("session-start.ps1")?.eventType).toBe("sessionStart");
  });

  it("matches case-insensitively", () => {
    expect(matchHookFilename("Session-Start.sh")).toBeDefined();
    expect(matchHookFilename("SESSION-START.SH")?.eventType).toBe("sessionStart");
  });

  it("matches .ps1 case-insensitively", () => {
    expect(matchHookFilename("Session-Start.PS1")).toBeDefined();
    expect(matchHookFilename("SESSION-START.PS1")?.eventType).toBe("sessionStart");
  });

  it("matches joined variants", () => {
    expect(matchHookFilename("sessionstart.sh")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("sessionend.sh")?.eventType).toBe("sessionEnd");
  });

  it("matches joined .ps1 variants", () => {
    expect(matchHookFilename("sessionstart.ps1")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("sessionend.ps1")?.eventType).toBe("sessionEnd");
  });

  it("returns undefined for unrecognized filenames", () => {
    expect(matchHookFilename("unrelated.sh")).toBeUndefined();
    expect(matchHookFilename("random-hook.sh")).toBeUndefined();
    expect(matchHookFilename("unrelated.ps1")).toBeUndefined();
  });

  it("matches prefixed filenames when prefix is provided", () => {
    expect(matchHookFilename("viz-session-start.sh", "viz")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("copilot-pre-tool-use.sh", "copilot")?.eventType).toBe("preToolUse");
    expect(matchHookFilename("my-prefix-log-prompt.sh", "my-prefix")?.eventType).toBe("userPromptSubmitted");
  });

  it("matches prefixed .ps1 filenames when prefix is provided", () => {
    expect(matchHookFilename("viz-session-start.ps1", "viz")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("copilot-pre-tool-use.ps1", "copilot")?.eventType).toBe("preToolUse");
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

  it("extracts basename from .ps1 paths with subdirectories", () => {
    expect(matchHookFilename("copilot/session-start.ps1")?.eventType).toBe("sessionStart");
    expect(matchHookFilename("nested/deep/pre-tool-use.ps1")?.eventType).toBe("preToolUse");
  });

  it("matches prefixed filenames in subdirectories", () => {
    expect(matchHookFilename("copilot/viz-session-start.sh", "viz")?.eventType).toBe("sessionStart");
  });

  it("matches all canonical hook names", () => {
    const canonical = [
      ["session-start.sh", "sessionStart"],
      ["session-end.sh", "sessionEnd"],
      ["subagent-stop.sh", "subagentStop"],
      ["log-prompt.sh", "userPromptSubmitted"],
      ["pre-tool-use.sh", "preToolUse"],
      ["post-tool-use.sh", "postToolUse"],
      ["agent-stop.sh", "agentStop"],
      ["error-occurred.sh", "errorOccurred"],
    ] as const;

    for (const [filename, expectedEventType] of canonical) {
      const result = matchHookFilename(filename);
      expect(result, `${filename} should match`).toBeDefined();
      expect(result?.eventType).toBe(expectedEventType);
    }
  });

  it("matches all canonical .ps1 hook names", () => {
    const canonical = [
      ["session-start.ps1", "sessionStart"],
      ["session-end.ps1", "sessionEnd"],
      ["subagent-stop.ps1", "subagentStop"],
      ["log-prompt.ps1", "userPromptSubmitted"],
      ["pre-tool-use.ps1", "preToolUse"],
      ["post-tool-use.ps1", "postToolUse"],
      ["agent-stop.ps1", "agentStop"],
      ["error-occurred.ps1", "errorOccurred"],
    ] as const;

    for (const [filename, expectedEventType] of canonical) {
      const result = matchHookFilename(filename);
      expect(result, `${filename} should match`).toBeDefined();
      expect(result?.eventType).toBe(expectedEventType);
    }
  });

  it("does not match unsupported hook names (subagentStart, postToolUseFailure, notification)", () => {
    // These are internal event types, NOT real Copilot CLI hooks
    expect(matchHookFilename("subagent-start.sh")).toBeUndefined();
    expect(matchHookFilename("subagent-start.ps1")).toBeUndefined();
    expect(matchHookFilename("post-tool-use-failure.sh")).toBeUndefined();
    expect(matchHookFilename("post-tool-use-failure.ps1")).toBeUndefined();
    expect(matchHookFilename("notification.sh")).toBeUndefined();
    expect(matchHookFilename("notification.ps1")).toBeUndefined();
  });

  it("matches new event types with correct payload snippets", () => {
    const agentStop = matchHookFilename("agent-stop.sh");
    expect(agentStop).toBeDefined();
    expect(agentStop?.eventType).toBe("agentStop");
    expect(agentStop?.payloadSnippet).toContain("AGENT_NAME");

    const error = matchHookFilename("error-occurred.sh");
    expect(error).toBeDefined();
    expect(error?.eventType).toBe("errorOccurred");
    expect(error?.payloadSnippet).toContain("MESSAGE");
    expect(error?.payloadSnippet).toContain("CODE");
  });

  it("matches supported event types with prefix", () => {
    expect(matchHookFilename("viz-agent-stop.sh", "viz")?.eventType).toBe("agentStop");
    expect(matchHookFilename("viz-error-occurred.sh", "viz")?.eventType).toBe("errorOccurred");
  });

  it("does not match unsupported event types with prefix", () => {
    expect(matchHookFilename("viz-post-tool-use-failure.sh", "viz")).toBeUndefined();
    expect(matchHookFilename("viz-notification.sh", "viz")).toBeUndefined();
    expect(matchHookFilename("viz-subagent-start.sh", "viz")).toBeUndefined();
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
      "preToolUse",
      "subagentStop",
    ]);

    expect(addedEvents).toEqual(["preToolUse"]);
    const hooks = updated.hooks as Record<string, unknown>;
    const toolCommands = hooks.preToolUse as Array<Record<string, unknown>>;
    expect(toolCommands[0]?.bash).toBe(`./.github/hooks/visualizer/pre-tool-use.sh`);
    expect(toolCommands[0]?.timeoutSec).toBe(10);

    const sessionCommands = hooks.sessionStart as Array<Record<string, unknown>>;
    expect(sessionCommands[0]?.bash).toBe("./.github/hooks/session-start.sh");
  });

  it("supports prefixed hook filenames", () => {
    const { updated, addedEvents } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      ["sessionStart", "preToolUse"],
      "viz"
    );

    expect(addedEvents).toEqual(["sessionStart", "preToolUse"]);
    const hooks = updated.hooks as Record<string, unknown>;
    const sessionCommands = hooks.sessionStart as Array<Record<string, unknown>>;
    const toolCommands = hooks.preToolUse as Array<Record<string, unknown>>;
    expect(sessionCommands[0]?.bash).toBe("./.github/hooks/visualizer/viz-session-start.sh");
    expect(toolCommands[0]?.bash).toBe("./.github/hooks/visualizer/viz-pre-tool-use.sh");
  });

  it("initializes hooks object when manifest shape is incomplete", () => {
    const { updated, addedEvents } = updateEjsHooksManifest({}, ["userPromptSubmitted"]);

    expect(addedEvents).toEqual(["userPromptSubmitted"]);
    expect((updated.hooks as Record<string, unknown>).userPromptSubmitted).toBeDefined();
  });

  it("exports the generic updater alias", () => {
    const { updated, addedEvents } = updateHookManifest(
      { version: 1, hooks: {} },
      ["preToolUse"]
    );

    expect(addedEvents).toEqual(["preToolUse"]);
    const hooks = updated.hooks as Record<string, unknown>;
    const toolCommands = hooks.preToolUse as Array<Record<string, unknown>>;
    expect(toolCommands[0]?.bash).toBe("./.github/hooks/visualizer/pre-tool-use.sh");
  });

  it("generates manifest commands for all 8 supported Copilot CLI hook types", () => {
    const allEvents = [
      "sessionStart",
      "sessionEnd",
      "userPromptSubmitted",
      "preToolUse",
      "postToolUse",
      "subagentStop",
      "agentStop",
      "errorOccurred",
    ];

    const { updated, addedEvents } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      allEvents
    );

    expect(addedEvents).toEqual(allEvents);
    const hooks = updated.hooks as Record<string, unknown>;
    for (const eventType of allEvents) {
      const commands = hooks[eventType] as Array<Record<string, unknown>>;
      expect(commands, `${eventType} should have commands`).toBeDefined();
      expect(commands).toHaveLength(1);
      expect(commands[0]?.type).toBe("command");
      expect(commands[0]?.bash).toMatch(/^\.\/\.github\/hooks\/visualizer\//);
    }
  });

  it("includes powershell property in manifest commands", () => {
    const { updated } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      ["sessionStart", "preToolUse"]
    );

    const hooks = updated.hooks as Record<string, unknown>;
    const sessionCommands = hooks.sessionStart as Array<Record<string, unknown>>;
    expect(sessionCommands[0]?.powershell).toBe("./.github/hooks/visualizer/session-start.ps1");
    const toolCommands = hooks.preToolUse as Array<Record<string, unknown>>;
    expect(toolCommands[0]?.powershell).toBe("./.github/hooks/visualizer/pre-tool-use.ps1");
  });

  it("includes prefixed powershell property in manifest commands", () => {
    const { updated } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      ["sessionStart", "preToolUse"],
      "viz"
    );

    const hooks = updated.hooks as Record<string, unknown>;
    const sessionCommands = hooks.sessionStart as Array<Record<string, unknown>>;
    expect(sessionCommands[0]?.powershell).toBe("./.github/hooks/visualizer/viz-session-start.ps1");
    const toolCommands = hooks.preToolUse as Array<Record<string, unknown>>;
    expect(toolCommands[0]?.powershell).toBe("./.github/hooks/visualizer/viz-pre-tool-use.ps1");
  });

  it("generates powershell paths for all 8 supported Copilot CLI hook types", () => {
    const allEvents = [
      "sessionStart",
      "sessionEnd",
      "userPromptSubmitted",
      "preToolUse",
      "postToolUse",
      "subagentStop",
      "agentStop",
      "errorOccurred",
    ];

    const { updated } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      allEvents
    );

    const hooks = updated.hooks as Record<string, unknown>;
    for (const eventType of allEvents) {
      const commands = hooks[eventType] as Array<Record<string, unknown>>;
      expect(commands[0]?.powershell, `${eventType} should have powershell path`).toMatch(/^\.\/\.github\/hooks\/visualizer\/.*\.ps1$/);
    }
  });

  it("uses correct hook filenames for supported event types", () => {
    const { updated } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      ["agentStop", "errorOccurred"]
    );

    const hooks = updated.hooks as Record<string, unknown>;
    expect((hooks.agentStop as Array<Record<string, unknown>>)[0]?.bash).toBe("./.github/hooks/visualizer/agent-stop.sh");
    expect((hooks.errorOccurred as Array<Record<string, unknown>>)[0]?.bash).toBe("./.github/hooks/visualizer/error-occurred.sh");
  });

  it("uses correct prefixed filenames for supported event types", () => {
    const { updated } = updateEjsHooksManifest(
      { version: 1, hooks: {} },
      ["agentStop", "errorOccurred"],
      "viz"
    );

    const hooks = updated.hooks as Record<string, unknown>;
    expect((hooks.agentStop as Array<Record<string, unknown>>)[0]?.bash).toBe("./.github/hooks/visualizer/viz-agent-stop.sh");
    expect((hooks.errorOccurred as Array<Record<string, unknown>>)[0]?.bash).toBe("./.github/hooks/visualizer/viz-error-occurred.sh");
  });
});

describe("VISUALIZER_MANIFEST_NAME", () => {
  it("exports the manifest filename constant", () => {
    expect(VISUALIZER_MANIFEST_NAME).toBe("visualizer-hooks.json");
  });
});

describe("VISUALIZER_HOOKS_SUBDIR", () => {
  it("exports the hooks subdirectory constant", () => {
    expect(VISUALIZER_HOOKS_SUBDIR).toBe("visualizer");
  });
});
