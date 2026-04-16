# Part 5: The Emit Pattern

Prev: [Part 4](part-4.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 6](part-6.md)

### Architecture: emit and forget

The vanilla approach writes directly to a log file. The visualizer separates
**capture** from **delivery**:

```
Hook script → emit-event.sh → emit-event-cli.ts → { JSONL file + HTTP POST }
```

1. **Hook script** extracts fields and builds the payload
2. **`emit-event.sh`** is a thin shell wrapper that calls the TypeScript emitter
3. **`emit-event-cli.ts`** validates, wraps in envelope, redacts secrets, then:
   - **Always:** appends to `.visualizer/logs/events.jsonl`
   - **Optionally:** POSTs to `http://127.0.0.1:7070/events` (the ingest service)

### JSONL is the source of truth

The JSONL file is append-only and always written. HTTP delivery is best-effort:

```typescript
// packages/hook-emitter/src/index.ts (simplified)
// 1. Always write to JSONL
await fs.appendFile(jsonlPath, JSON.stringify(event) + "\n");

// 2. Optionally POST to HTTP (swallow errors)
try {
  await fetch(httpEndpoint, { method: "POST", body: JSON.stringify(event) });
} catch {
  // Silently swallow — event is already persisted in JSONL
}
```

If the ingest service is down, events pile up in the JSONL file. When it comes
back, you can replay them:

```bash
npm run replay:jsonl -- /path/to/events.jsonl
```

### Redaction

Before writing to JSONL, the emitter runs a redaction pass that strips:

- API keys and tokens → `[REDACTED]`
- Patterns matching common secret formats
- Prompt bodies (opt-in only — off by default)

The golden rule: **the default must be safe.** Operators opt *in* to storing
sensitive data, never opt *out*.

### What changed from vanilla

```diff
 # Vanilla: one line, direct to file
-echo "$INPUT" >> .github/hooks/logs/events.jsonl
+
+# Enhanced: validate → redact → JSONL + optional HTTP
+.visualizer/emit-event.sh preToolUse "$PAYLOAD" "$SESSION_ID" >&2 || true
```

The `>&2 || true` suffix is important: emit errors go to stderr (not stdout,
which the CLI might parse), and failures are silently swallowed so the hook
never crashes the host process.

### Try it yourself

1. Stop the ingest service (or point to a non-listening endpoint).
2. Run a session that emits several events.
3. Confirm events still append to `.visualizer/logs/events.jsonl`.
4. Restart the ingest path and run `npm run replay:jsonl -- /path/to/events.jsonl`.
5. Verify replay restores events downstream.

Reliable way to simulate HTTP down while preserving JSONL writes:

```bash
SESSION_ID="offline-$(date +%s)"
VISUALIZER_HTTP_ENDPOINT="http://127.0.0.1:9999/events" \
  .visualizer/emit-event.sh sessionStart '{}' "$SESSION_ID" || true
```

Verify the event was still persisted locally:

```bash
tail -n 10 .visualizer/logs/events.jsonl \
  | jq -r 'select(.sessionId=="'"$SESSION_ID"'") | .eventType'
```

---

Prev: [Part 4](part-4.md) | Up: [From Vanilla to Visualizer](../from-vanilla-to-visualizer.md) | Next: [Part 6](part-6.md)
