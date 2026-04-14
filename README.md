# Copilot Agent Activity Visualizer

[![Build Status](https://img.shields.io/github/actions/workflow/status/McFuzzySquirrel/agent-forge-visualizer/ci.yml?style=flat-square)](https://github.com/McFuzzySquirrel/agent-forge-visualizer/actions)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-3c873a?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

Visualize Copilot agent runtime activity in real time and replay sessions from persisted JSONL logs.

The project is complete for the planned MVP scope:
- Foundation Event Capture
- Deterministic State Engine
- Privacy Retention and Export Controls
- Live Visualization Board
- Replay and Session Review

## Features

- Canonical event schema with validation and malformed-record rejection
- Hook emitter with JSONL persistence and optional HTTP event forwarding
- Deterministic state machine with rebuild-from-log support
- Live board UI with lane mapping, event inspector, and idle-aware Gantt chart
- Idle gap visualization — dashed segments on the Gantt timeline show periods between tool invocations
- Pulsing lane status dots for running and subagent-running states
- Event list auto-scroll with user-scroll-override detection
- Replay mode with timeline scrubbing, speed controls, first-failure jump, and header badge
- Bulk filter controls (Select All / Clear All) for event type checkboxes
- Redaction and retention controls with safe defaults
- Existing-repo bootstrap with automatic hook wiring for common lifecycle scripts
- Enriched tool event payloads (when provided by host hooks): tool args, agent context, and optional skill metadata
- Synthesized subagent lifecycle from task dispatch metadata (`toolArgs.agent_type`): start on task completion, stop on `agentStop`

## Getting Started

### Prerequisites

- Node.js 24+

### Install and Verify

```bash
npm install
npm run typecheck
npm run test
```

### Run the Visualizer

```bash
# terminal 1 (from this repo)
npm run serve:ingest

# terminal 2 (from this repo)
npm run dev --workspace=packages/web-ui
```

Open `http://127.0.0.1:5173`.

> [!TIP]
> Use `npm run smoke:e2e` to run a full emitter -> ingest -> state-stream runtime verification.

## Integrate an Existing Repo

Bootstrap integration in one command:

```bash
npm run bootstrap:repo -- /absolute/path/to/target-repo
```

This creates:
- `.visualizer/emit-event.sh`
- `.visualizer/visualizer.config.json`
- `.visualizer/HOOK_INTEGRATION.md`
- `.visualizer/logs/`
- `.github/hooks/visualizer/visualizer-hooks.json` (canonical hook manifest)

And it auto-wires known hook scripts in `.github/hooks/` (including subdirectories) when present.

### No Existing Hooks?

Use `--create-hooks` to generate stub hook scripts automatically:

```bash
npm run bootstrap:repo -- /path/to/target-repo --create-hooks
```

This creates `.github/hooks/visualizer/` with scripts for every Copilot CLI hook (session start/end, tool use, subagent stop, agent stop, error, etc.), each pre-wired to emit visualizer events. A `visualizer-hooks.json` manifest is also created inside the same subdirectory as the canonical registry of all captured event types.

Generated subagent hooks now capture richer start metadata when the host integration provides it, including display name, description, task text, and summary/message fields. The generated stubs prefer `AGENT_NAME` and `SUBAGENT_NAME`, then fall back through display-name and task-description style variables before using `unknown`.

### Naming Prefix

Use `--prefix` to avoid filename collisions with existing hooks:

```bash
npm run bootstrap:repo -- /path/to/target-repo --create-hooks --prefix viz
```

This generates `viz-session-start.sh`, `viz-pre-tool-use.sh`, etc. instead of bare names. When wiring existing hooks, prefixed filenames like `viz-session-start.sh` are matched automatically.

When bootstrapping, the tool also scans `.github/hooks/` for JSON hook manifests and updates any compatible manifest that contains a `hooks` object (for example `ejs-hooks.json` or other manifest names). Missing mapped lifecycle entries are added automatically based on discovered/generated hook scripts.

### Refresh Existing Generated Hooks

If you already bootstrapped another repo before this metadata update, its existing generated hook stubs will keep their old payload logic until you refresh them.

Recommended refresh flow:

```bash
npm run unbootstrap:repo -- /absolute/path/to/target-repo --apply
npm run bootstrap:repo -- /absolute/path/to/target-repo --create-hooks
```

If you use prefixed hook names, include the same prefix in both commands.

## Unbootstrap Target Repo

To remove visualizer integration from a target repo, use the unbootstrap command.

Dry-run (default, no file changes):

```bash
npm run unbootstrap:repo -- /absolute/path/to/target-repo
```

Apply changes (actually remove wiring/artifacts):

```bash
npm run unbootstrap:repo -- /absolute/path/to/target-repo --apply
```

If bootstrap used prefixed hook names, include the same prefix:

```bash
npm run unbootstrap:repo -- /absolute/path/to/target-repo --prefix viz --apply
```

Unbootstrap behavior:
- Removes auto-wired visualizer emit blocks from hook scripts.
- Deletes the dedicated `visualizer-hooks.json` manifest and the `visualizer/` subdirectory.
- Updates compatible JSON hook manifests under `.github/hooks/` recursively by removing bootstrap-managed entries.
- Deletes safe auto-generated stub hooks (boilerplate-only).
- Removes `.visualizer/` in apply mode.

> [!IMPORTANT]
> For standard hook filenames (with or without prefix), no manual `chmod` and no manual wiring are required.

If your repo uses non-standard hook filenames, call the generated emitter manually from your hook script:

```bash
.visualizer/emit-event.sh <eventType> '<payload-json>' <sessionId>
```

## Offline / JSONL Recovery

If the ingest service is down, events are still appended to `.visualizer/logs/events.jsonl` by the generated script.

Replay them after the service is up:

```bash
npm run replay:jsonl -- /path/to/target-repo/.visualizer/logs/events.jsonl
```

## Hook Configuration

Print the supported hook event types from this repo:

```bash
npx tsx scripts/configure-hooks.ts
```

The `visualizer-hooks.json` manifest created during bootstrap is the canonical source of truth for which events the visualizer captures. It covers all 8 Copilot CLI hook types (3 additional event types — `subagentStart`, `postToolUseFailure`, and `notification` — are synthesized internally and do not have corresponding hooks).

## Package Layout

- `packages/hook-emitter`: emit + persist validated events
- `packages/ingest-service`: Fastify ingest API + SSE state stream
- `packages/web-ui`: React/Vite live board and replay UI
- `shared/event-schema`: canonical event envelope + parser
- `shared/state-machine`: deterministic reducer and state rebuild
- `shared/redaction`: redaction, retention, and export controls

## Useful Commands

```bash
npm run test
npm run test:watch
npm run smoke:e2e
npm run bootstrap:repo -- /absolute/path/to/target-repo
npm run unbootstrap:repo -- /absolute/path/to/target-repo
npm run replay:jsonl -- /path/to/events.jsonl
```

## Documentation

- Product vision: `docs/product-vision.md`
- Progress tracker: `docs/PROGRESS.md`
- Integration notes: `docs/integrations/agent-forge-ejs-overlay.md`
- Learning guide: `docs/hooked-on-hooks.md` — a practical guide to Copilot CLI hooks, patterns, and best practices
- Architecture decisions: `docs/adr/` — ADRs covering packaging, metadata, manifests, hook isolation, and UI polish
