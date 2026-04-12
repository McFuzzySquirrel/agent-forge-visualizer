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
- Live board UI with lane mapping and event inspector
- Replay mode with timeline scrubbing, speed controls, and first-failure jump
- Redaction and retention controls with safe defaults
- Existing-repo bootstrap with automatic hook wiring for common lifecycle scripts

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

And it auto-wires known hook scripts in `.github/hooks/*.sh` when present.

> [!IMPORTANT]
> For standard hook filenames, no manual `chmod` and no manual wiring are required.

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
npm run replay:jsonl -- /path/to/events.jsonl
```

## Documentation

- Product vision: `docs/product-vision.md`
- Progress tracker: `docs/PROGRESS.md`
- Integration notes: `docs/integrations/agent-forge-ejs-overlay.md`
