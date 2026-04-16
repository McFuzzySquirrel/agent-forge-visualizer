# Part 3: Enriching Payloads

Prev: [Part 2](part-2.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 4](part-4.md)

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

### Try it yourself

1. In one hook script, add a small `_vjq` helper and 3 fallback extracts:
   `toolName`, `agentName`, and `taskDescription`.
2. Build payload JSON with `jq -nc`, adding fields only when non-empty.
3. Run a prompt that invokes at least one tool.
4. Compare one vanilla line and one enriched line side by side.
5. Check that empty fields are omitted, not stored as empty strings.

Example drop-in block (bash):

```bash
# Read stdin once and provide a safe jq accessor.
_VIZ_STDIN=$(cat 2>/dev/null || echo '{}')
if [ -z "$_VIZ_STDIN" ]; then _VIZ_STDIN='{}'; fi
_vjq() { echo "$_VIZ_STDIN" | jq -r "$1" 2>/dev/null || true; }

# 3 fallback extracts
TOOL_NAME="${TOOL_NAME:-$(_vjq '.tool_name // .toolName // empty')}"
AGENT_NAME="${AGENT_NAME:-$(_vjq '.agent_name // .agentName // .agent.name // empty')}"
TASK_DESC="${TASK_DESC:-$(_vjq '.task_description // .taskDescription // .task // empty')}"

# Build payload with conditional fields (omit empties)
_VIZ_PAYLOAD=$(jq -nc \
  --arg tool "$TOOL_NAME" \
  --arg agent "$AGENT_NAME" \
  --arg task "$TASK_DESC" \
  '{"toolName":$tool}
   + (if ($agent|length)>0 then {"agentName":$agent} else {} end)
   + (if ($task|length)>0 then {"taskDescription":$task} else {} end)')

# Emit enriched event
if [ -x "${REPO_ROOT}/.visualizer/emit-event.sh" ]; then
  "${REPO_ROOT}/.visualizer/emit-event.sh" preToolUse "$_VIZ_PAYLOAD" "$SESSION_ID" >&2 || true
fi
```

Quick compare command:

```bash
tail -n 1 .github/hooks/logs/events.jsonl
tail -n 1 .visualizer/logs/events.jsonl
```

---

Prev: [Part 2](part-2.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 4](part-4.md)
