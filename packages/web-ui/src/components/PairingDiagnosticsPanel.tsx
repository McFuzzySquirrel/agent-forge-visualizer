import { useState, useEffect } from "react";

interface PairingDiagnostics {
  totalPairs: number;
  byMode: {
    toolCallId: number;
    spanId: number;
    heuristic: number;
  };
  unmatched: {
    preToolUse: number;
    postToolUse: number;
  };
}

interface Props {
  ingestBase: string;
}

export function PairingDiagnosticsPanel({ ingestBase }: Props) {
  const [data, setData] = useState<PairingDiagnostics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${ingestBase}/diagnostics/pairing`);
        if (!res.ok) throw new Error("non-ok");
        const body = (await res.json()) as PairingDiagnostics;
        if (!cancelled) {
          setData(body);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    void poll();
    const id = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ingestBase]);

  if (error || data === null) return null;

  const { totalPairs, byMode, unmatched } = data;
  const totalUnmatched = unmatched.preToolUse + unmatched.postToolUse;

  return (
    <section
      aria-label="Tool pairing diagnostics"
      style={{
        fontSize: "0.75rem",
        background: "#1e1e2e",
        border: "1px solid #313244",
        borderRadius: 6,
        padding: "8px 12px",
        color: "#cdd6f4",
        display: "flex",
        flexWrap: "wrap",
        gap: "12px",
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: 600, color: "#89b4fa" }}>Tool Pairing</span>
      <Stat label="Pairs" value={totalPairs} color="#a6e3a1" />
      <Stat label="by ID" value={byMode.toolCallId} color="#a6e3a1" />
      <Stat label="by Span" value={byMode.spanId} color="#f9e2af" />
      <Stat label="Heuristic" value={byMode.heuristic} color="#fab387" />
      {totalUnmatched > 0 && (
        <Stat label="Unmatched" value={totalUnmatched} color="#f38ba8" />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span>
      <span style={{ color: "#6c7086" }}>{label}: </span>
      <span style={{ color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </span>
  );
}
