import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateInjection, readInjectionDataset } from "../dist/src/injectionEval.js";

export const ROOT = new URL("..", import.meta.url).pathname;
const CASES = "examples/injection-evaluation/cases.json", ORDINARY = "examples/injection-evaluation/ordinary.json";
const EVIDENCE = "docs/evidence/injection", PERFORMANCE = "docs/performance/2026-10-20/results.json";
const short = (hex) => hex.slice(0, 12);
const fileDigest = (root, path) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
const of = (n, d) => `${n} of ${d}`;
const range = (xs) => (xs.length ? (Math.min(...xs) === Math.max(...xs) ? String(xs[0]) : `${Math.min(...xs)}–${Math.max(...xs)}`) : "—");
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[(s.length - 1) >> 1]; };
const seconds = (xs) => (xs.length ? `${(median(xs) / 1000).toFixed(1)} s (max ${(Math.max(...xs) / 1000).toFixed(1)} s)` : "—");
const LANGUAGES = [["en", "English"], ["pl", "Polish"], ["mixed", "mixed"]];

export async function regexBlock(root = ROOT) {
  const cases = await evaluateInjection(readInjectionDataset(join(root, CASES)));
  const ordinary = await evaluateInjection(readInjectionDataset(join(root, ORDINARY)));
  const cell = (rows, expected) => { const sel = rows.filter((r) => r.expected === expected); return of(sel.filter((r) => r.rules.length).length, sel.length); };
  const byLanguage = (expected) => LANGUAGES.map(([code]) => cell(cases.rows.filter((r) => r.language === code), expected));
  return [
    `Regex rules on \`${CASES}\` (sha256 ${short(fileDigest(root, CASES))}…) and \`${ORDINARY}\` (sha256 ${short(fileDigest(root, ORDINARY))}…), rules digest ${short(cases.regexDigest)}…:`, "",
    `| regex rules | ${LANGUAGES.map(([, name]) => name).join(" | ")} | all |`, "|---|---|---|---|---|",
    `| attacks caught | ${byLanguage("injection").join(" | ")} | ${cell(cases.rows, "injection")} |`,
    `| harmless cases flagged | ${byLanguage("benign").join(" | ")} | ${cell(cases.rows, "benign")} |`,
    `| ordinary chunks flagged | — | — | — | ${cell(ordinary.rows, "benign")} |`,
  ].join("\n");
}

export function evidenceReports(root = ROOT) {
  const dir = join(root, EVIDENCE);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((file) => ({ file, report: JSON.parse(readFileSync(join(dir, file), "utf8")) }));
}

export function modelBlock(root = ROOT, reports = evidenceReports(root)) {
  if (!reports.length) return `No model run is stored in \`${EVIDENCE}/\` yet. Save a run there with \`npm run example:injection -- --ollama --repeats 3 --output ${EVIDENCE}/<date>-<model>-<dataset>.json\`, then run \`npm run results -- --write\`.`;
  const datasets = new Map([[readInjectionDataset(join(root, CASES)), "cases"], [readInjectionDataset(join(root, ORDINARY)), "ordinary"]]
    .map(([dataset, name]) => [createHash("sha256").update(JSON.stringify(dataset)).digest("hex"), name]));
  const lines = ["| run | model | dataset | repeats | attacks caught | harmless flagged | changed between repeats | time, first repeat: p50 (max) | not decided |", "|---|---|---|---|---|---|---|---|---|"];
  for (const { file, report } of reports) {
    const dataset = datasets.get(report.datasetDigest) ?? "changed since this run";
    const perRepeat = (expected) => Array.from({ length: report.repeats }, (_, i) => report.rows.filter((r) => r.expected === expected && r.samples[i]?.status === "ok" && r.samples[i].verdict === "injection").length);
    const total = (expected) => report.rows.filter((r) => r.expected === expected).length;
    const samples = report.rows.flatMap((r) => r.samples);
    const undecided = samples.filter((s) => s.status !== "ok" || s.verdict === "uncertain").length;
    const changed = report.rows.filter((r) => new Set(r.samples.filter((s) => s.status === "ok").map((s) => s.verdict)).size > 1).length;
    lines.push(`| \`${file}\` | ${report.judge?.model ?? "—"} | ${dataset} | ${report.repeats} | ${total("injection") ? `${range(perRepeat("injection"))} of ${total("injection")}` : "—"} | ${total("benign") ? `${range(perRepeat("benign"))} of ${total("benign")}` : "—"} | ${of(changed, report.rows.length)} cases | ${seconds(report.rows.flatMap((r) => (r.samples[0] ? [r.samples[0].durationMs] : [])))} | ${undecided} of ${samples.length} |`);
  }
  return lines.join("\n");
}

