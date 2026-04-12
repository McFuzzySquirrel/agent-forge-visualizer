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

Then in the target repo:

```bash
chmod +x .visualizer/emit-event.sh
```

Wire your agent lifecycle hooks to call the generated script:

```bash
SESSION_ID="run-$(date +%s)"
.visualizer/emit-event.sh sessionStart '{}' "$SESSION_ID"
.visualizer/emit-event.sh preToolUse '{"toolName":"bash","toolArgs":{"command":"npm test"}}' "$SESSION_ID"
.visualizer/emit-event.sh postToolUse '{"toolName":"bash","status":"success","durationMs":800}' "$SESSION_ID"
.visualizer/emit-event.sh sessionEnd '{}' "$SESSION_ID"
```

Start the visualizer and observe live activity:

```bash
# terminal 1 (from visualizer repo)
npx tsx -e 'import { createIngestServer } from "./packages/ingest-service/src/index.ts"; (async () => { const server = await createIngestServer(); await server.listen({ host: "127.0.0.1", port: 7070 }); console.log("INGEST_READY http://127.0.0.1:7070"); })();'

# terminal 2 (from visualizer repo)
npm run dev --workspace=packages/web-ui
```

Open:
- `http://127.0.0.1:5173`

## Hook Configuration

Generate the expected hook event configuration:

```bash
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
