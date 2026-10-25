import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Session } from "@quinelings/agent-sdk/v1";
import { AuditLog } from "../../dist/src/audit.js";
import { recordQdl, replayQdl } from "../../dist/src/qdl.js";

const intent = {
  format: "qdl-intent", version: 1, name: "Quote with a floor",
  thought: "price = max(minutes × rate, floor), with floor = 150 PLN",
  inputs: [
    { id: "minutes", name: "minutes", type: { kind: "number", unit: "min", min: 0 } },
    { id: "rate", name: "rate", type: { kind: "number", unit: "PLN*min^-1", min: 0 } },
    { id: "floor", value: 150, type: { kind: "number", unit: "PLN", min: 0 } },
  ],
  steps: [
    { id: "machining", op: "arithmetic", inputs: ["minutes", "rate"], params: { kind: "mul" } },
    { id: "price", op: "arithmetic", inputs: ["machining", "floor"], params: { kind: "max" } },
  ],
  outputs: ["price"],
};

const jobs = [
  { minutes: 42, rate: 4.5, label: "42 min", expect: 189 },
  { minutes: 10, rate: 4.5, label: "10 min", expect: 150 },
];

const dir = mkdtempSync(join(tmpdir(), "quineling-share-"));
const logPath = join(dir, "audit.jsonl");
const log = new AuditLog(logPath);
const recorded = [];
for (const job of jobs) {
  const { decision, step } = await recordQdl(log,
    { systemId: "shop-floor", useCase: "floor-quote", input: `${job.minutes} min at ${job.rate} PLN/min` },
    { intent }, { minutes: job.minutes, rate: job.rate });
  if (step.qdl.status !== "completed" || decision.output[0] !== job.expect) {
    console.error(`recorded ${job.label}: ${step.qdl.status} ${decision.output}`);
    process.exit(1);
  }
  recorded.push({ ...job, decision: decision.id, output: decision.output[0] });
}

const records = log.read();
const program = records.find((r) => r.kind === "program");
const programs = records.filter((r) => r.kind === "program").length;
if (!program || programs !== 1) {
  console.error(`program records: ${programs}`);
  process.exit(1);
}
for (const job of recorded) {
  const again = await replayQdl(log, job.decision);
  if (!again.reproduced || again.output[0] !== job.expect) {
    console.error(`replay ${job.label}: reproduced=${again.reproduced} output=${again.output}`);
    process.exit(1);
  }
}
const chain = log.verifyChain();
if (!chain.ok) {
  console.error(`chain ${chain.reason}`);
  process.exit(1);
}

const session = new Session();
const artifact = session.recover({ source: program.source });
if (artifact.id !== program.id) {
  console.error("recovered program name differs from the log");
  process.exit(1);
}
session.verify(artifact.id);
const traces = [];
let firstId;
for (const job of recorded) {
  const run = session.run({ artifactId: artifact.id, requestId: `view-${job.minutes}`, inputs: { minutes: job.minutes, rate: job.rate } });
  const price = run.result.occurrences[0].outputs[0];
  if (price !== job.expect) {
    console.error(`fresh run ${job.label}: ${price}`);
    process.exit(1);
  }
  if (firstId === undefined) firstId = run.id;
  traces.push(run.result.occurrences[0].trace.map((t) => `${t.nodeId}=${t.value}`).join(" → "));
}
const copy = session.reproduce({ artifactId: artifact.id, recordId: firstId, requestId: "view-42-copy" });
const sdkMatch = copy.result.occurrences[0].outputs[0] === 189 && copy.result.emitted[0] === artifact.source;

const PALETTE = ["#f2c14e", "#f78154", "#4d9de0", "#3bb273", "#e15554"];
const frame = session.frame(artifact.id, 0.25);
const n = frame.owners.length;
const stride = frame.points.length / n;
const xs = Array.from({ length: n }, (_, i) => frame.points[i * stride]);
const ys = Array.from({ length: n }, (_, i) => frame.points[i * stride + 1]);
const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
const scale = Math.min(560 / (x1 - x0), 420 / (y1 - y0));
const sx = (x) => (16 + (x - x0) * scale).toFixed(1);
const sy = (y) => (16 + (y1 - y) * scale).toFixed(1);
const dots = frame.nodeIds.map(() => []);
for (let i = 0; i < n; i++) dots[frame.owners[i]].push(`M${sx(xs[i])} ${sy(ys[i])}h0`);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 460" role="img" aria-label="Body of the floor quote program">`
  + `<rect width="100%" height="100%" fill="#10141c"/>`
  + dots.map((d, i) => `<path data-node="${esc(frame.nodeIds[i])}" d="${d.join("")}" stroke="${PALETTE[i % PALETTE.length]}" stroke-opacity="0.55" stroke-width="2.4" stroke-linecap="round"/>`).join("")
  + frame.ridges.map((r) => `<polyline points="${r.line.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}" fill="none" stroke="#f0f1eb" stroke-opacity="0.35" stroke-width="1"/>`).join("")
  + `</svg>`;
