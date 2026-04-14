# 🪝 Hooked on Hooks

> **A practical guide to GitHub Copilot CLI hooks — what they are, why they matter, and how we used them to build a full activity visualizer.**

---

## What Even Are Hooks?

If you've used Git, you've probably bumped into hooks before — those little scripts
in `.git/hooks/` that fire when you commit, push, or rebase. GitHub Copilot CLI hooks
follow the same philosophy but for **AI agent lifecycles**.

Think of hooks as tiny tripwires. An agent starts a session? *Trip.* A tool gets
invoked? *Trip.* Something blows up? *Trip.* Each time a hook fires, you get a
chance to do something useful with that moment — log it, visualize it, phone home,
or just quietly take notes.

The big idea: **hooks give you observability without modifying the thing you're observing.**

---

## The Hook Lifecycle (a.k.a. "The Circle of Agent Life")

Here are the lifecycle events that Copilot CLI hooks can capture. We used every
single one of these in this project:

| Event | When It Fires | What You Learn |
|-------|--------------|----------------|
| `sessionStart` | A Copilot CLI session begins | Who started what, and when |
| `sessionEnd` | The session wraps up | Duration, exit status |
| `userPromptSubmitted` | The user sends a prompt | What the human asked for |
| `preToolUse` | Right before a tool runs | Which tool, what arguments |
| `postToolUse` | Tool finishes successfully | Duration, result status |
| `postToolUseFailure` | Tool finishes with an error | What went wrong, how long it took |
| `subagentStart` | A sub-agent spins up | Agent name, task description |
| `subagentStop` | A sub-agent finishes | Clean exit or not |
| `agentStop` | The main agent stops | Overall session conclusion |
| `notification` | An informational notification fires | Status updates, completion notices |
| `errorOccurred` | Something goes wrong | Error details for debugging |

> **Pro tip:** You don't need all of these. Start with `sessionStart`, `preToolUse`,
> `postToolUse`, and `errorOccurred`. That alone gives you a surprisingly complete
> picture of what happened during a run.

---

## What We Built (And What We Learned)

This project — the **Copilot Agent Activity Visualizer** — is a real-world example
of hooks in action. Here's the architecture in a nutshell:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌────────────┐
│ Copilot CLI  │────▶│ Hook Emitter │────▶│ Ingest Service  │────▶│  Web UI    │
│  (hooks)     │     │ (JSONL +     │     │ (Fastify +      │     │ (React +   │
│              │     │  optional    │     │  state machine) │     │  Vite)     │
│              │     │  HTTP POST)  │     │                 │     │            │
└─────────────┘     └──────────────┘     └─────────────────┘     └────────────┘
```

**The flow:**
1. Copilot CLI fires a lifecycle hook (e.g., "I'm about to run `bash`").
2. Our **hook emitter** validates the event against a strict schema, redacts
   secrets, and writes it to a JSONL log file. Optionally, it also POSTs it
   to a local HTTP endpoint.
3. The **ingest service** picks up events and feeds them through a deterministic
   state machine that tracks session, tool, and sub-agent states.
4. The **web UI** renders the live state — a pixel-art operations board — and
   supports replay with timeline scrubbing.

### Lesson 1: Schema First, Always

We defined a canonical [event schema](specs/event-schema.md) before writing a
single line of hook code. Every event shares a common envelope:

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "uuid",
  "eventType": "preToolUse",
  "timestamp": "2026-04-12T20:55:31.123Z",
  "sessionId": "abc-123",
  "source": "copilot-cli",
  "repoPath": "/path/to/repo",
  "payload": { }
}
```

**Why this matters:** Without a schema, every consumer of your events has to guess
what fields exist. With a schema, you get validation for free (we used Zod),
you catch bad events before they corrupt your state, and you can evolve the
format safely using semver rules.

### Lesson 2: Fail Safe, Not Loud

