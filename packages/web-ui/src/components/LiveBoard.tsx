import type { LaneData } from "../types.js";
import { LaneItem } from "./LaneItem.js";

interface Props {
  lanes: LaneData[];
}

/**
 * Top-level session + activity lane board (LIVE-FR-01).
 * Renders one LaneItem per active concern: session, tool, subagent.
 */
export function LiveBoard({ lanes }: Props) {
  return (
    <section aria-label="Live activity board">
      <h2>Live Activity</h2>
      <div role="list">
        {lanes.map((lane) => (
          <LaneItem key={lane.id} lane={lane} />
        ))}
        {lanes.length === 0 && (
          <p role="status">Waiting for session to start…</p>
        )}
      </div>
    </section>
  );
}