const buttons = frame.nodeIds.map((id, i) => `<button type="button" data-node="${esc(id)}" style="color:${PALETTE[i % PALETTE.length]}">${esc(id)} · ${esc(frame.nodeRoles[i])}</button>`).join("");
const cards = recorded.map((job, i) => `<article><h2>${esc(job.label)}</h2><p class="price">${job.output} PLN</p><p class="trace">${esc(traces[i])}</p></article>`).join("");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quote with a floor</title>
<style>
  body { margin: 0; font: 16px/1.45 ui-sans-serif, system-ui, sans-serif; background: #f4f1ea; color: #1c1915; }
  main { max-width: 920px; margin: 0 auto; padding: 24px 20px 48px; }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  .warn { background: #fff4cc; border: 1px solid #e0c56a; padding: 12px 14px; margin: 16px 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  article, .panel { background: #fff; border: 1px solid #ddd6c8; padding: 12px 14px; }
  .price { font-size: 1.8rem; margin: 4px 0; }
  .trace { font-family: ui-monospace, monospace; font-size: 0.85rem; }
  figure { margin: 16px 0; background: #10141c; }
  svg { width: 100%; height: auto; display: block; }
  .nodes { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  button { background: #fff; border: 1px solid #ddd6c8; padding: 6px 10px; font: inherit; cursor: pointer; }
  button[aria-pressed="true"] { outline: 2px solid currentColor; }
  code, textarea { font-family: ui-monospace, monospace; font-size: 0.8rem; }
  textarea { width: 100%; height: 9rem; }
  @media (max-width: 700px) { .grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
  <h1>Quote with a floor</h1>
  <p>The price is the machining cost, and at least 150 PLN. The rate and the floor are constants in the program. You supply the minutes.</p>
  <p class="warn">This file is a view. The audit is the log beside it. Opening this file does not prove the run. Run <code>replay</code> and <code>verify</code> on <code>audit.jsonl</code>.</p>
  <div class="grid">${cards}</div>
  <figure>${svg}<figcaption>Each coloured region belongs to one step. Selecting a step does not run the program. A new floor makes a new program name. The picture can keep the same shape.</figcaption></figure>
  <div class="nodes">${buttons}</div>
  <section class="panel">
    <h2>Audit</h2>
    <p>Program <code>${esc(program.id)}</code>. Stored once. Two decisions use it.</p>
    <ul>${recorded.map((job) => `<li>${esc(job.label)} → decision <code>${esc(job.decision)}</code> → ${job.output} PLN</li>`).join("")}</ul>
    <p>Replay of both decisions reproduced the prices. The chain check passed. No person has approved these runs.</p>
    <p>The SDK keeps a session in memory. A saved session is labeled asserted until a new run. This log is the durable record.</p>
  </section>
  <section class="panel">
    <h2>Source</h2>
    <p>Give this source to another person. A new session recovers the same program name. A genome is this source in another encoding. It is not a web link.</p>
    <textarea readonly>${esc(program.source)}</textarea>
  </section>
</main>
<script>
  const paths = document.querySelectorAll("path[data-node]");
  document.querySelectorAll("button[data-node]").forEach((button) => {
    button.addEventListener("click", () => {
      const on = button.getAttribute("aria-pressed") !== "true";
      document.querySelectorAll("button[data-node]").forEach((b) => b.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", on ? "true" : "false");
      paths.forEach((path) => {
        const mine = path.getAttribute("data-node") === button.getAttribute("data-node");
        path.setAttribute("stroke-opacity", on && mine ? "1" : "0.55");
        path.setAttribute("stroke-width", on && mine ? "4" : "2.4");
      });
    });
  });
</script>
</body>
</html>
`;
const page = join(dir, "quote.html");
writeFileSync(page, html);

console.log("Quote with a floor. Same program, two supplied minute counts.");
console.log(`42 min → ${recorded[0].output} PLN`);
console.log(`10 min → ${recorded[1].output} PLN`);
console.log(`program ${program.id} stored once: ${programs === 1 ? "yes" : "NO"}`);
console.log(`sdk reproduce matches: ${sdkMatch ? "yes" : "NO"}`);
console.log(`audit replay: reproduced=true, chain ok`);
console.log("This file is a view. The audit is the log beside it.");
console.log(`open: ${pathToFileURL(page).href}`);
console.log(`log: ${logPath}`);
