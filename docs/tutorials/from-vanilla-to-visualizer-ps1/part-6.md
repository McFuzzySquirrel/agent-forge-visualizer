# Part 6: Putting It Together

Prev: [Part 5](part-5.md) | Up: [From Vanilla to Visualizer (PowerShell)](../from-vanilla-to-visualizer-ps1.md)

### The bootstrap command

Rather than asking users to manually create all these scripts, the visualizer
provides a one-command bootstrap:

```powershell
npm run bootstrap:repo -- /path/to/your-repo --create-hooks
```

This generates:

| File | Purpose |
|------|---------|
| `.visualizer/emit-event.sh` | Bash emitter wrapper (optional) |
| `.visualizer/emit-event.ps1` | PowerShell emitter wrapper |
| `.visualizer/visualizer.config.json` | Configuration |
| `.visualizer/HOOK_INTEGRATION.md` | Integration guide |
| `.github/hooks/visualizer/*.sh` | Stub hook scripts (bash, optional) |
| `.github/hooks/visualizer/*.ps1` | Stub hook scripts (PowerShell) |
| `.github/hooks/visualizer/visualizer-hooks.json` | Hook manifest |

Every generated stub is a full version of the enhanced scripts described in
this tutorial — with stdin extraction, field enrichment, conditional routing,
and emit-event integration baked in.

### Vanilla mode

If you want to start simple and add complexity incrementally, use the
`--vanilla` flag:

```powershell
npm run bootstrap:repo -- /path/to/your-repo --create-hooks --vanilla
```

This generates minimal scripts that log the raw stdin JSON to a JSONL file —
identical to the [vanilla examples](../examples/vanilla-hooks/). No
transformations, no emit-event dependency, no enrichment. You can then layer
on features at your own pace using this tutorial as a guide.

### The full transformation at a glance

Here's the complete diff between a vanilla `pre-tool-use.ps1` and the
enhanced version the visualizer generates:

**Vanilla (PowerShell):**
```powershell
$inputJson = [Console]::In.ReadToEnd()
$obj = $inputJson | ConvertFrom-Json
$toolName = $obj.toolName
$toolArgs = $obj.toolArgs
$logDir = ".github/hooks/logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Add-Content -Path "$logDir/events.jsonl" -Value $inputJson
exit 0
```

**Enhanced (PowerShell):**
```powershell
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "../../..")).Path

# -- stdin extraction block --
$rawStdin = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($rawStdin)) { $rawStdin = '{}' }
try { $stdinJson = $rawStdin | ConvertFrom-Json -AsHashtable } catch { $stdinJson = @{} }

# ... fallback extraction for tool/agent/task fields ...

# -- Rich payload construction --
$payload = @{ toolName = $toolName }
if (-not [string]::IsNullOrWhiteSpace($agentName)) { $payload.agentName = $agentName }
if (-not [string]::IsNullOrWhiteSpace($taskDesc)) { $payload.taskDescription = $taskDesc }
$payloadJson = $payload | ConvertTo-Json -Compress -Depth 10

# -- Emit via validated pipeline --
if (Test-Path "$RepoRoot/.visualizer/emit-event.ps1") {
  .visualizer\emit-event.ps1 -EventType preToolUse -Payload $payloadJson -SessionId $SessionId
}

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

```powershell
# Compare one vanilla vs enhanced pre-tool-use hook
git --no-pager diff --no-index \
  C:\path\to\vanilla-repo\.github\hooks\pre-tool-use.ps1 \
  C:\path\to\enhanced-repo\.github\hooks\visualizer\pre-tool-use.ps1

# Compare event type distribution between logs
Get-Content C:\path\to\vanilla-repo\.github\hooks\logs\events.jsonl |
  ForEach-Object { ($_ | ConvertFrom-Json).eventType } |
  Group-Object | Sort-Object Count -Descending

Get-Content C:\path\to\enhanced-repo\.visualizer\logs\events.jsonl |
  ForEach-Object { ($_ | ConvertFrom-Json).eventType } |
  Group-Object | Sort-Object Count -Descending
```

---

Prev: [Part 5](part-5.md) | Up: [From Vanilla to Visualizer (PowerShell)](../from-vanilla-to-visualizer-ps1.md)
