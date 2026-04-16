# Part 3: Enriching Payloads

Prev: [Part 2](part-2.md) | Up: [From Vanilla to Visualizer (PowerShell)](../from-vanilla-to-visualizer-ps1.md) | Next: [Part 4](part-4.md)

## Screenshot Placeholder

![Placeholder screenshot for Part 3](../assets/tutorial-screenshots/from-vanilla-ps1-part-3.png)

**What this screenshot should show (Payload Enrichment Comparison):**
- A side-by-side view of one vanilla JSONL line and one enriched JSONL line.
- Enriched fields visible such as `agentName` and `taskDescription`.
- An example where empty enrichment fields are omitted instead of stored as empty strings.


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

This is where the visualizer's complexity lives. A ~35-line PowerShell block that
reads the full stdin JSON and extracts fields into environment variables with
multi-level fallback cascades:

```powershell
# Read Copilot CLI context from stdin (JSON payload)
$rawStdin = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($rawStdin)) { $rawStdin = '{}' }
try {
  $stdinJson = $rawStdin | ConvertFrom-Json -AsHashtable
} catch {
  $stdinJson = @{}
}

function Get-VizValue {
  param([string[]]$Paths)
  foreach ($path in $Paths) {
    $segments = $path -split '\.'
    $cursor = $stdinJson
    $found = $true
    foreach ($segment in $segments) {
      if ($cursor -is [hashtable] -and $cursor.ContainsKey($segment)) {
        $cursor = $cursor[$segment]
      } else {
        $found = $false
        break
      }
    }
    if ($found -and $null -ne $cursor -and "$cursor" -ne "") {
      return "$cursor"
    }
  }
  return ""
}

# Extract fields — stdin values fill unset vars
$TOOL_NAME = if ($env:TOOL_NAME) { $env:TOOL_NAME } else { Get-VizValue @("tool_name", "toolName") }
$AGENT_NAME = if ($env:AGENT_NAME) { $env:AGENT_NAME } else { Get-VizValue @("agent_name", "agentName", "agent.name", "agent.id", "agent.slug", "actor.name", "name") }
$TASK_DESC = if ($env:TASK_DESC) { $env:TASK_DESC } else { Get-VizValue @("task_description", "taskDescription", "task", "toolArgs.description", "tool_args.description") }
# ... 25+ more field extractions
```

### Why the fallback cascades?

The Copilot CLI's stdin format isn't fully documented. Fields may appear under
different names (`agent_name` vs `agentName` vs `agent.name`) depending on
the context. The fallback cascade tries every known path:

```powershell
# Agent name: try 7 different paths before giving up
$AGENT_NAME = Get-VizValue @("agent_name", "agentName", "agent.name", "agent.id", "agent.slug", "actor.name", "name")
```

This is defensive coding — we'd rather extract a value from an unexpected path
than miss it entirely.

### Rich payload construction

After extraction, the hook builds an enriched JSON payload using PowerShell
objects and `ConvertTo-Json`:

```powershell
# Vanilla payload
$payload = @{ toolName = "bash" }

# Enhanced payload (simplified)
if (-not [string]::IsNullOrWhiteSpace($TOOL_NAME)) { $payload.toolName = $TOOL_NAME }
if (-not [string]::IsNullOrWhiteSpace($AGENT_NAME)) { $payload.agentName = $AGENT_NAME }
if (-not [string]::IsNullOrWhiteSpace($TASK_DESC)) { $payload.taskDescription = $TASK_DESC }
if (-not [string]::IsNullOrWhiteSpace($SKILL_NAME)) { $payload.skillName = $SKILL_NAME }
$VIZ_PAYLOAD = $payload | ConvertTo-Json -Compress -Depth 10
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
| Payload construction | Direct stdin echo | Conditional object builder + `ConvertTo-Json` |

### Try it yourself

1. In one hook script, add a small `Get-VizValue` helper and 3 fallback extracts:
   `toolName`, `agentName`, and `taskDescription`.
2. Build payload JSON with `ConvertTo-Json`, adding fields only when non-empty.
3. Run a prompt that invokes at least one tool.
4. Compare one vanilla line and one enriched line side by side.
5. Check that empty fields are omitted, not stored as empty strings.

Example drop-in block (PowerShell):

```powershell
# Read stdin once.
$rawStdin = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($rawStdin)) { $rawStdin = '{}' }
try { $stdinJson = $rawStdin | ConvertFrom-Json -AsHashtable } catch { $stdinJson = @{} }

function Get-VizValue {
  param([string[]]$Paths)
  foreach ($path in $Paths) {
    $segments = $path -split '\.'
    $cursor = $stdinJson
    $found = $true
    foreach ($segment in $segments) {
      if ($cursor -is [hashtable] -and $cursor.ContainsKey($segment)) {
        $cursor = $cursor[$segment]
      } else {
        $found = $false
        break
      }
    }
    if ($found -and $null -ne $cursor -and "$cursor" -ne "") { return "$cursor" }
  }
  return ""
}

# 3 fallback extracts
$toolName = Get-VizValue @("tool_name", "toolName")
$agentName = Get-VizValue @("agent_name", "agentName", "agent.name")
$taskDesc = Get-VizValue @("task_description", "taskDescription", "task")

# Build payload with conditional fields (omit empties)
$payload = @{ toolName = $toolName }
if (-not [string]::IsNullOrWhiteSpace($agentName)) { $payload.agentName = $agentName }
if (-not [string]::IsNullOrWhiteSpace($taskDesc)) { $payload.taskDescription = $taskDesc }
$payloadJson = $payload | ConvertTo-Json -Compress -Depth 10

# Emit enriched event
if (Test-Path "$RepoRoot/.visualizer/emit-event.ps1") {
  .visualizer\emit-event.ps1 -EventType preToolUse -Payload $payloadJson -SessionId $SessionId
}
```

Quick compare command:

```powershell
Get-Content .github/hooks/logs/events.jsonl -Tail 1
Get-Content .visualizer/logs/events.jsonl -Tail 1
```

---

Prev: [Part 2](part-2.md) | Up: [From Vanilla to Visualizer (PowerShell)](../from-vanilla-to-visualizer-ps1.md) | Next: [Part 4](part-4.md)
