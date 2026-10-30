import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { Rec } from "../../src/audit.js";
import { effectAuthorized } from "../../src/verdict.js";
import { gen, type Gen } from "../helpers.js";

const rec = (r: object) => r as unknown as Rec;
const ACTIONS = ["send", "route", "refund"], STATUSES = ["simulated", "proposed", "done"], VERDICTS = ["approved", "rejected", "overridden", "approved", "maybe"];

function output(g: Gen): unknown {
  const proposed = () => ({ action: g.pick(ACTIONS), status: g.pick(STATUSES) });
  const list = Array.from({ length: g.int(3) }, proposed);
  return g.pick<unknown>([list, list, Object.fromEntries(list.map((p, n) => [`step${n}`, p])), null, "text", [{ action: 7, status: "simulated" }]]);
}

export function verdictLog(g: Gen, steps: number): Rec[] {
  const records: Rec[] = [], decisions: string[] = [];
  let clock = 0;
  const ts = () => `t${clock++}`, someDecision = () => (decisions.length && g.int(10) ? g.pick(decisions) : `d${g.int(99)}`);
  for (let n = 0; n < steps; n++) {
    const roll = g.int(10);
    if (roll < 3 || !decisions.length) {
      const id = g.int(15) ? `d${n}` : g.pick(decisions.length ? decisions : ["d0"]);
      decisions.push(id);
      records.push(rec({ kind: "decision", id, ts: ts(), output: output(g) }));
      if (g.int(6) === 0) records.push(rec({ kind: "decision", id: `${id}:qdl`, ts: ts(), refId: id, qdl: {}, output: output(g) }));
    } else if (roll < 5) {
      records.push(rec({ kind: "review", id: `r${n}`, ts: ts(), refId: someDecision(), ...(g.int(12) && { review: { reviewer: "ada", decision: g.pick(VERDICTS), at: ts() } }) }));
    } else if (roll < 9) {
      records.push(rec({ kind: "effect", id: g.int(20) ? `e${n}` : `e${g.int(n + 1)}`, ts: ts(), refId: someDecision(), ...(g.int(15) && { effect: { action: g.pick(ACTIONS), status: g.pick(["done", "done", "skipped", "failed"]) } }) }));
    } else records.push(g.pick([rec({ kind: "llm-call", id: `c${n}`, ts: ts() }), rec({ kind: "review", id: `e${n}`, ts: ts(), refId: someDecision(), review: { reviewer: "bo", decision: "approved", at: ts() } })]));
  }
  return records;
}

export const effectIds = (records: readonly Rec[]) => [...new Set(records.filter((r) => r.kind === "effect").map((r) => r.id)), "missing"];
export interface VerdictGoldenInput { records: Rec[] }

export const verdictInputs = (): VerdictGoldenInput[] => {
  const g = gen(100);
  return Array.from({ length: 200 }, (_, n) => ({ records: verdictLog(g, n < 20 ? n : 5 + g.int(30)) }));
};

const goldenPath = new URL("../../../test/fixtures/verdict-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = verdictInputs().map((input) => ({ input, output: effectIds(input.records).map((id) => [id, effectAuthorized(input.records, id)]) }));
  const sourceSha256 = createHash("sha256").update(readFileSync(new URL("../../../src/verdict.ts", import.meta.url))).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/verdict.ts effectAuthorized", sourceSha256, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} logs, ${cases.reduce((n, c) => n + c.output.length, 0)} effects from src/verdict.ts ${sourceSha256.slice(0, 16)}`);
}
