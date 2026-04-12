#!/usr/bin/env node

/**
 * Emits a JSON configuration payload listing lifecycle hooks expected by the
 * foundation emitter. This script is intentionally transport-agnostic.
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

process.stdout.write(JSON.stringify({ hooks }, null, 2));
