#!/usr/bin/env node

/**
 * Emits a JSON configuration payload listing lifecycle hooks expected by the
 * foundation emitter. This script is intentionally transport-agnostic.
 *
 * During bootstrap, these hooks are also written to .github/hooks/visualizer-hooks.json
 * in the target repo — that manifest is the canonical source of truth for which
 * events the visualizer captures at runtime.
 */
const hooks = [
  "sessionStart",
  "sessionEnd",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "subagentStart",
  "subagentStop",
  "agentStop",
  "notification",
  "errorOccurred"
];

process.stdout.write(JSON.stringify({ hooks, manifest: "visualizer-hooks.json" }, null, 2));
