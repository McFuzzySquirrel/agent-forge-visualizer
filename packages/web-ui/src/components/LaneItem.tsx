import type { LaneData } from "../types.js";

/** Human-readable labels for each visual status value (LIVE-FR-02). */
const STATUS_LABELS: Record<LaneData["status"], string> = {
  idle:            "Idle",
  running:         "Running",
  succeeded:       "Succeeded",
  error:           "Error",
  subagent_running: "Subagent Running"
};

interface Props {
  lane: LaneData;
}

/**
 * Renders a single lane row on the Live Board.
 * Uses data-status for CSS styling hooks and aria-live for screen reader updates.
 */
export function LaneItem({ lane }: Props) {
  return (
    <div
      role="listitem"
      aria-label={`${lane.label}: ${STATUS_LABELS[lane.status]}`}
      data-status={lane.status}
      style={{ display: "flex", gap: "1rem", padding: "0.5rem 0", alignItems: "center" }}
    >
      <span style={{ flex: 1 }}>{lane.label}</span>
      <span
        aria-live="polite"
        style={{ minWidth: "140px", fontWeight: 600 }}
      >
        {STATUS_LABELS[lane.status]}
      </span>
      {lane.details && (
        <span aria-label="details" style={{ color: "#666", fontSize: "0.875rem" }}>
          {lane.details}
        </span>
      )}
    </div>
  );
}
