import { describe, expect, it } from "vitest";
import { matchHookFilename } from "../bootstrap-existing-repo.js";

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
});
