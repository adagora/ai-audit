import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateInjection, readInjectionDataset } from "../src/injectionEval.js";

const script = fileURLToPath(new URL("../../scripts/results.mjs", import.meta.url));
const results = await import(new URL("../../scripts/results.mjs", import.meta.url).href);
const ROOT: string = results.ROOT;
const CASES = "examples/injection-evaluation/cases.json", ORDINARY = "examples/injection-evaluation/ordinary.json";

test("every generated block in the docs matches what npm run results computes from the committed data", () => {
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), "results: every generated block is current");
});

test("a hand edit inside a generated block is replaced by the computed text", async () => {
  const docs: Map<string, string> = await results.renderDocs();
  const page = docs.get("docs/prompt-injection.md")!;
  const edited = page.replace("| 11 of 18 |", "| 12 of 18 |");
  assert.notEqual(edited, page);
  assert.equal(results.replaceBlock(edited, "injection-regex", await results.regexBlock()), page);
  assert.throws(() => results.replaceBlock("no markers here", "injection-regex", ""), /missing block injection-regex/);
});

test("the regex block follows the cases: one attack fewer in the data is one fewer in the table", async () => {
  const root = mkdtempSync(join(tmpdir(), "results-")), dir = join(root, "examples/injection-evaluation");
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(ROOT, ORDINARY), join(root, ORDINARY));
  const cases = JSON.parse(readFileSync(join(ROOT, CASES), "utf8"));
  cases.cases.splice(cases.cases.findIndex((c: { expected: string }) => c.expected === "injection"), 1);
  writeFileSync(join(root, CASES), JSON.stringify(cases));
  assert.match(await results.regexBlock(root), /\| attacks caught \| .* \| \d+ of 17 \|/);
});

test("saved model runs render as one row each, with the range over repeats, and a run on older data is labeled", async () => {
  const dataset = readInjectionDataset(join(ROOT, CASES));
  let call = 0;
  const judge = {
    profile: { version: "test", model: "fake-model", digest: "0".repeat(64) },
    check: async () => ({ status: "ok" as const, verdict: (call++ % 2 ? "benign" : "injection") as "benign" | "injection", category: "none" as never, modelDigest: "f".repeat(64), durationMs: 1500 }),
  };
  const report = JSON.parse(JSON.stringify(await evaluateInjection(dataset, { judge: judge as never, repeats: 2 })));
  const raw = JSON.stringify(report);
  for (const c of dataset.cases) assert.ok(!raw.includes(c.content) && !raw.includes(c.task), `case text of ${c.id} is in the report`);
  const block = results.modelBlock(ROOT, [{ file: "2026-10-29-fake-cases.json", report }, { file: "old.json", report: { ...report, datasetDigest: "0".repeat(64) } }]);
  assert.match(block, /\| `2026-10-29-fake-cases\.json` \| fake-model \| cases \| 2 \| 0–18 of 18 \| 0–18 of 18 \| 36 of 36 cases \| 1\.5 s \(max 1\.5 s\) \| 0 of 72 \|/);
  assert.match(block, /\| `old\.json` \| fake-model \| changed since this run \|/);
  assert.match(results.modelBlock(ROOT, []), /^No model run is stored/);
});

test("model runs saved in docs/evidence carry no case text", () => {
  const texts = [CASES, ORDINARY].flatMap((f) => readInjectionDataset(join(ROOT, f)).cases.flatMap((c) => [c.task, c.content]));
  for (const { file, report } of results.evidenceReports() as { file: string; report: unknown }[]) {
    const raw = JSON.stringify(report);
    assert.ok(texts.every((t) => !raw.includes(t)), `${file} contains case text`);
  }
});

test("the hand-written speed claims in the READMEs agree with the measured data", () => {
  const data = JSON.parse(readFileSync(join(ROOT, "docs/performance/2026-10-20/results.json"), "utf8")).results as { case: string; conc: number; overhead: { p50: number; p95: number }; proxy: { rps: number } }[];
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[(xs.length - 1) >> 1];
  const medians = (conc: number, pick: (r: (typeof data)[number]) => number) =>
    [...new Set(data.map((r) => r.case))].map((name) => median(data.filter((r) => r.case === name && r.conc === conc).map(pick)));
  const readme = readFileSync(join(ROOT, "README.md"), "utf8"), page = readFileSync(join(ROOT, "docs/performance/2026-10-20/README.md"), "utf8");
  assert.ok(readme.includes("0.6 to 0.7 ms p50 and about 1.1 ms p95") && page.includes("about 0.6–0.7 ms at p50 and about 1.1 ms at p95"));
  assert.ok(medians(1, (r) => r.overhead.p50).every((v) => Math.round(v * 10) / 10 >= 0.6 && Math.round(v * 10) / 10 <= 0.7));
  assert.ok(medians(1, (r) => r.overhead.p95).every((v) => Math.round(v * 10) / 10 === 1.1));
  assert.ok(readme.includes("levels off near 2000 requests per second") && page.includes("tops out at about 2000 req/s"));
  assert.ok(medians(16, (r) => r.proxy.rps).every((v) => v >= 1900 && v <= 2100));
});