Hooks run *inside* your agent's lifecycle. If a hook crashes, it can take the
whole session with it. Our emitter wraps HTTP delivery in a try/catch that
silently swallows connection errors:

```typescript
// HTTP delivery is best-effort. The event is already written to JSONL.
// Suppress connection errors so the emitter never crashes hook scripts.
```

**The golden rule:** A hook should *never* break the thing it's observing.
Log the failure, sure. But don't throw. Don't exit. Don't panic.

### Lesson 3: JSONL Is Your Best Friend

We chose [JSONL](https://jsonlines.org/) (newline-delimited JSON) as the primary
persistence format. Why?

- **Append-only** — just slam lines onto the end of a file. No locking headaches.
- **Streamable** — you can tail the file and process events as they arrive.
- **Recoverable** — if the ingest service is down, events pile up in the file
  and you replay them later.
- **Human-readable** — open it in any text editor and you can see exactly what
  happened.

### Lesson 4: Redact Before You Persist

Hooks see *everything*. Tool arguments, file paths, environment variables — all of
it flows through. If you're persisting events, you need to strip secrets *before*
they hit the log file:

- API keys and tokens → `[REDACTED]`
- Prompt bodies → opt-in only (off by default)
- Sensitive command arguments → suppressed or transformed

**The default must be safe.** Operators should have to *opt in* to storing sensitive
data, never *opt out*.

### Lesson 5: Bootstrap Should Be One Command

We invested heavily in making integration painless. Running:

```bash
npm run bootstrap:repo -- /path/to/your-repo --create-hooks
```

... generates all the hook scripts, the emitter, the config file, and wires
everything together. No manual `chmod`, no manual plumbing, no "go read the
docs for 30 minutes" — just run the command and you're live.

**Lesson:** If your hook system requires a 15-step setup guide, nobody will use it.

---

## Best Practices: The Hook Hygiene Checklist

Here's what we wish we knew on Day 1:

### ✅ Do

- **Define your event schema first.** Your schema is the contract between
  producers and consumers. Get it right early.
- **Use a validation layer.** Parse and validate every event before trusting it.
  Malformed events should be rejected gracefully, not silently swallowed.
- **Keep hooks lightweight.** A hook should capture a moment, not *process* it.
  Move heavy logic to downstream services.
- **Write to a local file first.** Network calls fail. Disk usually doesn't.
  Make HTTP delivery a bonus, not a requirement.
- **Make state deterministic.** If you can replay a JSONL log and arrive at the
  exact same state every time, you've won debugging forever.
- **Version your events.** Use semver for your schema. Additive changes are minor
  bumps. Breaking changes are major bumps.
- **Test your hooks in isolation.** Hook logic should be unit-testable without
  spinning up the whole agent runtime.

### ❌ Don't

- **Don't let hooks crash the host.** Your hook is a guest in someone else's
  process. Be polite. Catch your exceptions.
- **Don't log secrets.** If you're not actively redacting, you're actively leaking.
- **Don't assume the network is up.** Design for offline-first. The ingest service
  might be down, and that's fine.
- **Don't block the main process.** If your hook does I/O, make it async. Nobody
  wants their `git commit` to hang because a hook is phoning home.
- **Don't couple tightly to event consumers.** The hook emitter shouldn't know or
  care what the web UI looks like. Schema in, schema out.

---

## Patterns That Worked Well

### The "Emit and Forget" Pattern

```
Hook fires → Validate → Redact → Append to JSONL → (optional) POST to HTTP
```

The key insight: the JSONL file is the source of truth. HTTP delivery is
best-effort. If it fails, the event is still safely persisted. The ingest
service can catch up later by replaying the log.

### The "State Machine Over Event Stream" Pattern

Instead of having the UI query a database, we feed events through a
deterministic state machine:

```
sessionStart → idle
preToolUse   → tool_running
postToolUse  → tool_succeeded → idle
errorOccurred → error
```

This means you can rebuild the entire session state by replaying the event
log from scratch. No database. No cache. Just a pure function from events
to state.

### The "Bootstrap, Don't Configure" Pattern

Rather than asking users to edit config files and wire up hooks manually,
we scan their repo, detect existing hook scripts, and auto-wire integration.
The `--create-hooks` flag generates stub scripts for every lifecycle event.
The `--prefix` flag avoids filename collisions.

---

## Hook Integration: A Real Example

Here's what a generated hook script actually does (simplified):

```bash
#!/usr/bin/env bash
# session-start.sh — generated by the visualizer bootstrap

SESSION_ID="${SESSION_ID:-$(uuidgen)}"
REPO_PATH="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

.visualizer/emit-event.sh sessionStart \
  "{\"startedAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  "$SESSION_ID"
```

That's it. Three lines of real logic. The `emit-event.sh` script handles
validation, redaction, JSONL persistence, and optional HTTP forwarding.

---

## When Should You Use Hooks?

Hooks aren't just for building visualizers. Here are some real-world use cases:

| Use Case | What Hooks Enable |
|----------|-------------------|
| **Debugging agent runs** | See exactly which tools were called, in what order, and what failed |
| **Performance monitoring** | Track tool execution durations across sessions |
| **Audit trails** | Keep a tamper-evident log of everything an agent did |
| **Custom dashboards** | Feed events into Grafana, Datadog, or your own UI |
| **Team visibility** | Share session replays with teammates for review |
| **CI/CD integration** | Trigger downstream workflows when agents complete tasks |
| **Cost tracking** | Correlate tool invocations with resource usage |

---

## Official Resources & Further Reading

Want to go deeper? Here are the official sources:

- **[GitHub Copilot documentation](https://docs.github.com/en/copilot)** — the
  comprehensive docs for all things Copilot, including CLI setup and configuration.

- **[GitHub Copilot in the CLI](https://docs.github.com/en/copilot/github-copilot-in-the-cli)** —
  official guide to using Copilot from your terminal.

- **[Customizing Copilot coding agent](https://docs.github.com/en/copilot/customizing-copilot/customizing-the-development-environment-for-copilot-coding-agent)** —
  documentation on customizing the Copilot coding agent environment, including
  `copilot-setup-steps.yml` and pre-installed tools.

- **[GitHub Copilot extensibility](https://docs.github.com/en/copilot/building-copilot-extensions)** —
  building extensions and integrations with Copilot.

- **[Git hooks documentation](https://git-scm.com/docs/githooks)** — the OG hook
  system. Understanding Git hooks helps you understand the mental model behind
  agent lifecycle hooks.

- **[JSONL format](https://jsonlines.org/)** — the spec for newline-delimited JSON,
  our persistence format of choice.

- **[Zod documentation](https://zod.dev/)** — the schema validation library we
  used for runtime event validation.

- **[Fastify documentation](https://fastify.dev/)** — the web framework powering
  our local ingest service.

---

## TL;DR

| # | Takeaway |
|---|----------|
| 1 | Hooks give you observability into agent lifecycles without modifying the agent |
| 2 | Define your event schema before you write hook code |
| 3 | Always redact secrets before persisting — defaults must be safe |
| 4 | Never let a hook crash the host process |
| 5 | JSONL is simple, append-only, and recoverable — use it |
| 6 | Deterministic state machines over event streams make replay trivial |
| 7 | One-command bootstrap beats a 15-step setup guide every time |
| 8 | Keep hooks lightweight — capture the moment, process it elsewhere |

---

## About This Project

The **Copilot Agent Activity Visualizer** is an open-source project that
demonstrates these patterns in production-quality code. It captures Copilot CLI
activity and renders it as a live pixel-art operations board with full session
replay.

Check out the [README](../README.md) to get started, or dive into the
[product vision](product-vision.md) for the full story.

---

*Built with 🪝 hooks, ☕ caffeine, and a healthy respect for redaction.*
