# Spec: Event Schema v1

## Scope

Define the canonical event format for live visualization and replay.

## Envelope

Each event record is a single JSON object.

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "uuid",
  "eventType": "preToolUse",
  "timestamp": "2026-04-12T20:55:31.123Z",
  "sessionId": "string",
  "source": "copilot-cli",
  "repoPath": "/abs/path/to/repo",
  "payload": {}
}
```

## Required Fields

- `schemaVersion`
- `eventId`
- `eventType`
- `timestamp`
- `sessionId`
- `source`
- `repoPath`
- `payload`

## Event Types (MVP)

1. `sessionStart`
2. `sessionEnd`
3. `userPromptSubmitted`
4. `preToolUse`
5. `postToolUse`
6. `postToolUseFailure`
7. `subagentStart`
8. `subagentStop`
9. `agentStop`
10. `notification`
11. `errorOccurred`

## Payload Shapes

### `preToolUse`

```json
{
  "toolName": "bash",
  "toolArgs": {"command": "npm test"}
}
```

### `postToolUse`

```json
{
  "toolName": "bash",
  "status": "success",
  "durationMs": 742
}
```

### `postToolUseFailure`

```json
{
  "toolName": "bash",
  "status": "failure",
  "durationMs": 310,
  "errorSummary": "exit code 1"
}
```

### `subagentStart`

```json
{
  "agentName": "Explore",
  "agentDisplayName": "Explore",
  "agentDescription": "Codebase exploration"
}
```

### `notification`

```json
{
  "notificationType": "agent_completed",
  "title": "Agent completed",
  "message": "Explore finished"
}
```

## Renderer State Mapping

1. `sessionStart` -> `idle`
2. `preToolUse` -> `tool_running`
3. `postToolUse` -> `tool_succeeded`
4. `postToolUseFailure` or `errorOccurred` -> `error`
5. `subagentStart` -> `subagent_running`
6. `subagentStop` or `agentStop` -> `idle`

## Versioning Rules

1. Additive field changes: minor version bump.
2. Breaking payload changes: major version bump.
3. Deprecated fields: keep for one major release with fallback mapping.