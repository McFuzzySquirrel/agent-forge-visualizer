#!/usr/bin/env node
import { mkdir, access, writeFile, readFile, readdir, chmod } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, basename } from "node:path";

function fail(message: string): never {
  console.error(`bootstrap-existing-repo error: ${message}`);
  process.exit(1);
}

function usage(): string {
  return [
    "Usage:",
    "  npm run bootstrap:repo -- /absolute/path/to/target-repo",
    "",
    "What this creates in target repo:",
    "  .visualizer/emit-event.sh",
    "  .visualizer/visualizer.config.json",
    "  .visualizer/HOOK_INTEGRATION.md"
  ].join("\n");
}

async function ensureExists(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch {
    fail(`target repo does not exist: ${path}`);
  }
}

async function main(): Promise<void> {
  const targetArg = process.argv[2];
  if (!targetArg || targetArg === "-h" || targetArg === "--help") {
    console.log(usage());
    process.exit(targetArg ? 0 : 1);
  }

  const visualizerRoot = resolve(process.cwd());
  const targetRepo = resolve(targetArg);

  await ensureExists(targetRepo);

  const vizDir = join(targetRepo, ".visualizer");
  const logsDir = join(vizDir, "logs");
  await mkdir(logsDir, { recursive: true });

  const configPath = join(vizDir, "visualizer.config.json");
  const emitScriptPath = join(vizDir, "emit-event.sh");
  const guidePath = join(vizDir, "HOOK_INTEGRATION.md");

  const config = {
    visualizerRoot,
    repoPath: targetRepo,
    jsonlPath: ".visualizer/logs/events.jsonl",
    httpEndpoint: "http://127.0.0.1:7070/events",
    source: "copilot-cli",
    storePrompts: false
  };

  const emitScript = `#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: .visualizer/emit-event.sh <eventType> <payload-json> <sessionId>" >&2
  exit 1
fi

EVENT_TYPE="$1"
PAYLOAD_JSON="$2"
SESSION_ID="$3"

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VISUALIZER_ROOT="${visualizerRoot}"
JSONL_PATH="$REPO_ROOT/.visualizer/logs/events.jsonl"
HTTP_ENDPOINT="\${VISUALIZER_HTTP_ENDPOINT:-http://127.0.0.1:7070/events}"
STORE_PROMPTS="\${VISUALIZER_STORE_PROMPTS:-false}"

npx tsx "$VISUALIZER_ROOT/scripts/emit-event-cli.ts" \
  --eventType "$EVENT_TYPE" \
  --payload "$PAYLOAD_JSON" \
  --sessionId "$SESSION_ID" \
  --repoPath "$REPO_ROOT" \
  --jsonlPath "$JSONL_PATH" \
  --httpEndpoint "$HTTP_ENDPOINT" \
  --storePrompts "$STORE_PROMPTS"
`;

  const guide = `# Visualizer Hook Integration

This repo was bootstrapped for Copilot Agent Activity Visualizer.

## Generated Files
- .visualizer/emit-event.sh
- .visualizer/visualizer.config.json
- .visualizer/logs/events.jsonl (created on first emit)

## Emit Command
Use this in your automation/hooks:

\`\`\`bash
.visualizer/emit-event.sh <eventType> '<payload-json>' <sessionId>
\`\`\`

Example:

\`\`\`bash
SESSION_ID="run-$(date +%s)"
.visualizer/emit-event.sh sessionStart '{}' "$SESSION_ID"
.visualizer/emit-event.sh preToolUse '{"toolName":"bash","toolArgs":{"command":"npm test"}}' "$SESSION_ID"
.visualizer/emit-event.sh postToolUse '{"toolName":"bash","status":"success","durationMs":1200}' "$SESSION_ID"
.visualizer/emit-event.sh sessionEnd '{}' "$SESSION_ID"
\`\`\`

## Event Types
sessionStart, sessionEnd, userPromptSubmitted, preToolUse, postToolUse,
postToolUseFailure, subagentStart, subagentStop, agentStop, notification,
errorOccurred

## Live Viewing
1. Start the ingest service from the visualizer repo:
   npm run serve:ingest   (from ${visualizerRoot})
2. Start the web UI from the visualizer repo:
   npm run dev --workspace=packages/web-ui
3. Run your multi-agent workflow with hook emits enabled.
4. Open http://127.0.0.1:5173 to observe live activity.

## Offline / JSONL-Only Mode
If the ingest service is NOT running, emit-event.sh still writes all events to
.visualizer/logs/events.jsonl and exits cleanly — no lost events.
Start the ingest service later and replay from the JSONL file.
`;

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await writeFile(emitScriptPath, emitScript, "utf8");
  await writeFile(guidePath, guide, "utf8");

  // chmod +x the emit script automatically
  await chmod(emitScriptPath, 0o755);
  console.log(`\nBootstrapped visualizer integration in: ${vizDir}`);

  // Auto-detect and wire hooks in .github/hooks/
  await wireHooks(targetRepo);
}

