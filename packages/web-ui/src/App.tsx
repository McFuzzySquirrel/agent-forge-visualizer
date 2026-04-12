import { useState, useEffect, useCallback, useMemo } from "react";
import type { SessionState } from "../../../shared/state-machine/src/index.js";
import type { EventEnvelope } from "../../../shared/event-schema/src/index.js";
import { initialSessionState } from "../../../shared/state-machine/src/index.js";
import { mapStateToLanes } from "./stateMapping.js";
import { applyFilter } from "./filterState.js";
import {
  buildReplayFrames,
  findFirstFailureIndex,
  getPlaybackIntervalMs,
  getReplayEventAt,
  getReplayStateAt,
  stepReplayIndex,
  toInspectorEntry
} from "./replay.js";
import { LiveBoard } from "./components/LiveBoard.js";
import { EventInspector } from "./components/EventInspector.js";
import { FilterControls } from "./components/FilterControls.js";
import { ReplayControls } from "./components/ReplayControls.js";
import type { FilterConfig, InspectorEntry, ReplaySpeed } from "./types.js";

/** Ingest service base URL — matches the default Fastify server binding. */
const INGEST_BASE = "http://127.0.0.1:7070";

export function App() {
  const [sessionState, setSessionState] = useState<SessionState>(
    initialSessionState("unknown")
  );
  const [allEvents, setAllEvents] = useState<EventEnvelope[]>([]);
  const [filter, setFilter] = useState<FilterConfig>({});
  const [selected, setSelected] = useState<InspectorEntry | null>(null);
  const [connected, setConnected] = useState(false);
  const [replayMode, setReplayMode] = useState(false);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(() => {
    if (typeof localStorage === "undefined") {
      return 1;
    }
    const raw = localStorage.getItem("visualizer.replay.speed");
    const parsed = Number(raw);
    return parsed === 0.5 || parsed === 1 || parsed === 2 || parsed === 4 ? parsed : 1;
  });
  const [isPlaying, setIsPlaying] = useState(false);

  // --- SSE connection for real-time state updates (LIVE-FR-03) ---
  useEffect(() => {
    const es = new EventSource(`${INGEST_BASE}/state/stream`);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      const state = JSON.parse(e.data as string) as SessionState;
      setSessionState(state);
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  // --- Periodic event list refresh for the inspector timeline ---
  useEffect(() => {
    async function fetchEvents(): Promise<void> {
      try {
        const res = await fetch(`${INGEST_BASE}/events`);
        const body = (await res.json()) as { events: EventEnvelope[] };
        setAllEvents(body.events);
      } catch {
        // Ingest service may not be reachable — silently skip
      }
    }
    void fetchEvents();
    const id = setInterval(() => void fetchEvents(), 2000);
    return () => clearInterval(id);
  }, []);

  const replayFrames = useMemo(() => buildReplayFrames(allEvents), [allEvents]);
  const replayEvents = replayFrames.map((frame) => frame.event);
  const firstFailureIndex = findFirstFailureIndex(replayFrames);

  useEffect(() => {
    if (replayFrames.length === 0) {
      setReplayIndex(-1);
      setIsPlaying(false);
      return;
    }
    setReplayIndex((current) => {
      if (current < 0 || current >= replayFrames.length) {
        return replayFrames.length - 1;
      }
      return current;
    });
  }, [replayFrames.length]);

  useEffect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("visualizer.replay.speed", String(replaySpeed));
    }
  }, [replaySpeed]);

  useEffect(() => {
    if (!replayMode || !isPlaying || replayFrames.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setReplayIndex((current) => {
        const next = stepReplayIndex(current, replayFrames.length);
        if (next >= replayFrames.length - 1) {
          setIsPlaying(false);
        }
        return next;
      });
    }, getPlaybackIntervalMs(replaySpeed));

    return () => window.clearTimeout(timeoutId);
  }, [isPlaying, replayFrames.length, replayMode, replaySpeed, replayIndex]);

  useEffect(() => {
    if (!replayMode) {
      return;
    }
    setSelected(toInspectorEntry(getReplayEventAt(replayFrames, replayIndex)));
  }, [replayFrames, replayIndex, replayMode]);

  const displayedState = replayMode ? getReplayStateAt(replayFrames, replayIndex) : sessionState;
  const lanes = mapStateToLanes(displayedState);
  const timelineSource = replayMode ? replayEvents : allEvents;
  const filteredEvents = applyFilter(timelineSource, filter);

  const handleSelectEvent = useCallback((event: EventEnvelope) => {
    setSelected({
      eventId: event.eventId,
      eventType: event.eventType,
      timestamp: event.timestamp,
      sessionId: event.sessionId,
      payload: event.payload as Record<string, unknown>
    });

    if (replayMode) {
      const index = replayFrames.findIndex((frame) => frame.event.eventId === event.eventId);
      if (index >= 0) {
        setReplayIndex(index);
        setIsPlaying(false);
      }
    }
  }, [replayFrames, replayMode]);

  const handleReplayModeChange = useCallback((enabled: boolean) => {
    setReplayMode(enabled);
    setIsPlaying(false);
    if (enabled && replayFrames.length > 0 && replayIndex < 0) {
      setReplayIndex(0);
    }
  }, [replayFrames.length, replayIndex]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((current) => !current);
  }, []);

  const handleScrub = useCallback((index: number) => {
    setReplayIndex(index);
    setIsPlaying(false);
  }, []);

  const handleJumpToFailure = useCallback(() => {
    if (firstFailureIndex >= 0) {
      setReplayIndex(firstFailureIndex);
      setIsPlaying(false);
    }
  }, [firstFailureIndex]);

  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Copilot Agent Activity Visualizer</h1>
        <span aria-live="polite" role="status">
          {connected ? "● Connected" : "○ Connecting…"}
        </span>
      </header>

      <div style={{ display: "flex", gap: "1.5rem" }}>
        <div style={{ flex: 1 }}>
          <LiveBoard lanes={lanes} />

          <ReplayControls
            canReplay={replayFrames.length > 0}
            isReplayMode={replayMode}
            isPlaying={isPlaying}
            currentIndex={replayIndex}
            maxIndex={replayFrames.length - 1}
            speed={replaySpeed}
            firstFailureIndex={firstFailureIndex}
            onReplayModeChange={handleReplayModeChange}
            onPlayPause={handlePlayPause}
            onScrub={handleScrub}
            onSpeedChange={setReplaySpeed}
            onJumpToFailure={handleJumpToFailure}
          />

          <FilterControls filter={filter} onChange={setFilter} />

          <section aria-label="Event timeline">
            <h2>Events ({filteredEvents.length})</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {filteredEvents.map((ev) => (
                <li key={ev.eventId}>
                  <button
                    onClick={() => handleSelectEvent(ev)}
                    aria-label={`Inspect ${ev.eventType} event at ${ev.timestamp}`}
                    style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <strong>{ev.eventType}</strong> — {ev.timestamp}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div style={{ width: "320px", flexShrink: 0 }}>
          <EventInspector entry={selected} />
        </div>
      </div>
    </main>
  );
}
