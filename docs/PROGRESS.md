# Project Progress

## Current State

**Mode**: Feature-Based Build  
**Product Vision**: docs/product-vision.md  
**Status**: Planned (not started)  
**Last Updated**: 2026-04-12

No implementation has started. This document captures dependency analysis and planned execution order only.

## Feature Inventory

| Feature ID | Feature Name | File | Declared Dependencies |
|---|---|---|---|
| FND | Foundation Event Capture | docs/features/foundation-event-capture.md | None |
| STAT | Deterministic State Engine | docs/features/deterministic-state-engine.md | Foundation Event Capture |
| LIVE | Live Visualization Board | docs/features/live-visualization-board.md | Foundation Event Capture, Deterministic State Engine |
| RPLY | Replay and Session Review | docs/features/replay-and-session-review.md | Foundation Event Capture, Deterministic State Engine, Live Visualization Board |
| PRIV | Privacy Retention and Export Controls | docs/features/privacy-retention-and-export-controls.md | Foundation Event Capture |

## Feature Dependency Graph

```text
FND
├── STAT
│   └── LIVE
│       └── RPLY
└── PRIV
```

Dependency validation:
- Graph is acyclic (valid DAG).
- All dependency declarations in feature docs are consistent with product vision Section 14.
- RPLY is the most downstream feature and cannot begin before LIVE.

## Execution Plan (Build Waves)

### Wave 1
- FND (Foundation Event Capture)

Why first:
- Every other feature depends directly or indirectly on event capture and ingestion entry points.
- Establishes schema-compliant event flow required by state engine, live UI, replay, and privacy enforcement.

### Wave 2 (parallel after FND)
- STAT (Deterministic State Engine)
- PRIV (Privacy Retention and Export Controls)

Why this wave:
- STAT depends only on FND and unlocks LIVE/RPLY.
- PRIV depends only on FND and is independent of LIVE/RPLY UI flow, so it can proceed in parallel.
- Running STAT and PRIV in parallel shortens total critical path while keeping dependency safety.

### Wave 3
- LIVE (Live Visualization Board)

Why third:
- LIVE requires both FND event flow and STAT deterministic state outputs.
- LIVE provides the visual state components and behavior reused by replay.

### Wave 4
- RPLY (Replay and Session Review)

Why last:
- RPLY explicitly depends on FND + STAT + LIVE.
- Replay controls and timeline behavior build on existing live visualization semantics and state mapping.

## Recommended Sequence

1. Build FND
2. Build STAT and PRIV in parallel
3. Build LIVE
4. Build RPLY

Critical path:
- FND -> STAT -> LIVE -> RPLY

Parallelization opportunity:
- PRIV can run alongside STAT after FND completes.

## Per-Feature Planned Status

| Feature | Status | Planned Wave | Notes |
|---|---|---|---|
| Foundation Event Capture | Pending | Wave 1 | Prerequisite for all downstream features |
| Deterministic State Engine | Pending | Wave 2 | Blocks LIVE and RPLY |
| Privacy Retention and Export Controls | Pending | Wave 2 | Independent of LIVE/RPLY, shares FND dependency only |
| Live Visualization Board | Pending | Wave 3 | Depends on STAT outputs |
| Replay and Session Review | Pending | Wave 4 | Final downstream feature |

## Blockers

- None at planning stage.

## Notes

- This plan prioritizes dependency correctness first, then minimizes total duration via safe parallelism.
- Security/privacy controls are introduced early (Wave 2 via PRIV) rather than deferred to the end, reducing integration risk.
- Implementation intentionally not started in this phase.