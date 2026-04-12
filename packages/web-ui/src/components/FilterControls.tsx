import { EVENT_TYPES } from "../../../../shared/event-schema/src/index.js";
import type { FilterConfig } from "../types.js";

interface Props {
  filter: FilterConfig;
  onChange: (filter: FilterConfig) => void;
}

/**
 * Filter controls for narrowing the event timeline by type and actor (LIVE-FR-05).
 * All controls are keyboard-operable (ACC-02) and properly labelled (ACC-01).
 */
export function FilterControls({ filter, onChange }: Props) {
  return (
    <div role="search" aria-label="Filter controls">
      <label htmlFor="actor-filter">Actor / Tool Name</label>
      <br />
      <input
        id="actor-filter"
        type="text"
        value={filter.actorName ?? ""}
        onChange={(e) =>
          onChange({ ...filter, actorName: e.target.value || undefined })
        }
        placeholder="Filter by agent or tool name…"
        style={{ marginBottom: "0.75rem", width: "100%" }}
      />

      <fieldset>
        <legend>Event Types</legend>
        {EVENT_TYPES.map((et) => (
          <label key={et} style={{ display: "block", marginBottom: "0.25rem" }}>
            <input
              type="checkbox"
              checked={filter.eventTypes?.includes(et) ?? false}
              onChange={(e) => {
                const current = filter.eventTypes ?? [];
                const next = e.target.checked
                  ? [...current, et]
                  : current.filter((t) => t !== et);
                onChange({ ...filter, eventTypes: next.length > 0 ? next : undefined });
              }}
            />{" "}
            {et}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
