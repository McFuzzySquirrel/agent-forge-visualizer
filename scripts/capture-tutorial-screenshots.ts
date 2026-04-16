#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

type Track = "bash" | "ps1";

interface PartSpec {
  title: string;
  summary: string;
  evidence: string[];
  snippet: string;
}

const PARTS: Record<number, PartSpec> = {
  1: {
    title: "Part 1: Vanilla Hook Baseline",
    summary: "Raw Copilot CLI payload logging with no envelope or enrichment.",
    evidence: [
      "A short session run is visible.",
      "Raw JSONL lines are shown from .github/hooks/logs/events.jsonl.",
      "At least one preToolUse or postToolUse payload is visible without schema envelope fields."
    ],
    snippet: `{"timestamp":1704614600000,"cwd":"/repo","toolName":"bash","toolArgs":"{\"command\":\"npm test\"}"}\n{"timestamp":1704614700000,"cwd":"/repo","toolName":"bash","toolResult":{"resultType":"success"}}`
  },
  2: {
    title: "Part 2: Schema Envelope and Validation",
    summary: "Envelope fields plus a rejected malformed event.",
    evidence: [
      "A successful enveloped event includes schemaVersion, eventId, eventType, and sessionId.",
      "A malformed emit attempt shows a validation error.",
      "The malformed line is not appended to JSONL."
    ],
    snippet: `{"schemaVersion":"1.0.0","eventId":"550e8400-e29b-41d4-a716-446655440000","eventType":"preToolUse","sessionId":"lab-1700000","payload":{"toolName":"bash"}}\nemit-event-cli error: event rejected (payload.toolName expected string, received number)`
  },
  3: {
    title: "Part 3: Payload Enrichment Comparison",
    summary: "Vanilla and enriched payloads shown side by side.",
    evidence: [
      "Vanilla line contains only raw tool fields.",
      "Enriched line includes agentName and taskDescription.",
      "No empty-string enrichment fields are present."
    ],
    snippet: `VANILLA : {"toolName":"bash","toolArgs":"{\"command\":\"npm test\"}"}\nENRICHED: {"toolName":"bash","agentName":"ui-engineer","taskDescription":"Investigate flaky test"}`
  },
  4: {
    title: "Part 4: Synthesized Event Types",
    summary: "postToolUse and postToolUseFailure separated for the same session.",
    evidence: [
      "Both success and failure eventType rows are visible.",
      "Optional subagentStart/subagentStop lifecycle appears when present.",
      "Event type field is clearly readable."
    ],
    snippet: `sessionId=synth-1700000 eventType=postToolUse\nsessionId=synth-1700000 eventType=postToolUseFailure\nsessionId=synth-1700000 eventType=subagentStart`
  },
  5: {
    title: "Part 5: Emit Pattern and Recovery",
    summary: "Offline ingest still persists JSONL; replay restores downstream state.",
    evidence: [
      "HTTP endpoint is unavailable during emit.",
      "Events still append to .visualizer/logs/events.jsonl.",
      "Replay command is shown after ingest is available again."
    ],
    snippet: `VISUALIZER_HTTP_ENDPOINT=http://127.0.0.1:9999/events\nappend OK -> .visualizer/logs/events.jsonl\nnpm run replay:jsonl -- /path/to/events.jsonl`
  },
  6: {
    title: "Part 6: Bootstrap Outcome and Diff",
    summary: "Generated artifacts and vanilla-vs-enhanced comparison.",
    evidence: [
      "Generated hooks/manifest artifacts are visible.",
      "A diff or comparison of vanilla vs enhanced output is visible.",
      "A candidate next customization is highlighted."
    ],
    snippet: `.github/hooks/visualizer/visualizer-hooks.json\n.github/hooks/visualizer/pre-tool-use.sh\ndiff -u vanilla/pre-tool-use.sh enhanced/pre-tool-use.sh`
  }
};