/**
 * Maps hook script filenames to their visualizer event type and a
 * function that builds the JSON payload from parsed input.
 *
 * Because every repo may differ, we match on the base filename (case-insensitive)
 * and append a best-effort emit block. The block is idempotent — skipped if
 * ".visualizer/emit-event.sh" already appears in the file.
 */
const HOOK_MAP: Record<string, { eventType: string; payloadSnippet: string; sessionSnippet: string }> = {
  "session-start.sh": {
    eventType: "sessionStart",
    payloadSnippet: `$(jq -nc --arg source "\${SOURCE:-unknown}" '{"source":$source}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "sessionstart.sh": {
    eventType: "sessionStart",
    payloadSnippet: `$(jq -nc --arg source "\${SOURCE:-unknown}" '{"source":$source}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "session-end.sh": {
    eventType: "sessionEnd",
    payloadSnippet: `$(jq -nc --arg reason "\${REASON:-unknown}" '{"reason":$reason}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "sessionend.sh": {
    eventType: "sessionEnd",
    payloadSnippet: `$(jq -nc --arg reason "\${REASON:-unknown}" '{"reason":$reason}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "subagent-stop.sh": {
    eventType: "subagentStop",
    payloadSnippet: `$(jq -nc --arg agent "\${AGENT_NAME:-unknown}" --arg task "\${TASK_DESC:-}" '{"agentName":$agent,"taskDescription":$task}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "subagent-start.sh": {
    eventType: "subagentStart",
    payloadSnippet: `$(jq -nc --arg agent "\${AGENT_NAME:-unknown}" '{"agentName":$agent}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "log-prompt.sh": {
    eventType: "userPromptSubmitted",
    payloadSnippet: `$(jq -nc --arg prompt "\${PROMPT:-}" '{"prompt":$prompt}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "pre-tool-use.sh": {
    eventType: "preToolUse",
    payloadSnippet: `$(jq -nc --arg tool "\${TOOL_NAME:-unknown}" '{"toolName":$tool}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "post-tool-use.sh": {
    eventType: "postToolUse",
    payloadSnippet: `$(jq -nc --arg tool "\${TOOL_NAME:-unknown}" --arg status "\${STATUS:-unknown}" '{"toolName":$tool,"status":$status}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
};

function buildEmitBlock(emitScriptRelPath: string, eventType: string, payloadSnippet: string, sessionSnippet: string): string {
  return [
    ``,
    `# --- Visualizer emit (auto-wired by bootstrap-existing-repo) ---`,
    `if [ -x "\${REPO_ROOT}/${emitScriptRelPath}" ]; then`,
    `  _VIZ_PAYLOAD=${payloadSnippet}`,
    `  "\${REPO_ROOT}/${emitScriptRelPath}" ${eventType} "\${_VIZ_PAYLOAD}" ${sessionSnippet} >&2 || true`,
    `fi`,
  ].join("\n");
}

async function wireHooks(targetRepo: string): Promise<void> {
  const hooksDir = join(targetRepo, ".github", "hooks");

  let hookFiles: string[];
  try {
    hookFiles = await readdir(hooksDir);
  } catch {
    console.log("\nNo .github/hooks/ directory found — skipping hook wiring.");
    console.log("To wire manually, see .visualizer/HOOK_INTEGRATION.md");
    return;
  }

  const shFiles = hookFiles.filter((f) => f.endsWith(".sh"));
  if (shFiles.length === 0) {
    console.log("\nNo .sh files found in .github/hooks/ — skipping hook wiring.");
    return;
  }

  console.log(`\nAuto-wiring hooks in ${hooksDir}:`);
  let wired = 0;
  let skipped = 0;

  for (const filename of shFiles) {
    const key = filename.toLowerCase();
    const mapping = HOOK_MAP[key];
    if (!mapping) {
      console.log(`  SKIP  ${filename} — no event type mapping (add manually if needed)`);
      skipped += 1;
      continue;
    }

    const hookPath = join(hooksDir, filename);
    const content = await readFile(hookPath, "utf8");

    if (content.includes(".visualizer/emit-event.sh")) {
      console.log(`  OK    ${filename} — already wired`);
      skipped += 1;
      continue;
    }

    const emitBlock = buildEmitBlock(
      ".visualizer/emit-event.sh",
      mapping.eventType,
      mapping.payloadSnippet,
      mapping.sessionSnippet
    );

    // Insert before the final `exit 0` if present, otherwise append
    const exitPattern = /^exit 0\s*$/m;
    const updated = exitPattern.test(content)
      ? content.replace(exitPattern, `${emitBlock}\n\nexit 0`)
      : content + emitBlock + "\n";

    await writeFile(hookPath, updated, "utf8");
    console.log(`  WIRED ${filename} → ${mapping.eventType}`);
    wired += 1;
  }

  console.log(`\nHook wiring complete: ${wired} wired, ${skipped} skipped.`);
  console.log("\nNext steps:");
  console.log("  1) Start the ingest service:   npm run serve:ingest  (from visualizer repo)");
  console.log("  2) Start the web UI:            npm run dev --workspace=packages/web-ui");
  console.log("  3) Run your agent workflow — events appear live at http://127.0.0.1:5173");
}

void main();
