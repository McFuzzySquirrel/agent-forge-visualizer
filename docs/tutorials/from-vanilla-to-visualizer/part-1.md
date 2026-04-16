# Part 1: Starting from Vanilla

Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 2](part-2.md)

## Screenshot Placeholder

![Placeholder screenshot for Part 1](../assets/tutorial-screenshots/from-vanilla-bash-part-1.png)

**What this screenshot should show (Vanilla Hook Baseline):**
- A terminal running a short Copilot CLI session with vanilla hooks enabled.
- The latest lines of `.github/hooks/logs/events.jsonl` showing raw hook payloads.
- At least one `preToolUse` or `postToolUse` raw payload visible without an envelope.


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

1. Create a throwaway test repo.

   ```bash
   mkdir -p /tmp/copilot-hooks-lab
   cd /tmp/copilot-hooks-lab
   git init
   mkdir -p .github/hooks/logs
   ```

2. Copy the scripts from `docs/examples/vanilla-hooks/` into
   `.github/hooks/` (or wire them using your preferred hook setup).
3. Run a short Copilot CLI session that triggers at least one tool call.
4. Open `.github/hooks/logs/events.jsonl` and inspect 3-5 lines.
5. Note which fields are present, then compare with the "What's missing"
   list above.

Quick inspect command:

```bash
tail -n 5 .github/hooks/logs/events.jsonl | jq -r 'keys_unsorted | join(", ")'
```

---

Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 2](part-2.md)
