#!/usr/bin/env node
import { mkdir, access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";

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

  console.log(`Bootstrapped visualizer integration in: ${vizDir}`);
  console.log("Next steps:");
  console.log("1) chmod +x .visualizer/emit-event.sh");
  console.log("2) wire your agent lifecycle hooks to call .visualizer/emit-event.sh");
  console.log("3) run visualizer ingest + web UI and execute your workflow");
}

void main();
