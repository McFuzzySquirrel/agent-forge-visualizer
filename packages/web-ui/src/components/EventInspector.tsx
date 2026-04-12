import type { InspectorEntry } from "../types.js";

interface Props {
  entry: InspectorEntry | null;
}

/**
 * Displays detailed information for a selected timeline event (LIVE-FR-04).
 * When no entry is selected, shows a placeholder.
 */
export function EventInspector({ entry }: Props) {
  if (!entry) {
    return (
      <aside aria-label="Event inspector">
        <h3>Event Inspector</h3>
        <p>Select a timeline entry to inspect.</p>
      </aside>
    );
  }

  return (
    <aside aria-label="Event inspector">
      <h3>Event Inspector</h3>
      <dl>
        <dt>Event ID</dt>
        <dd><code>{entry.eventId}</code></dd>
        <dt>Type</dt>
        <dd>{entry.eventType}</dd>
        <dt>Timestamp</dt>
        <dd>{entry.timestamp}</dd>
        <dt>Session ID</dt>
        <dd>{entry.sessionId}</dd>
      </dl>
      <pre
        aria-label="Event payload"
        style={{ background: "#f5f5f5", padding: "0.5rem", overflow: "auto" }}
      >
        {JSON.stringify(entry.payload, null, 2)}
      </pre>
    </aside>
  );
}