function parseArgs(argv: string[]): { renderOnly: boolean; tracks: Track[] } {
  let renderOnly = false;
  let tracks: Track[] = ["bash", "ps1"];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--render-only") {
      renderOnly = true;
      continue;
    }
    if (token === "--track") {
      const v = argv[i + 1];
      if (v === "bash" || v === "ps1") {
        tracks = [v];
        i += 1;
      } else if (v === "both") {
        tracks = ["bash", "ps1"];
        i += 1;
      } else {
        throw new Error("--track must be one of: bash, ps1, both");
      }
    }
  }

  return { renderOnly, tracks };
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHtml(track: Track, partNumber: number, spec: PartSpec): string {
  const trackLabel = track === "bash" ? "Bash/Linux" : "PowerShell";
  const evidence = spec.evidence.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n");
  const snippet = escapeHtml(spec.snippet);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(spec.title)} - ${trackLabel}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        padding: 36px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: #0b1020;
        color: #e2e8f0;
      }
      .card {
        max-width: 1400px;
        margin: 0 auto;
        background: #131a2e;
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 28px;
      }
      .meta {
        display: inline-block;
        background: #1d4ed8;
        color: #dbeafe;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 14px;
      }
      h1 {
        margin: 0 0 8px 0;
        font-size: 34px;
      }
      p {
        margin: 0 0 16px 0;
        color: #cbd5e1;
        line-height: 1.45;
      }
      h2 {
        margin: 22px 0 10px;
        font-size: 20px;
      }
      ul {
        margin: 0;
        padding-left: 22px;
      }
      li {
        margin: 8px 0;
        line-height: 1.4;
      }
      pre {
        margin-top: 14px;
        background: #020617;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 14px;
        font-size: 14px;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .filename {
        margin-top: 14px;
        color: #93c5fd;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="meta">Track: ${trackLabel} • Part ${partNumber}</span>
      <h1>${escapeHtml(spec.title)}</h1>
      <p>${escapeHtml(spec.summary)}</p>

      <h2>Required Visual Evidence</h2>
      <ul>
        ${evidence}
      </ul>

      <h2>Representative Output</h2>
      <pre>${snippet}</pre>

      <div class="filename">Expected file: from-vanilla-${track}-part-${partNumber}.png</div>
    </div>
  </body>
</html>`;
}

function runScreenshot(htmlPath: string, pngPath: string): boolean {
  const fileUrl = pathToFileURL(htmlPath).toString();
  const args = [
    "playwright",
    "screenshot",
    "--browser=chromium",
    "--viewport-size=1600,1100",
    "--full-page",
    fileUrl,
    pngPath
  ];

  const result = spawnSync("npx", args, { stdio: "inherit" });
  return result.status === 0;
}

async function main(): Promise<void> {
  const { renderOnly, tracks } = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const outputDir = resolve(repoRoot, "docs/tutorials/assets/tutorial-screenshots");
  const htmlDir = resolve(repoRoot, ".tmp/tutorial-screenshot-html");

  await mkdir(outputDir, { recursive: true });
  await mkdir(htmlDir, { recursive: true });

  let screenshotAttempts = 0;
  let screenshotSuccess = 0;

  for (const track of tracks) {
    for (let i = 1; i <= 6; i += 1) {
      const spec = PARTS[i];
      const html = renderHtml(track, i, spec);
      const htmlPath = resolve(htmlDir, `from-vanilla-${track}-part-${i}.html`);
      const pngPath = resolve(outputDir, `from-vanilla-${track}-part-${i}.png`);

      await writeFile(htmlPath, html, "utf8");

      if (renderOnly) {
        continue;
      }

      screenshotAttempts += 1;
      if (runScreenshot(htmlPath, pngPath)) {
        screenshotSuccess += 1;
      }
    }
  }

  if (renderOnly) {
    console.log(`Rendered HTML capture cards to ${htmlDir}`);
    return;
  }

  if (screenshotSuccess !== screenshotAttempts) {
    console.warn("Some screenshots were not captured.");
    console.warn("If Chromium is missing, run: npx playwright install chromium");
    console.warn(`Successful captures: ${screenshotSuccess}/${screenshotAttempts}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Captured ${screenshotSuccess} screenshots to ${outputDir}`);
}

void main();
