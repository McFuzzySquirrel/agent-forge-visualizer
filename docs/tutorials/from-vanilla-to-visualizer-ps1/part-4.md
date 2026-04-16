# Part 4: Synthesizing Events

Prev: [Part 3](part-3.md) | Up: [From Vanilla to Visualizer (PowerShell)](../from-vanilla-to-visualizer-ps1.md) | Next: [Part 5](part-5.md)

## Screenshot Placeholder

![Placeholder screenshot for Part 4](../assets/tutorial-screenshots/from-vanilla-ps1-part-4.png)

**What this screenshot should show (Synthesized Event Types):**
- A filtered event list (or terminal output) showing both `postToolUse` and `postToolUseFailure` for the same session.
- Optional: a `subagentStart`/`subagentStop` lifecycle view if available.
- The event type column or JSON `eventType` field clearly readable.


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

The enhanced `post-tool-use.ps1` stub checks `toolResult.resultType` and
emits different event types:

```powershell
$status = Get-VizValue @("toolResult.resultType", "status")

if ($status -in @("failure", "denied")) {
  # Emit postToolUseFailure with error details
  .visualizer\emit-event.ps1 -EventType postToolUseFailure -Payload $failurePayload -SessionId $SessionId
} else {
  # Emit postToolUse (success)
  .visualizer\emit-event.ps1 -EventType postToolUse -Payload $successPayload -SessionId $SessionId
}
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

### Try it yourself

1. Update your `post-tool-use` hook to branch on `toolResult.resultType`.
2. Emit `postToolUse` for success and `postToolUseFailure` for failure/denied.
3. Trigger one successful and one failing tool call.
4. Verify both lines exist with different `eventType` values.
5. If your workflow uses subagents, inspect task tool metadata and sketch how
   you would synthesize `subagentStart`.

Minimal emit test (without waiting on a real tool run):

```powershell
$SessionId = "synth-" + [int](Get-Date -UFormat %s)
.visualizer\emit-event.ps1 -EventType postToolUse -Payload '{"toolName":"bash","status":"success","durationMs":120}' -SessionId $SessionId
.visualizer\emit-event.ps1 -EventType postToolUseFailure -Payload '{"toolName":"bash","status":"failure","errorSummary":"exit code 1"}' -SessionId $SessionId
```

Verify event type split:

```powershell
Get-Content .visualizer/logs/events.jsonl -Tail 50 |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.sessionId -eq $SessionId } |
  Select-Object -ExpandProperty eventType
```

---

Prev: [Part 3](part-3.md) | Up: [From Vanilla to Visualizer (PowerShell)](../from-vanilla-to-visualizer-ps1.md) | Next: [Part 5](part-5.md)
