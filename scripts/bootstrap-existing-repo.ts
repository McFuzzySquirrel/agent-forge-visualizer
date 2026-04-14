#!/usr/bin/env node
import { mkdir, access, writeFile, readFile, readdir, chmod, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, basename, relative } from "node:path";

function fail(message: string): never {
  console.error(`bootstrap-existing-repo error: ${message}`);
  process.exit(1);
}

function usage(): string {
  return [
    "Usage:",
    "  npm run bootstrap:repo -- /absolute/path/to/target-repo [options]",
    "",
    "Options:",
    "  --prefix <name>    Prefix for hook filenames (e.g. --prefix viz creates viz-session-start.sh)",
    "  --create-hooks     Generate stub hook scripts in .github/hooks/ when none exist",
    "",
    "What this creates in target repo:",
    "  .visualizer/emit-event.sh",
    "  .visualizer/visualizer.config.json",
    "  .visualizer/HOOK_INTEGRATION.md",
    "",
    "With --create-hooks, also creates stub scripts in .github/hooks/",
    "that call the visualizer emitter for each lifecycle event."
  ].join("\n");
}

interface CliOptions {
  targetRepo: string;
  prefix?: string;
  createHooks: boolean;
}

function parseCliArgs(argv: string[]): CliOptions | null {
  const positional: string[] = [];
  let prefix: string | undefined;
  let createHooks = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--prefix") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        fail("--prefix requires a value (e.g. --prefix viz)");
      }
      prefix = value;
      i += 1;
    } else if (arg === "--create-hooks") {
      createHooks = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  if (positional.length === 0) {
    return null;
  }

  return { targetRepo: positional[0], prefix, createHooks };
}

