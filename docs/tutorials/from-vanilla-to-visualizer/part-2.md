# Part 2: Adding Schema & Validation

Prev: [Part 1](part-1.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 3](part-3.md)

### The problem with raw payloads

Vanilla hooks log whatever the CLI sends. This works for simple logging, but
falls apart when you try to build anything on top of the data:

- **No common shape.** Each hook has its own payload structure. A consumer has
  to handle 8 different shapes with no shared fields.
- **No validation.** If the payload is malformed or missing fields, you won't
  know until something downstream breaks.
- **No versioning.** When the payload format changes (and it will), there's no
  way to tell old format from new.

### The solution: an event envelope

We wrapped every event in a common envelope:

```json
{
  "schemaVersion": "1.0.0",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "preToolUse",
  "timestamp": "2026-04-12T20:55:31.123Z",
  "sessionId": "abc-123",
  "source": "copilot-cli",
  "repoPath": "/path/to/repo",
  "payload": {
    "toolName": "bash",
    "toolArgs": { "command": "npm test" }
  }
}
```

Every event now has:

| Field | Why It Matters |
|-------|---------------|
| `schemaVersion` | Consumers can handle format changes gracefully |
| `eventId` | Every event is uniquely identifiable (UUID) |
| `eventType` | Consumers dispatch on a single field, not payload shape |
| `timestamp` | ISO 8601 string, not a Unix millisecond integer |
| `sessionId` | All events in a session share this — enables session grouping |
| `source` | Always `"copilot-cli"` — makes multi-source ingestion possible |
| `repoPath` | Ties the event to a specific repository |
| `payload` | The hook-specific data, validated per event type |

### Zod schemas

We used [Zod](https://zod.dev/) for runtime validation. Each event type has
its own payload schema:

```typescript
// shared/event-schema/src/schema.ts (simplified)
const PreToolUsePayload = z.object({
  toolName: z.string().min(1),
  toolArgs: z.record(z.string(), z.unknown()).optional(),
});

const PostToolUsePayload = z.object({
  toolName: z.string().min(1),
  status: z.literal("success"),
  durationMs: z.number().int().nonnegative().optional(),
});
```

If an event doesn't match its schema, it's **rejected** — not silently
swallowed. The emitter returns `{ accepted: false, error: "..." }` and the
event never hits the log file.

### What changed from vanilla

```diff
 # Vanilla: log the raw JSON as-is
-echo "$INPUT" >> events.jsonl
+
+# Enhanced: wrap in envelope, validate, then persist
+.visualizer/emit-event.sh preToolUse "$PAYLOAD_JSON" "$SESSION_ID"
```

The hook script no longer writes directly to a log file. Instead, it calls the
emit script, which validates, wraps in an envelope, redacts secrets, and
appends to JSONL.

### Try it yourself

1. Pick one vanilla hook script (for example, `pre-tool-use.sh`).
2. Replace the direct file append with `.visualizer/emit-event.sh` as shown.
3. Trigger the hook once with a known-good payload.
4. Confirm the JSONL line now includes envelope fields like `schemaVersion`,
   `eventId`, and `sessionId`.
5. Trigger a malformed payload directly via the emitter, for example:

  ```bash
  SESSION_ID="lab-$(date +%s)"
  .visualizer/emit-event.sh preToolUse '{"toolName":123}' "$SESSION_ID"
  ```

  This fails schema validation because `toolName` must be a string.
  Verify it was rejected by checking that no new line was appended for that
  failed command.

Optional verify commands:

```bash
# Show the newest enriched line and verify envelope fields exist
tail -n 1 .visualizer/logs/events.jsonl | jq '{schemaVersion, eventId, sessionId, eventType}'
```

---

Prev: [Part 1](part-1.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 3](part-3.md)
