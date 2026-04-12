# Copilot Agent Activity Visualizer

Feature status:
- Foundation Event Capture: implemented
- Deterministic State Engine: implemented
- Live Visualization Board: implemented
- Replay and Session Review: implemented
- Privacy Retention and Export Controls: implemented

## Quick Start

Prerequisites:
- Node.js 24+

Install and verify:

```bash
npm install
npm run typecheck
npm run test
```

The foundation tests validate:
- Canonical schema envelope and all MVP event types
- Malformed record rejection without crashes
- JSONL ingestion and optional localhost HTTP stream ingestion
- Optional EJS overlay compatibility

## Runtime Smoke Test

Run a real end-to-end local flow (emitter -> ingest service -> state stream):

```bash
npm run smoke:e2e
```

This command will:
1. Start the ingest service on localhost.
2. Emit a short session lifecycle via the hook emitter.
3. Verify `/events` contains the expected event sequence.
4. Verify `/state/stream` returns a completed session state snapshot.
5. Clean up temporary files and stop the service.

## Integrate An Existing Repo (Bootstrap)

Yes, a bootstrap step is recommended for adoption.

From the visualizer repo, scaffold integration files into any existing target repo:

```bash
npm run bootstrap:repo -- /absolute/path/to/target-repo
```

This creates in the target repo:
- `.visualizer/emit-event.sh`
- `.visualizer/visualizer.config.json`
- `.visualizer/HOOK_INTEGRATION.md`
- auto-wired known lifecycle hooks in `.github/hooks/*.sh` (when present)

No manual `chmod` or manual hook wiring is required for standard setups.

If your repo uses non-standard hook filenames, wire them manually to call:

```bash
.visualizer/emit-event.sh <eventType> '<payload-json>' <sessionId>
```

**Start the ingest service and web UI first**, then run the emit commands:

```bash
# terminal 1 (from visualizer repo) — start ingest service on port 7070
npm run serve:ingest

# terminal 2 (from visualizer repo) — start web UI
npm run dev --workspace=packages/web-ui
```

> **Offline / JSONL-only mode**: If the ingest service is not running, `emit-event.sh` still writes all events to `.visualizer/logs/events.jsonl` and exits cleanly. No events are lost. Once the ingest service is up, replay the saved log:
>
> ```bash
> # from the visualizer repo
> npm run replay:jsonl -- /path/to/target-repo/.visualizer/logs/events.jsonl
> ```

Open:
- `http://127.0.0.1:5173`

## Hook Configuration

From the visualizer repo root, generate the expected hook event configuration:

```bash
# from ~/Projects/agent-forge-visualizer
npx tsx scripts/configure-hooks.ts
```

This prints the lifecycle event set the emitter supports.

## First Live Flow

The live flow is:

1. Emit schema-compliant events to JSONL using `@visualizer/hook-emitter`.
2. Validate and parse events via `@visualizer/event-schema`.
3. Ingest JSONL (and optionally HTTP stream) using `@visualizer/ingest-service`.

Use tests as executable examples in:
- `packages/hook-emitter/test/emitter.test.ts`
- `packages/ingest-service/test/ingest.test.ts`

## Optional Agent Forge / EJS Overlay

Integration is optional and does not affect base capture. See:
- `docs/integrations/agent-forge-ejs-overlay.md`