async function ensureExists(path: string): Promise<void> {
  try {
    await access(path, constants.F_OK);
  } catch {
    fail(`target repo does not exist: ${path}`);
  }
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (!options) {
    console.log(usage());
    process.exit(1);
  }

  const visualizerRoot = resolve(process.cwd());
  const targetRepo = resolve(options.targetRepo);

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

  const prefixNote = options.prefix
    ? `\n## Naming Prefix\nHook scripts use the prefix \`${options.prefix}-\` (e.g. \`${options.prefix}-session-start.sh\`).\n`
    : "";

  const guide = `# Visualizer Hook Integration

This repo was bootstrapped for Copilot Agent Activity Visualizer.

## Generated Files
- .visualizer/emit-event.sh
- .visualizer/visualizer.config.json
- .visualizer/logs/events.jsonl (created on first emit)
- .github/hooks/visualizer/visualizer-hooks.json (canonical hook manifest)
${prefixNote}
## Visualizer Manifest

The file \`.github/hooks/visualizer/visualizer-hooks.json\` is the single source of truth
for which lifecycle events the visualizer captures. It is auto-generated during
bootstrap and lists every event type with its corresponding hook command.

All visualizer-generated stub hooks live in \`.github/hooks/visualizer/\` to keep
them isolated from user-managed hooks.

When unbootstrapping, this manifest is deleted automatically.

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
.visualizer/emit-event.sh postToolUseFailure '{"toolName":"bash","status":"failure","errorSummary":"exit code 1"}' "$SESSION_ID"
.visualizer/emit-event.sh sessionEnd '{}' "$SESSION_ID"
\`\`\`

## Event Types
sessionStart, sessionEnd, userPromptSubmitted, preToolUse, postToolUse,
postToolUseFailure, subagentStart, subagentStop, agentStop, notification,
errorOccurred

## Hook Discovery
The bootstrap script scans \`.github/hooks/\` and its subdirectories for shell
scripts that match known lifecycle names. If your hooks live in a subfolder
(e.g. \`.github/hooks/copilot/session-start.sh\`) they are discovered automatically.

When \`--create-hooks\` is used, stub scripts are placed in
\`.github/hooks/visualizer/\` to keep them separate from user-managed hooks.

When a \`--prefix\` is used, filenames like \`<prefix>-session-start.sh\` are also
matched (e.g. \`viz-session-start.sh\` with \`--prefix viz\`).

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
  await wireHooks(targetRepo, options.prefix, options.createHooks);
}

/**
 * Maps canonical hook base filenames to their visualizer event type and a
 * function that builds the JSON payload from parsed input.
 *
 * The matcher supports:
 *   1. Exact match (case-insensitive) — e.g. session-start.sh
 *   2. Prefix match — e.g. viz-session-start.sh with --prefix viz
 *   3. Hooks in subdirectories — e.g. .github/hooks/copilot/session-start.sh
 *
 * The emit block is idempotent — skipped if ".visualizer/emit-event.sh"
 * already appears in the file.
 */

interface HookMapping {
  eventType: string;
  payloadSnippet: string;
  sessionSnippet: string;
}

interface HookCommand {
  type: string;
  bash: string;
  cwd?: string;
  timeoutSec?: number;
  [key: string]: unknown;
}

const SUBAGENT_NAME_FALLBACK = "\${AGENT_NAME:-\${SUBAGENT_NAME:-\${AGENT_DISPLAY_NAME:-\${SUBAGENT_DISPLAY_NAME:-\${TASK_DESC:-unknown}}}}}";
const SUBAGENT_DISPLAY_NAME_FALLBACK = "\${AGENT_DISPLAY_NAME:-\${SUBAGENT_DISPLAY_NAME:-\${AGENT_NAME:-\${SUBAGENT_NAME:-\${TASK_DESC:-unknown}}}}}";
const SUBAGENT_DETAIL_FALLBACK = "\${AGENT_DESCRIPTION:-\${SUBAGENT_DESCRIPTION:-\${TASK_DESC:-\${AGENT_MESSAGE:-\${MESSAGE:-\${SUMMARY:-}}}}}}";
const SUBAGENT_MESSAGE_FALLBACK = "\${AGENT_MESSAGE:-\${MESSAGE:-\${SUMMARY:-\${TASK_DESC:-}}}}";

const HOOK_MAP: Record<string, HookMapping> = {
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
    payloadSnippet: `$(jq -nc --arg agent "${SUBAGENT_NAME_FALLBACK}" --arg task "\${TASK_DESC:-}" --arg message "\${AGENT_MESSAGE:-\${MESSAGE:-\${SUMMARY:-\${RESULT:-}}}}" '{"agentName":$agent,"taskDescription":$task,"message":$message,"summary":$message,"result":$message}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "subagent-start.sh": {
    eventType: "subagentStart",
    payloadSnippet: `$(jq -nc --arg agent "${SUBAGENT_NAME_FALLBACK}" --arg display "${SUBAGENT_DISPLAY_NAME_FALLBACK}" --arg description "${SUBAGENT_DETAIL_FALLBACK}" --arg task "\${TASK_DESC:-}" --arg message "${SUBAGENT_MESSAGE_FALLBACK}" '{"agentName":$agent,"agentDisplayName":$display,"agentDescription":$description,"taskDescription":$task,"message":$message,"summary":$message}' 2>/dev/null || echo '{}')`,
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
  "post-tool-use-failure.sh": {
    eventType: "postToolUseFailure",
    payloadSnippet: `$(jq -nc --arg tool "\${TOOL_NAME:-unknown}" --arg errorSummary "\${ERROR_SUMMARY:-}" '{"toolName":$tool,"status":"failure","errorSummary":$errorSummary}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "agent-stop.sh": {
    eventType: "agentStop",
    payloadSnippet: `$(jq -nc --arg agent "\${AGENT_NAME:-}" '{"agentName":$agent}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "notification.sh": {
    eventType: "notification",
    payloadSnippet: `$(jq -nc --arg notificationType "\${NOTIFICATION_TYPE:-info}" --arg title "\${TITLE:-notification}" --arg message "\${MESSAGE:-}" '{"notificationType":$notificationType,"title":$title,"message":$message}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
  "error-occurred.sh": {
    eventType: "errorOccurred",
    payloadSnippet: `$(jq -nc --arg message "\${MESSAGE:-unknown error}" --arg code "\${CODE:-}" '{"message":$message,"code":$code}' 2>/dev/null || echo '{}')`,
    sessionSnippet: `"\${SESSION_ID:-run-$$}"`,
  },
};

/**
 * Canonical stub filenames — one per unique event type from HOOK_MAP.
 * For event types that have both hyphenated and joined variants (e.g.
 * "session-start.sh" and "sessionstart.sh"), prefer the hyphenated name.
 * For event types with only one entry (e.g. "notification.sh"), use that entry.
 */
const CANONICAL_HOOK_NAMES = (() => {
  const eventSeen = new Set<string>();
  const hyphenated = Object.keys(HOOK_MAP).filter((name) => name.includes("-"));
  const nonHyphenated = Object.keys(HOOK_MAP).filter((name) => !name.includes("-"));

  const result: string[] = [];
  // Add hyphenated names first (preferred)
  for (const name of hyphenated) {
    const eventType = HOOK_MAP[name].eventType;
    if (!eventSeen.has(eventType)) {
      eventSeen.add(eventType);
      result.push(name);
    }
  }
  // Then add any non-hyphenated names for events not yet covered
  for (const name of nonHyphenated) {
    const eventType = HOOK_MAP[name].eventType;
    if (!eventSeen.has(eventType)) {
      eventSeen.add(eventType);
      result.push(name);
    }
  }
  return result;
})();

const EVENT_TO_CANONICAL_HOOK: Record<string, string> = CANONICAL_HOOK_NAMES.reduce<Record<string, string>>((acc, hookName) => {
  acc[HOOK_MAP[hookName].eventType] = hookName;
  return acc;
}, {});

const DEFAULT_TIMEOUT_BY_EVENT: Record<string, number> = {
  sessionStart: 15,
  sessionEnd: 15,
  userPromptSubmitted: 5,
  preToolUse: 10,
  postToolUse: 10,
  postToolUseFailure: 10,
  subagentStart: 10,
  subagentStop: 10,
  agentStop: 10,
  notification: 5,
  errorOccurred: 10,
};

/**
 * Name of the dedicated visualizer hook manifest. This file is the single
 * source of truth for which lifecycle events the visualizer captures.
 */
export const VISUALIZER_MANIFEST_NAME = "visualizer-hooks.json";

/**
 * Subdirectory under .github/hooks/ where all visualizer-generated files
 * (stub hook scripts and the manifest) are placed. Keeps visualizer artifacts
 * isolated from user-managed hooks.
 */
export const VISUALIZER_HOOKS_SUBDIR = "visualizer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildManifestCommand(eventType: string, prefix?: string): HookCommand | undefined {
  const canonicalHook = EVENT_TO_CANONICAL_HOOK[eventType];
  if (!canonicalHook) return undefined;

  const hookFile = prefix ? `${prefix}-${canonicalHook}` : canonicalHook;
  return {
    type: "command",
    bash: `./.github/hooks/${VISUALIZER_HOOKS_SUBDIR}/${hookFile}`,
    cwd: ".",
    timeoutSec: DEFAULT_TIMEOUT_BY_EVENT[eventType] ?? 10,
  };
}

export function updateEjsHooksManifest(
  manifestRaw: unknown,
  availableEvents: readonly string[],
  prefix?: string
): { updated: Record<string, unknown>; addedEvents: string[] } {
  const manifest: Record<string, unknown> = isRecord(manifestRaw)
    ? { ...manifestRaw }
    : { version: 1 };
  const existingHooks = isRecord(manifest.hooks) ? { ...manifest.hooks } : {};
  const addedEvents: string[] = [];

  for (const eventType of availableEvents) {
    const current = existingHooks[eventType];
    if (Array.isArray(current) && current.length > 0) {
      continue;
    }

    const cmd = buildManifestCommand(eventType, prefix);
    if (!cmd) continue;

    existingHooks[eventType] = [cmd];
    addedEvents.push(eventType);
  }

  return {
    updated: {
      ...manifest,
      hooks: existingHooks,
    },
    addedEvents,
  };
}

export const updateHookManifest = updateEjsHooksManifest;

function isCompatibleHookManifest(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isRecord(value.hooks);
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Try to match a filename against HOOK_MAP, optionally stripping a prefix.
 * Returns the mapping if found, or undefined.
 */
export function matchHookFilename(filename: string, prefix?: string): HookMapping | undefined {
  const lower = basename(filename).toLowerCase();

  // Direct match first
  const direct = HOOK_MAP[lower];
  if (direct) return direct;

  // Prefix match: strip "<prefix>-" from the start and re-check
  if (prefix) {
    const prefixPattern = new RegExp(`^${escapeRegExp(prefix.toLowerCase())}-`);
    const stripped = lower.replace(prefixPattern, "");
    if (stripped !== lower) {
      return HOOK_MAP[stripped];
    }
  }

  return undefined;
}

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

/** Recursively collect all .sh files under a directory. */
async function findShellScripts(dir: string): Promise<{ relPath: string; absPath: string }[]> {
  const results: { relPath: string; absPath: string }[] = [];

  async function walk(currentDir: string, relBase: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const absEntry = join(currentDir, entry);
      const relEntry = relBase ? join(relBase, entry) : entry;
      const info = await stat(absEntry);

      if (info.isDirectory()) {
        await walk(absEntry, relEntry);
      } else if (info.isFile() && entry.endsWith(".sh")) {
        results.push({ relPath: relEntry, absPath: absEntry });
      }
    }
  }

  await walk(dir, "");
  return results;
}

function buildStubScript(eventType: string, payloadSnippet: string, sessionSnippet: string, emitScriptRelPath: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
# Stub hook generated by bootstrap-existing-repo.
# Add your custom logic above the visualizer emit block below.

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# --- Visualizer emit (auto-wired by bootstrap-existing-repo) ---
if [ -x "\${REPO_ROOT}/${emitScriptRelPath}" ]; then
  _VIZ_PAYLOAD=${payloadSnippet}
  "\${REPO_ROOT}/${emitScriptRelPath}" ${eventType} "\${_VIZ_PAYLOAD}" ${sessionSnippet} >&2 || true
fi

exit 0
`;
}

async function createStubHooks(targetRepo: string, prefix?: string): Promise<number> {
  const hooksDir = join(targetRepo, ".github", "hooks", VISUALIZER_HOOKS_SUBDIR);
  await mkdir(hooksDir, { recursive: true });

  let created = 0;
  for (const canonical of CANONICAL_HOOK_NAMES) {
    const stubName = prefix ? `${prefix}-${canonical}` : canonical;
    const stubPath = join(hooksDir, stubName);

    // Don't overwrite existing files
    try {
      await access(stubPath, constants.F_OK);
      console.log(`  EXISTS ${stubName} — not overwriting`);
      continue;
    } catch {
      // File doesn't exist, proceed to create
    }

    const mapping = HOOK_MAP[canonical];
    if (!mapping) continue;

    const script = buildStubScript(
      mapping.eventType,
      mapping.payloadSnippet,
      mapping.sessionSnippet,
      ".visualizer/emit-event.sh"
    );

    await writeFile(stubPath, script, "utf8");
    await chmod(stubPath, 0o755);
    console.log(`  CREATE ${stubName} → ${mapping.eventType}`);
    created += 1;
  }

  return created;
}

async function findJsonFiles(dir: string): Promise<{ relPath: string; absPath: string }[]> {
  const results: { relPath: string; absPath: string }[] = [];

  async function walk(currentDir: string, relBase: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const absEntry = join(currentDir, entry);
      const relEntry = relBase ? join(relBase, entry) : entry;
      const info = await stat(absEntry);

      if (info.isDirectory()) {
        await walk(absEntry, relEntry);
      } else if (info.isFile() && entry.endsWith(".json")) {
        results.push({ relPath: relEntry, absPath: absEntry });
      }
    }
  }

  await walk(dir, "");
  return results;
}

async function syncHookManifests(
  targetRepo: string,
  coveredEvents: ReadonlySet<string>,
  prefix?: string
): Promise<void> {
  const hooksDir = join(targetRepo, ".github", "hooks");

  // Always create the dedicated visualizer manifest with all covered events
  await createVisualizerManifest(hooksDir, coveredEvents, prefix);

  const manifests = await findJsonFiles(hooksDir);

  const orderedCoveredEvents = CANONICAL_HOOK_NAMES
    .map((hookName) => HOOK_MAP[hookName].eventType)
    .filter((eventType, idx, list) => list.indexOf(eventType) === idx)
    .filter((eventType) => coveredEvents.has(eventType));

  for (const { relPath, absPath } of manifests) {
    // Skip the visualizer's own manifest — it was just created above
    if (basename(relPath) === VISUALIZER_MANIFEST_NAME) {
      continue;
    }

    const manifestLabel = `.github/hooks/${relPath.replaceAll("\\", "/")}`;

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(absPath, "utf8"));
    } catch {
      console.log(`\nSKIP  ${manifestLabel} — invalid JSON (left unchanged)`);
      continue;
    }

    if (!isCompatibleHookManifest(parsed)) {
      console.log(`\nSKIP  ${manifestLabel} — no hooks object`);
      continue;
    }

    const { updated, addedEvents } = updateEjsHooksManifest(parsed, orderedCoveredEvents, prefix);
    if (addedEvents.length === 0) {
      console.log(`\nOK    ${manifestLabel} — already includes mapped hooks`);
      continue;
    }

    await writeFile(absPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    console.log(`\nPATCH ${manifestLabel} — added: ${addedEvents.join(", ")}`);
  }
}

/**
 * Creates (or overwrites) the dedicated visualizer-hooks.json manifest in
 * .github/hooks/. This manifest declares every covered lifecycle event with
 * its corresponding hook command, serving as the single source of truth for
 * what the visualizer expects to capture.
 */
async function createVisualizerManifest(
  hooksDir: string,
  coveredEvents: ReadonlySet<string>,
  prefix?: string
): Promise<void> {
  const vizDir = join(hooksDir, VISUALIZER_HOOKS_SUBDIR);
  await mkdir(vizDir, { recursive: true });

  const allEvents = CANONICAL_HOOK_NAMES
    .map((hookName) => HOOK_MAP[hookName].eventType)
    .filter((eventType, idx, list) => list.indexOf(eventType) === idx)
    .filter((eventType) => coveredEvents.has(eventType));

  if (allEvents.length === 0) {
    console.log(`\nSKIP  .github/hooks/${VISUALIZER_HOOKS_SUBDIR}/${VISUALIZER_MANIFEST_NAME} — no covered events (manifest not created)`);
    return;
  }

  const hooks: Record<string, HookCommand[]> = {};
  for (const eventType of allEvents) {
    const cmd = buildManifestCommand(eventType, prefix);
    if (cmd) {
      hooks[eventType] = [cmd];
    }
  }

  const manifest = {
    version: 1,
    description: "Auto-generated by Copilot Agent Activity Visualizer bootstrap. This is the canonical manifest for visualizer event capture.",
    hooks,
  };

  const manifestPath = join(vizDir, VISUALIZER_MANIFEST_NAME);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`\nCREATE .github/hooks/${VISUALIZER_HOOKS_SUBDIR}/${VISUALIZER_MANIFEST_NAME} — ${allEvents.length} event types`);
}

