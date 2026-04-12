# Product Vision: Copilot Agent Activity Visualizer

## Overview

Build a standalone visualization product that shows live Copilot agent activity
during CLI sessions, with a visual style inspired by pixel-art operations
dashboards.

The product must be optional, local-first, and decoupled from Agent Forge core.

## Problem Statement

Agentic workflows are powerful but opaque while they run. Users cannot easily
see:

- Which agent or subagent is active right now
- Which tools are being called
- Whether execution is progressing, waiting, blocked, or failing
- What happened after a long run without manually parsing transcripts

## Target Users

- Solo developers running Copilot CLI locally
- Platform teams building internal agent workflows
- Teams using Agent Forge and optional EJS for persistent delivery processes

## Goals

1. Show live execution state transitions with minimal setup.
2. Provide replay of completed sessions.
3. Keep sensitive data local by default.
4. Support optional EJS metadata overlays without hard dependency.

## Non-Goals (MVP)

1. Full IDE parity for every Copilot interaction surface.
2. Multi-tenant cloud telemetry platform.
3. Cross-org analytics, billing, or identity features.

## Primary Use Cases

1. Live monitoring: See agent/tool progress in real time during CLI execution.
2. Debugging: Identify where and why a workflow stalls or fails.
3. Demo mode: Show animated execution states for stakeholder walkthroughs.
4. Retrospective: Replay timeline after completion for review and learning.

## Success Metrics

1. Time to first live visualization under 10 minutes from clean clone.
2. Event-to-render latency below 1 second on local machine.
3. 95%+ event capture reliability in normal CLI runs.
4. Zero sensitive-token leakage in logs under redaction test suite.

## Constraints

1. Local-first operation, offline compatible.
2. Compatibility with Copilot CLI hook lifecycle.
3. Optional integration with EJS if `.ejs.db` and journey files exist.
4. Lightweight runtime suitable for developer laptops.

## Product Principles

1. Optional by design: no required dependency on Agent Forge core.
2. Transparent by default: clear state and event visibility.
3. Safe by default: redaction and retention controls enabled early.
4. Extensible by schema: stable event contract before UI complexity.