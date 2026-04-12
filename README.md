# Copilot Agent Activity Visualizer

Feature status:
- Foundation Event Capture: implemented
- Deterministic State Engine: planned
- Live Visualization Board: planned
- Replay and Session Review: planned
- Privacy Retention and Export Controls: planned

## Quick Start (Foundation Feature)

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

## Hook Configuration

Generate the expected hook event configuration:

```bash
npx tsx scripts/configure-hooks.ts
```

This prints the lifecycle event set the emitter supports.

## First Live Flow (Foundation)

This feature does not include the visual UI yet. The live flow for Foundation is:

1. Emit schema-compliant events to JSONL using `@visualizer/hook-emitter`.
2. Validate and parse events via `@visualizer/event-schema`.
3. Ingest JSONL (and optionally HTTP stream) using `@visualizer/ingest-service`.

Use tests as executable examples in:
- `packages/hook-emitter/test/emitter.test.ts`
- `packages/ingest-service/test/ingest.test.ts`

## Optional Agent Forge / EJS Overlay

Integration is optional and does not affect base capture. See:
- `docs/integrations/agent-forge-ejs-overlay.md`