export function performanceBlock(root = ROOT) {
  const data = JSON.parse(readFileSync(join(root, PERFORMANCE), "utf8")), groups = new Map();
  for (const r of data.results) { const key = `${r.case}|${r.conc}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r); }
  const cell = (rows, pick) => { const v = rows.map(pick); return `${median(v).toFixed(2)} [${Math.min(...v).toFixed(2)}–${Math.max(...v).toFixed(2)}]`; };
  const rps = (rows, side) => `~${Math.round(median(rows.map((r) => r[side].rps)) / 10) * 10}`;
  const order = [...groups.keys()].sort((a, b) => Number(a.split("|")[1]) - Number(b.split("|")[1]));
  return [`Median of ${groups.values().next().value.length} runs [min–max], added latency in ms, from \`${PERFORMANCE}\`:`, "",
    "| case | conc | +p50 | +p95 | +p99 | rps direct → proxy | audit lines |", "|---|---|---|---|---|---|---|",
    ...order.map((key) => { const rows = groups.get(key), [name, conc] = key.split("|");
      return `| ${name.replace("+", " + ")} | ${conc} | ${cell(rows, (r) => r.overhead.p50)} | ${cell(rows, (r) => r.overhead.p95)} | ${cell(rows, (r) => r.overhead.p99)} | ${rps(rows, "direct")} → ${rps(rows, "proxy")} | ${rows.every((r) => r.auditLines === r.expected) ? "all" : "missing"} |`; })].join("\n");
}

export const BLOCKS = [
  { file: "docs/prompt-injection.md", name: "injection-regex", render: regexBlock },
  { file: "docs/prompt-injection.md", name: "injection-models", render: modelBlock },
  { file: "docs/performance/2026-10-20/README.md", name: "performance", render: performanceBlock },
];
const marker = (name) => [`<!-- results:${name} (generated by npm run results; do not edit) -->`, `<!-- /results:${name} -->`];

export function replaceBlock(text, name, body) {
  const [open, close] = marker(name), start = text.indexOf(open), end = text.indexOf(close);
  if (start < 0 || end < start) throw new Error(`missing block ${name}`);
  return text.slice(0, start + open.length) + "\n" + body + "\n" + text.slice(end);
}

export async function renderDocs(root = ROOT) {
  const docs = new Map();
  for (const { file, name, render } of BLOCKS) docs.set(file, replaceBlock(docs.get(file) ?? readFileSync(join(root, file), "utf8"), name, await render(root)));
  return docs;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const write = process.argv.includes("--write"), stale = [];
  for (const [file, text] of await renderDocs()) {
    if (text === readFileSync(join(ROOT, file), "utf8")) continue;
    stale.push(file);
    if (write) writeFileSync(join(ROOT, file), text);
  }
  if (!stale.length) console.log("results: every generated block is current");
  else if (write) console.log(`results: rewrote ${stale.join(", ")}`);
  else { console.error(`results: out of date in ${stale.join(", ")}; run npm run results -- --write`); process.exitCode = 1; }
}
