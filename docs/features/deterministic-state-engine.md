# Feature: Deterministic State Engine

## Traceability

| Feature ID | Original PRD ID | Description |
|-----------|----------------|-------------|
| STAT-US-01 | US-02 | Observe active agent/subagent/tool state in real time |
| STAT-FR-01 | FR-ST-02 | Map transitions to renderer state mapping |
| STAT-FR-02 | FR-ST-03 | Deterministic outputs for identical event sequences |
| STAT-FR-03 | FR-ST-04 | Restart recovery from persisted logs |

**Product Vision:** [docs/product-vision.md](../product-vision.md)  
**Original PRD:** [docs/prd.md](../prd.md)

---

## 1. Feature Overview

**Feature Name:** Deterministic State Engine  
**ID Prefix:** STAT  
**Summary:** Normalizes event streams into deterministic session, agent, subagent, and tool states to power reliable live rendering and replay behavior.  
**Dependencies:** Foundation Event Capture  
**Priority:** Must

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|-------------|-----------|----------|
| STAT-US-01 | Platform Engineer | view active agent/subagent/tool state in real time | I can diagnose stalls and bottlenecks immediately | Must |

---

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| STAT-FR-01 | State transitions must map to the renderer state mapping defined in the schema spec. | Must |
| STAT-FR-02 | State machine outputs must be deterministic for identical event sequences. | Must |
| STAT-FR-03 | Restart recovery must rebuild current session state from persisted logs. | Should |

---

## 4. UI / Interaction Design

This feature does not own UI components directly; it exposes state snapshots and transition events consumed by live and replay UI features.

---

## 5. Implementation Tasks

### Phase 1: Ingestion and State Core
- [ ] Build ingestion service (file watcher plus parser).
- [ ] Implement deterministic session/agent/subagent/tool state machine.

### Phase 2: Recovery and Reliability
- [ ] Add restart recovery from persisted logs.
- [ ] Validate latency and reliability on representative local runs.

---

## 6. Testing Strategy

| Level | Scope | Approach |
|-------|-------|----------|
| Unit Tests | Transition reducer and state mapping functions | Vitest with deterministic fixture snapshots |
| Integration Tests | Parser + state engine with mixed event streams | End-to-end fixture ingestion with replayed logs |

Key test scenarios:
1. Identical event streams produce identical state outputs across multiple runs.
2. Failure and subagent transitions match schema mapping rules.
3. Restart recovery reconstructs latest valid state from persisted log history.

---

## 7. Acceptance Criteria

1. State outputs are deterministic for equivalent inputs.
2. Transition mapping aligns with lifecycle rules in product vision.
3. Recovery mode restores session state without manual intervention.
4. State recovery and transitions behave consistently on Linux, macOS, and Windows.

---

## 8. Open Questions

| # | Question | Default Assumption |
|---|----------|--------------------|
| 1 | Should state snapshots be materialized periodically for faster cold-start recovery? | Use event replay first; snapshots can be added post-MVP |
