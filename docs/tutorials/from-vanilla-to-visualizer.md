# From Vanilla to Visualizer

> **A step-by-step guide showing how we transformed simple Copilot CLI hook
> scripts into a full-featured activity visualizer — and how you can do the
> same.**

This tutorial walks through the transformation journey from bare-minimum
"vanilla" hooks that log raw payloads, all the way to the enriched, validated,
synthesized event pipeline that powers the Copilot Agent Activity Visualizer.

Each part builds on the previous one. By the end, you'll understand every
layer the visualizer adds and *why* it was added.

**Prerequisites:** Familiarity with shell scripting and basic understanding
of how Copilot CLI hooks work. If you're new to hooks, start with the
[vanilla hook examples](../examples/vanilla-hooks/README.md) and the
[official hooks documentation](https://docs.github.com/en/copilot/reference/hooks-configuration).

---

## Table of Contents

- [Part 1: Starting from Vanilla](#part-1-starting-from-vanilla)
- [Part 2: Adding Schema & Validation](#part-2-adding-schema--validation)
- [Part 3: Enriching Payloads](#part-3-enriching-payloads)
- [Part 4: Synthesizing Events](#part-4-synthesizing-events)
- [Part 5: The Emit Pattern](#part-5-the-emit-pattern)
- [Part 6: Putting It Together](#part-6-putting-it-together)

---

## Part 1: Starting from Vanilla

### What Copilot CLI gives you

When Copilot CLI fires a hook, it pipes a JSON object on **stdin**. That's it.
No headers, no env vars, no framing — just raw JSON.

Here's what a vanilla `preToolUse` hook looks like:

```bash
#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs')
echo "$INPUT" >> .github/hooks/logs/events.jsonl
```

Four lines. Read stdin, extract what you need, log it. This is the baseline
that every Copilot CLI hook starts from.

### The 8 hook types and their payloads

Copilot CLI supports exactly 8 hook types. Here's what each sends on stdin:

| Hook | Key Fields | Notes |
|------|-----------|-------|
| `sessionStart` | `timestamp`, `cwd`, `source`, `initialPrompt` | `source` is `"new"`, `"resume"`, or `"startup"` |
| `sessionEnd` | `timestamp`, `cwd`, `reason` | `reason` is `"complete"`, `"error"`, `"abort"`, `"timeout"`, or `"user_exit"` |
| `userPromptSubmitted` | `timestamp`, `cwd`, `prompt` | Full prompt text — may contain sensitive data |
| `preToolUse` | `timestamp`, `cwd`, `toolName`, `toolArgs` | `toolArgs` is a JSON **string**, not an object |
| `postToolUse` | `timestamp`, `cwd`, `toolName`, `toolArgs`, `toolResult` | `toolResult.resultType` is `"success"`, `"failure"`, or `"denied"` |
| `agentStop` | `timestamp`, `cwd` | Undocumented — may include additional fields |
| `subagentStop` | `timestamp`, `cwd` | Undocumented — may include additional fields |
| `errorOccurred` | `timestamp`, `cwd`, `error` | `error` has `message`, `name`, `stack` |

### What's missing

Vanilla payloads are minimal by design. They tell you *what happened* but not
much about *who* or *why*. You won't find:

- **Session IDs** — no way to correlate events across a session
- **Agent identity** — no agent name, display name, or description
- **Tool context** — no info about which agent/subagent dispatched the tool
- **Failure detail** — success and failure come through the same hook
- **Subagent lifecycle** — no `subagentStart` event; only `subagentStop`

These gaps are what the visualizer fills. Let's see how.

### Try it yourself

The complete set of vanilla scripts is in
[`docs/examples/vanilla-hooks/`](../examples/vanilla-hooks/). Copy them into
a repo, run Copilot CLI, and inspect `.github/hooks/logs/events.jsonl` to see
the raw payloads.

---

## Part 2: Adding Schema & Validation

### The problem with raw payloads

Vanilla hooks log whatever the CLI sends. This works for simple logging, but
falls apart when you try to build anything on top of the data:

- **No common shape.** Each hook has its own payload structure. A consumer has
  to handle 8 different shapes with no shared fields.
- **No validation.** If the payload is malformed or missing fields, you won't
  know until something downstream breaks.
- **No versioning.** When the payload format changes (and it will), there's no
  way to tell old format from new.

### The solution: an event envelope

We wrapped every event in a common envelope:

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "preToolUse",
  "timestamp": "2026-04-12T20:55:31.123Z",
  "sessionId": "abc-123",
  "source": "copilot-cli",
  "repoPath": "/path/to/repo",
  "payload": {
    "toolName": "bash",
    "toolArgs": { "command": "npm test" }
  }
}
```

Every event now has:

| Field | Why It Matters |
|-------|---------------|
| `schemaVersion` | Consumers can handle format changes gracefully |
| `eventId` | Every event is uniquely identifiable (UUID) |
| `eventType` | Consumers dispatch on a single field, not payload shape |
| `timestamp` | ISO 8601 string, not a Unix millisecond integer |
| `sessionId` | All events in a session share this — enables session grouping |
| `source` | Always `"copilot-cli"` — makes multi-source ingestion possible |
| `repoPath` | Ties the event to a specific repository |
| `payload` | The hook-specific data, validated per event type |

### Zod schemas

We used [Zod](https://zod.dev/) for runtime validation. Each event type has
its own payload schema:

```typescript
// shared/event-schema/src/schema.ts (simplified)
const PreToolUsePayload = z.object({
  toolName: z.string().min(1),
  toolArgs: z.record(z.string(), z.unknown()).optional(),
});

const PostToolUsePayload = z.object({
  toolName: z.string().min(1),
  status: z.literal("success"),
  durationMs: z.number().int().nonnegative().optional(),
});
```

If an event doesn't match its schema, it's **rejected** — not silently
swallowed. The emitter returns `{ accepted: false, error: "..." }` and the
event never hits the log file.

### What changed from vanilla

```diff
 # Vanilla: log the raw JSON as-is
-echo "$INPUT" >> events.jsonl
+
+# Enhanced: wrap in envelope, validate, then persist
+.visualizer/emit-event.sh preToolUse "$PAYLOAD_JSON" "$SESSION_ID"
```

The hook script no longer writes directly to a log file. Instead, it calls the
emit script, which validates, wraps in an envelope, redacts secrets, and
appends to JSONL.

---

## Part 3: Enriching Payloads

### Why vanilla payloads aren't enough

Consider a `preToolUse` event. The vanilla payload is:

```json
{ "toolName": "bash", "toolArgs": "{\"command\":\"npm test\"}" }
```

This tells you *what tool* ran and *what arguments* it had. But in a
multi-agent session, you also want to know:

- **Which agent** dispatched this tool call?
- **What task** was the agent working on?
- **Is this tool part of a skill?** If so, which one?
- **What's the tool call ID?** (for correlating pre/post events)

None of this is in the vanilla payload. But some of it *might* be in the stdin
JSON under various field names — the CLI format isn't fully documented, and
field names can vary.

### The stdin extraction block

This is where the visualizer's complexity lives. A ~35-line shell snippet that
reads the full stdin JSON and extracts fields into environment variables with
multi-level fallback cascades:

```bash
# Read Copilot CLI context from stdin (JSON payload)
_VIZ_STDIN=$(cat 2>/dev/null || echo '{}')
if [ -z "$_VIZ_STDIN" ]; then _VIZ_STDIN='{}'; fi
_vjq() { echo "$_VIZ_STDIN" | jq -r "$1" 2>/dev/null || true; }

# Extract fields — stdin values fill unset vars
: "${TOOL_NAME:=$(_vjq '.tool_name // .toolName // empty')}"
: "${AGENT_NAME:=$(_vjq '.agent_name // .agentName // .agent.name // .agent.id // .agent.slug // .actor.name // .name // empty')}"
: "${TASK_DESC:=$(_vjq '.task_description // .taskDescription // .task // .toolArgs.description // .tool_args.description // empty')}"
# ... 25+ more field extractions
```

### Why the fallback cascades?

The Copilot CLI's stdin format isn't fully documented. Fields may appear under
different names (`agent_name` vs `agentName` vs `agent.name`) depending on
the context. The fallback cascade tries every known path:

```bash
# Agent name: try 7 different paths before giving up
: "${AGENT_NAME:=$(_vjq '.agent_name // .agentName // .agent.name // .agent.id // .agent.slug // .actor.name // .name // empty')}"
```

This is defensive coding — we'd rather extract a value from an unexpected path
than miss it entirely.

### Rich payload construction

After extraction, the hook builds an enriched JSON payload using `jq`:

```bash
# Vanilla payload
_VIZ_PAYLOAD='{"toolName":"bash"}'

# Enhanced payload (simplified)
_VIZ_PAYLOAD=$(jq -nc \
  --arg tool "$TOOL_NAME" \
  --arg agent "$AGENT_NAME" \
  --arg task "$TASK_DESC" \
  --arg skill "$SKILL_NAME" \
  '{"toolName":$tool}
   + (if ($agent|length)>0 then {"agentName":$agent} else {} end)
   + (if ($task|length)>0 then {"taskDescription":$task} else {} end)
   + (if ($skill|length)>0 then {"skillName":$skill} else {} end)')
```

Notice the conditional field inclusion — empty values are omitted rather than
included as empty strings. This keeps payloads clean and avoids polluting
downstream consumers with noise.

### What changed from vanilla

| Aspect | Vanilla | Enhanced |
|--------|---------|----------|
| Fields logged | 2–4 from stdin | 10+ with fallback extraction |
| Agent context | ❌ | ✅ agentName, agentDisplayName |
| Task context | ❌ | ✅ taskDescription |
| Skill metadata | ❌ | ✅ skillName, skillId |
| Tool call correlation | ❌ | ✅ toolCallId |
| Payload construction | Direct stdin echo | `jq` conditional builder |

---

## Part 4: Synthesizing Events

### The problem: one hook, two outcomes

Copilot CLI fires a **single** `postToolUse` hook for both success and failure.
The outcome lives in `toolResult.resultType`:

```json
{
  "toolName": "bash",
  "toolResult": { "resultType": "failure", "textResultForLlm": "exit code 1" }
}
```

If you're building a state machine or timeline, you need to distinguish
these — a failed tool is a different state transition than a successful one.

### Solution: conditional event routing

The enhanced `post-tool-use.sh` stub checks `toolResult.resultType` and
emits different event types:

```bash
STATUS=$(_vjq '.toolResult.resultType // .status // empty')

if [ "$STATUS" = "failure" ] || [ "$STATUS" = "denied" ]; then
  # Emit postToolUseFailure with error details
  .visualizer/emit-event.sh postToolUseFailure "$FAILURE_PAYLOAD" "$SESSION_ID"
else
  # Emit postToolUse (success)
  .visualizer/emit-event.sh postToolUse "$SUCCESS_PAYLOAD" "$SESSION_ID"
fi
```

This is **event synthesis** — creating new event types that don't exist in the
original hook system. The consumer (state machine, UI) sees two distinct
events instead of having to interpret a status field.

### Synthesized subagent lifecycle

Copilot CLI has a `subagentStop` hook but **no `subagentStart` hook**. If you
want to show when a subagent *began* working (not just when it stopped), you
need to synthesize it.

The visualizer detects subagent start from `task` tool completions. When a
`postToolUse` event has `toolArgs.agent_type` or other agent identity fields,
the state machine synthesizes a `subagentStart` event:

```
postToolUse (toolName=task, toolArgs.agent_type=explore)
  → synthesize subagentStart { agentName: "explore", ... }

agentStop
  → close the subagent lane
```

This gives the Gantt chart and activity board a complete subagent lifecycle
even though the CLI only sends a stop signal.

### The full event type picture

| Event Type | Source | Description |
|------------|--------|-------------|
| `sessionStart` | CLI hook | Session begins |
| `sessionEnd` | CLI hook | Session ends |
| `userPromptSubmitted` | CLI hook | User sends a prompt |
| `preToolUse` | CLI hook | Tool about to execute |
| `postToolUse` | CLI hook (filtered) | Tool succeeded |
| `postToolUseFailure` | **Synthesized** | Tool failed or was denied |
| `subagentStart` | **Synthesized** | Subagent began working |
| `subagentStop` | CLI hook | Subagent completed |
| `agentStop` | CLI hook | Main agent finished |
| `notification` | **Reserved** | Not currently triggered |
| `errorOccurred` | CLI hook | Error during execution |

---

## Part 5: The Emit Pattern

### Architecture: emit and forget

The vanilla approach writes directly to a log file. The visualizer separates
**capture** from **delivery**:

```
Hook script → emit-event.sh → emit-event-cli.ts → { JSONL file + HTTP POST }
```

1. **Hook script** extracts fields and builds the payload
2. **`emit-event.sh`** is a thin shell wrapper that calls the TypeScript emitter
3. **`emit-event-cli.ts`** validates, wraps in envelope, redacts secrets, then:
   - **Always:** appends to `.visualizer/logs/events.jsonl`
   - **Optionally:** POSTs to `http://127.0.0.1:7070/events` (the ingest service)

### JSONL is the source of truth

The JSONL file is append-only and always written. HTTP delivery is best-effort:

```typescript
// packages/hook-emitter/src/index.ts (simplified)
// 1. Always write to JSONL
await fs.appendFile(jsonlPath, JSON.stringify(event) + "\n");

// 2. Optionally POST to HTTP (swallow errors)
try {
  await fetch(httpEndpoint, { method: "POST", body: JSON.stringify(event) });
} catch {
  // Silently swallow — event is already persisted in JSONL
}
```

If the ingest service is down, events pile up in the JSONL file. When it comes
back, you can replay them:

```bash
npm run replay:jsonl -- /path/to/events.jsonl
```

### Redaction

Before writing to JSONL, the emitter runs a redaction pass that strips:

- API keys and tokens → `[REDACTED]`
- Patterns matching common secret formats
- Prompt bodies (opt-in only — off by default)

The golden rule: **the default must be safe.** Operators opt *in* to storing
sensitive data, never opt *out*.

### What changed from vanilla

```diff
 # Vanilla: one line, direct to file
-echo "$INPUT" >> .github/hooks/logs/events.jsonl
+
+# Enhanced: validate → redact → JSONL + optional HTTP
+.visualizer/emit-event.sh preToolUse "$PAYLOAD" "$SESSION_ID" >&2 || true
```

The `>&2 || true` suffix is important: emit errors go to stderr (not stdout,
which the CLI might parse), and failures are silently swallowed so the hook
never crashes the host process.

---

## Part 6: Putting It Together

### The bootstrap command

Rather than asking users to manually create all these scripts, the visualizer
provides a one-command bootstrap:

```bash
npm run bootstrap:repo -- /path/to/your-repo --create-hooks
```

This generates:

| File | Purpose |
|------|---------|
| `.visualizer/emit-event.sh` | Bash emitter wrapper |
| `.visualizer/emit-event.ps1` | PowerShell emitter wrapper |
| `.visualizer/visualizer.config.json` | Configuration |
| `.visualizer/HOOK_INTEGRATION.md` | Integration guide |
| `.github/hooks/visualizer/*.sh` | Stub hook scripts (bash) |
| `.github/hooks/visualizer/*.ps1` | Stub hook scripts (PowerShell) |
| `.github/hooks/visualizer/visualizer-hooks.json` | Hook manifest |

Every generated stub is a full version of the enhanced scripts described in
this tutorial — with stdin extraction, field enrichment, conditional routing,
and emit-event integration baked in.

### Vanilla mode

If you want to start simple and add complexity incrementally, use the
`--vanilla` flag:

```bash
npm run bootstrap:repo -- /path/to/your-repo --create-hooks --vanilla
```

This generates minimal scripts that log the raw stdin JSON to a JSONL file —
identical to the [vanilla examples](../examples/vanilla-hooks/). No
transformations, no emit-event dependency, no enrichment. You can then layer
on features at your own pace using this tutorial as a guide.

### The full transformation at a glance

Here's the complete diff between a vanilla `pre-tool-use.sh` and the
enhanced version the visualizer generates:

**Vanilla (8 lines):**
```bash
#!/bin/bash
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName')
TOOL_ARGS=$(echo "$INPUT" | jq -r '.toolArgs')
LOG_DIR=".github/hooks/logs"
mkdir -p "$LOG_DIR"
echo "$INPUT" >> "$LOG_DIR/events.jsonl"
exit 0
```

**Enhanced (50+ lines):**
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ── 35-line stdin extraction block ──
_VIZ_STDIN=$(cat 2>/dev/null || echo '{}')
_vjq() { echo "$_VIZ_STDIN" | jq -r "$1" 2>/dev/null || true; }
: "${TOOL_NAME:=$(_vjq '.toolName // empty')}"
: "${AGENT_NAME:=$(_vjq '.agent_name // .agentName // .agent.name // ...')}"
: "${TASK_DESC:=$(_vjq '.task_description // .taskDescription // ...')}"
# ... 20+ more field extractions ...

# ── Rich payload construction ──
_VIZ_PAYLOAD=$(jq -nc \
  --arg tool "$TOOL_NAME" \
  --arg agent "$AGENT_NAME" \
  --arg task "$TASK_DESC" \
  '{"toolName":$tool}
   + (if ($agent|length)>0 then {"agentName":$agent} else {} end)
   + (if ($task|length)>0 then {"taskDescription":$task} else {} end)')

# ── Emit via validated pipeline ──
if [ -x "${REPO_ROOT}/.visualizer/emit-event.sh" ]; then
  "${REPO_ROOT}/.visualizer/emit-event.sh" preToolUse "$_VIZ_PAYLOAD" "$SESSION_ID" >&2 || true
fi

exit 0
```

### What you've learned

| Part | Key Concept | Why It Matters |
|------|-------------|---------------|
| 1 | Vanilla hooks | Understand the baseline: what the CLI gives you for free |
| 2 | Schema & validation | Common envelope + Zod validation = reliable, versioned events |
| 3 | Payload enrichment | Stdin extraction + fallback cascades fill in missing context |
| 4 | Event synthesis | Split postToolUse; synthesize subagentStart from task metadata |
| 5 | Emit pattern | JSONL-first, HTTP-optional, redact-before-persist |
| 6 | Bootstrap | One command generates everything — vanilla or enhanced |

---

## Next Steps

- **Explore the codebase:**
  - [`shared/event-schema/`](../../shared/event-schema/) — Zod schemas and event types
  - [`packages/hook-emitter/`](../../packages/hook-emitter/) — emit + persist logic
  - [`scripts/bootstrap-existing-repo.ts`](../../scripts/bootstrap-existing-repo.ts) — bootstrap script with STDIN_EXTRACTION_BLOCK
  - [`shared/state-machine/`](../../shared/state-machine/) — deterministic reducer
  - [`packages/web-ui/`](../../packages/web-ui/) — React live board and replay UI

- **Read the architecture decisions:**
  - [ADR-003: Manifest-first hook registration](../adr/003-manifest-first-hook-registration.md)
  - [ADR-004: Visualizer hooks subdirectory](../adr/004-visualizer-hooks-subdirectory.md)
  - [ADR-006: Task postToolUse subagent synthesis](../adr/006-task-posttooluse-subagent-synthesis.md)

- **Read the practitioner guide:** [Hooked on Hooks](../hooked-on-hooks.md) —
  lessons learned, best practices, and patterns from building the visualizer.

- **Official GitHub docs:**
  - [Hooks configuration reference](https://docs.github.com/en/copilot/reference/hooks-configuration)
  - [About hooks](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-hooks)
  - [Using hooks with Copilot CLI](https://docs.github.com/en/copilot/tutorials/copilot-cli-hooks)