async function wireHooks(targetRepo: string, prefix?: string, createHooks?: boolean): Promise<void> {
  const hooksDir = join(targetRepo, ".github", "hooks");

  let hooksDirExists = true;
  try {
    await access(hooksDir, constants.F_OK);
  } catch {
    hooksDirExists = false;
  }

  // If no hooks directory and --create-hooks was requested, create stubs
  if (!hooksDirExists) {
    if (createHooks) {
      console.log(`\nNo .github/hooks/ directory found — creating stub hooks:`);
      const created = await createStubHooks(targetRepo, prefix);
      const finalFiles = await findShellScripts(hooksDir);
      const finalCoveredEvents = new Set<string>();
      for (const { relPath } of finalFiles) {
        const match = matchHookFilename(relPath, prefix);
        if (match) finalCoveredEvents.add(match.eventType);
      }
      await syncHookManifests(targetRepo, finalCoveredEvents, prefix);
      console.log(`\nCreated ${created} stub hook scripts in ${hooksDir}`);
      return;
    }
    console.log("\nNo .github/hooks/ directory found — skipping hook wiring.");
    console.log("Tip: re-run with --create-hooks to generate stub hooks automatically.");
    console.log("To wire manually, see .visualizer/HOOK_INTEGRATION.md");
    return;
  }

  // Recursively find all .sh files in hooks dir and subdirectories
  const shFiles = await findShellScripts(hooksDir);

  if (shFiles.length === 0) {
    if (createHooks) {
      console.log(`\nNo .sh files found in .github/hooks/ — creating stub hooks:`);
      const created = await createStubHooks(targetRepo, prefix);
      const finalFiles = await findShellScripts(hooksDir);
      const finalCoveredEvents = new Set<string>();
      for (const { relPath } of finalFiles) {
        const match = matchHookFilename(relPath, prefix);
        if (match) finalCoveredEvents.add(match.eventType);
      }
      await syncHookManifests(targetRepo, finalCoveredEvents, prefix);
      console.log(`\nCreated ${created} stub hook scripts in ${hooksDir}`);
      return;
    }
    console.log("\nNo .sh files found in .github/hooks/ — skipping hook wiring.");
    console.log("Tip: re-run with --create-hooks to generate stub hooks automatically.");
    return;
  }

  console.log(`\nAuto-wiring hooks in ${hooksDir}:`);
  let wired = 0;
  let skipped = 0;

  for (const { relPath, absPath } of shFiles) {
    const mapping = matchHookFilename(relPath, prefix);
    if (!mapping) {
      console.log(`  SKIP  ${relPath} — no event type mapping (add manually if needed)`);
      skipped += 1;
      continue;
    }

    const content = await readFile(absPath, "utf8");

    if (content.includes(".visualizer/emit-event.sh")) {
      console.log(`  OK    ${relPath} — already wired`);
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

    await writeFile(absPath, updated, "utf8");
    console.log(`  WIRED ${relPath} → ${mapping.eventType}`);
    wired += 1;
  }

  // If --create-hooks and nothing was wired, also create stubs for missing event types
  if (createHooks) {
    const coveredEvents = new Set<string>();
    for (const { relPath } of shFiles) {
      const m = matchHookFilename(relPath, prefix);
      if (m) coveredEvents.add(m.eventType);
    }
    const missingCanonical = CANONICAL_HOOK_NAMES.filter(
      (name) => !coveredEvents.has(HOOK_MAP[name].eventType)
    );
    if (missingCanonical.length > 0) {
      const vizHooksDir = join(hooksDir, VISUALIZER_HOOKS_SUBDIR);
      await mkdir(vizHooksDir, { recursive: true });
      console.log(`\nCreating stub hooks for uncovered event types:`);
      for (const canonical of missingCanonical) {
        const stubName = prefix ? `${prefix}-${canonical}` : canonical;
        const stubPath = join(vizHooksDir, stubName);

        try {
          await access(stubPath, constants.F_OK);
          console.log(`  EXISTS ${VISUALIZER_HOOKS_SUBDIR}/${stubName} — not overwriting`);
          continue;
        } catch {
          // File doesn't exist, proceed to create
        }

        const mapping = HOOK_MAP[canonical];
        const script = buildStubScript(
          mapping.eventType,
          mapping.payloadSnippet,
          mapping.sessionSnippet,
          ".visualizer/emit-event.sh"
        );
        await writeFile(stubPath, script, "utf8");
        await chmod(stubPath, 0o755);
        console.log(`  CREATE ${VISUALIZER_HOOKS_SUBDIR}/${stubName} → ${mapping.eventType}`);
        wired += 1;
      }
    }
  }

  const finalFiles = await findShellScripts(hooksDir);
  const finalCoveredEvents = new Set<string>();
  for (const { relPath } of finalFiles) {
    const match = matchHookFilename(relPath, prefix);
    if (match) finalCoveredEvents.add(match.eventType);
  }

  if (finalCoveredEvents.size === 0 && !createHooks) {
    console.log("\n⚠️  No hook scripts matched any known lifecycle event type.");
    console.log("Tip: re-run with --create-hooks to generate stub hooks for all 11 event types.");
  }

  await syncHookManifests(targetRepo, finalCoveredEvents, prefix);

  console.log(`\nHook wiring complete: ${wired} wired, ${skipped} skipped.`);
  console.log("\nNext steps:");
  console.log("  1) Start the ingest service:   npm run serve:ingest  (from visualizer repo)");
  console.log("  2) Start the web UI:            npm run dev --workspace=packages/web-ui");
  console.log("  3) Run your agent workflow — events appear live at http://127.0.0.1:5173");
}

/* istanbul ignore next -- entry guard */
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename ?? "")) {
  void main();
}
