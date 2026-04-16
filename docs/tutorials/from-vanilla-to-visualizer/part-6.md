# Part 6: Putting It Together

Prev: [Part 5](part-5.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md)

## Screenshot Placeholder

![Placeholder screenshot for Part 6](../assets/tutorial-screenshots/from-vanilla-bash-part-6.png)

**What this screenshot should show (Bootstrap Outcome and Diff):**
- Generated hook artifacts for a bootstrapped repo (manifest + hook stubs) visible in a file tree or editor.
- A quick comparison of vanilla vs enhanced outputs (scripts and/or event type distribution).
- One highlighted customization candidate (for example, a derived event or extra payload field).


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

### Try it yourself

1. Bootstrap one repo with `--vanilla` and another without it.
2. Trigger the same short Copilot CLI workflow in both repos.
3. Compare generated hook scripts and resulting JSONL events.
4. Write down which layer differences matter most for your use case:
   validation, enrichment, synthesis, or transport.
5. Choose one next customization (for example, a new derived event or extra
   payload field) and implement it in one hook.

Useful compare commands:

```bash
# Compare one vanilla vs enhanced pre-tool-use hook
diff -u /path/to/vanilla-repo/.github/hooks/pre-tool-use.sh /path/to/enhanced-repo/.github/hooks/visualizer/pre-tool-use.sh

# Compare event type distribution between logs
jq -r '.eventType' /path/to/vanilla-repo/.github/hooks/logs/events.jsonl | sort | uniq -c
jq -r '.eventType' /path/to/enhanced-repo/.visualizer/logs/events.jsonl | sort | uniq -c
```

---

Prev: [Part 5](part-5.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md)
