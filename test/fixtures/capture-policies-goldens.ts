import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { policyHistories } from "../../src/policies.js";
import { gen, type Gen } from "../helpers.js";

export type PolicyFilter = { systemId?: string; useCase?: string };
export interface PoliciesGoldenInput { records: unknown[]; filter: PolicyFilter }

const SYSTEMS = ["s1", "s2", "", null, "absent"] as const;
const USE_CASES = ["u1", "u2", "x", null, "absent"] as const;
const SOURCES = ["h1", "h2", "h3", "h4", "h5"];
const NAMES = ["v1", "v2", ""];

export function policyRecords(g: Gen, decisions: number): unknown[] {
  const records: unknown[] = [];
  let clock = 0;
  const ts = () => `t${clock++}`;
  const often = <T,>(xs: readonly T[]) => (g.int(10) < 8 ? xs[g.int(2)] : g.pick(xs));
  const field = (name: string, v: string | null) => (v === "absent" ? {} : { [name]: v });
  for (const s of SOURCES) if (g.int(3)) records.push({ kind: "program", id: s, ts: ts(), ...(g.int(4) ? { name: g.pick(NAMES) } : g.int(2) ? {} : { name: 7 }) });
  for (let n = 0; n < decisions; n++) {
    const id = g.int(12) ? `d${n}` : `d${g.int(n + 1)}`, at = ts();
    const decision = { kind: "decision", id, ts: at, ...field("systemId", often(SYSTEMS)), ...field("useCase", often(USE_CASES)) };
    const step = { kind: "decision", id: `${id}:qdl`, ts: at, refId: id, qdl: { sourceHash: g.int(15) ? often(SOURCES.slice(g.int(3))) : g.pick([42, null]) } };
    const roll = g.int(20);
    if (roll === 0) records.push(decision);
    else if (roll === 1) records.push(step, decision);
    else if (roll === 2) records.push(decision, step, { ...step, qdl: { sourceHash: g.pick(SOURCES) } });
    else records.push(decision, step);
    if (g.int(8) === 0) records.push(g.pick<unknown>([{ kind: "llm-call", id: `c${n}`, ts: at }, { kind: "review", id: `r${n}`, ts: at, refId: id }, null, { kind: "decision", id: `q${n}`, ts: at, qdl: { sourceHash: g.pick(SOURCES) } }]));
  }
  return records;
}

const filterOf = (g: Gen): PolicyFilter => {
  const pick = (xs: readonly (string | null)[]) => xs.filter((x): x is string => typeof x === "string" && x !== "absent")[g.int(3)];
  const f = g.int(6);
  return f === 0 ? { systemId: pick(SYSTEMS) } : f === 1 ? { useCase: pick(USE_CASES) } : f === 2 ? { systemId: pick(SYSTEMS), useCase: pick(USE_CASES) } : {};
};

const decision = (id: string, systemId: string | null | undefined, useCase: string | null | undefined, sourceHash: string, at: string) => [
  { kind: "decision", id, ts: at, ...(systemId !== undefined && { systemId }), ...(useCase !== undefined && { useCase }) },
  { kind: "decision", id: `${id}:qdl`, ts: at, refId: id, qdl: { sourceHash } },
];
const EDGES: PoliciesGoldenInput[] = [
  { records: [], filter: {} },
  { records: decision("a", "s", "u", "h1", "t1"), filter: {} },
  { records: [{ kind: "program", id: "h1", ts: "t0", name: "v1" }, { kind: "program", id: "h2", ts: "t0", name: "v2" },
    ...decision("a", "s", "u", "h1", "t1"), ...decision("b", "s", "u", "h2", "t2"), ...decision("c", "s", "u", "h1", "t3")], filter: {} },
  { records: [...decision("a", "s", "u", "h1", "t1"), ...decision("b", "s", "v", "h2", "t2"), ...decision("c", "s", "u", "h2", "t3"), ...decision("d", "s", "v", "h1", "t4")], filter: {} },
  { records: [...decision("a", "s", "u", "h1", "t1"), ...decision("b", "s", "v", "h2", "t2")], filter: { useCase: "nothing" } },
  { records: [{ kind: "decision", id: "a", ts: "t1", systemId: "s", useCase: "u" }, ...decision("b", "s", "u", "h1", "t2")], filter: { systemId: "s", useCase: "u" } },
  { records: [...decision("a", null, "u", "h1", "t1"), ...decision("b", undefined, "u", "h2", "t2")], filter: {} },
  { records: [...decision("a", undefined, "u", "h1", "t1"), ...decision("b", null, "u", "h2", "t2")], filter: {} },
];

export const policiesInputs = (): PoliciesGoldenInput[] => {
  const g = gen(80);
  return [...EDGES, ...Array.from({ length: 200 }, (_, n) => ({ records: policyRecords(g, n < 20 ? n : 3 + g.int(10)), filter: filterOf(g) }))];
};

const goldenPath = new URL("../../../test/fixtures/policies-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = policiesInputs().map((input) => ({ input, output: policyHistories(input.records, input.filter) }));
  const sourceSha256 = createHash("sha256").update(readFileSync(new URL("../../../src/policies.ts", import.meta.url))).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/policies.ts policyHistories", sourceSha256, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases from src/policies.ts ${sourceSha256.slice(0, 16)}`);
}
