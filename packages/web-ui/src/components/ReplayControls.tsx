import type { ReplaySpeed } from "../types.js";

interface Props {
  canReplay: boolean;
  isReplayMode: boolean;
  isPlaying: boolean;
  currentIndex: number;
  maxIndex: number;
  speed: ReplaySpeed;
  firstFailureIndex: number;
  onReplayModeChange: (enabled: boolean) => void;
  onPlayPause: () => void;
  onScrub: (index: number) => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onJumpToFailure: () => void;
}

const SPEED_OPTIONS: ReplaySpeed[] = [0.5, 1, 2, 4];

export function ReplayControls({
  canReplay,
  isReplayMode,
  isPlaying,
  currentIndex,
  maxIndex,
  speed,
  firstFailureIndex,
  onReplayModeChange,
  onPlayPause,
  onScrub,
  onSpeedChange,
  onJumpToFailure
}: Props) {
  return (
    <section aria-label="Replay controls">
      <h2>Replay</h2>
      {!canReplay && <p role="status">Replay becomes available after events are loaded.</p>}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          <input
            type="checkbox"
            checked={isReplayMode}
            disabled={!canReplay}
            onChange={(e) => onReplayModeChange(e.target.checked)}
          />{" "}
          Replay Mode
        </label>

        <button onClick={onPlayPause} disabled={!isReplayMode || !canReplay}>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <label htmlFor="replay-speed">Speed</label>
        <select
          id="replay-speed"
          value={String(speed)}
          disabled={!isReplayMode || !canReplay}
          onChange={(e) => onSpeedChange(Number(e.target.value) as ReplaySpeed)}
        >
          {SPEED_OPTIONS.map((option) => (
            <option key={option} value={String(option)}>{option}x</option>
          ))}
        </select>

        <button
          onClick={onJumpToFailure}
          disabled={!isReplayMode || firstFailureIndex < 0}
          aria-label="Jump to first failure"
        >
          Jump To First Failure
        </button>
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <label htmlFor="replay-scrubber">Timeline</label>
        <input
          id="replay-scrubber"
          type="range"
          min={0}
          max={Math.max(maxIndex, 0)}
          value={Math.max(currentIndex, 0)}
          disabled={!isReplayMode || !canReplay}
          onChange={(e) => onScrub(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <p aria-live="polite">Frame {Math.max(currentIndex, 0) + 1} of {Math.max(maxIndex + 1, 0)}</p>
      </div>
    </section>
  );
}
