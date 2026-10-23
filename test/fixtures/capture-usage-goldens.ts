import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tokenTotals } from "../../src/audit.js";
import { bustSignals, turnTokens, type SessionCall } from "../../src/contextView.js";
import { gen } from "../helpers.js";

export interface UsageGoldenInput { provider: string; usage?: Record<string, unknown>; previous?: { provider: string; usage?: Record<string, unknown> }; calls: { kind: string; upstreamStatus: number; decision?: { action: string }; usage?: Record<string, unknown> }[] }

export function usageInputs(seed: number, count: number): UsageGoldenInput[] {
  const g = gen(seed);
  const count_ = (): unknown => {
    const r = g.int(20);
    return r < 3 ? undefined : r === 3 ? -g.int(500) : r === 4 ? g.int(50) + 0.5 : r === 5 ? String(g.int(99)) : r === 6 ? 2 ** 40 + g.int(9) : r === 7 ? null
      : g.int(3) === 0 ? 1024 + g.int(9000) : g.int(2000);
  };
  const usage = () => (g.int(8) === 0 ? undefined : Object.fromEntries(["input", "output", "cached", "cacheWrite"].map((k) => [k, count_()]).filter(([, v]) => v !== undefined)));
  const provider = () => g.pick(["openai", "anthropic"]);
  return Array.from({ length: count }, (): UsageGoldenInput => ({
    provider: provider(), usage: usage(), previous: g.int(5) === 0 ? undefined : { provider: provider(), usage: usage() },
    calls: Array.from({ length: g.int(6) }, () => ({ kind: g.int(10) === 0 ? "decision" : "llm-call", upstreamStatus: g.pick([200, 200, 200, 302, 429, 500]), decision: g.int(6) === 0 ? { action: "block" } : undefined, usage: usage() })),
  }));
}

export function usageOutputs(input: UsageGoldenInput) {
  const session = { id: "s", turn: 2, digest: "d2", parent: "d1", messages: 2 };
  const call = (provider: string, usage?: Record<string, unknown>) => ({ id: "c", ts: "t", provider, usage, session, context: { bytes: {}, totalBytes: 0, tokenBasis: "unknown" } }) as unknown as SessionCall;
  return {
    turn: turnTokens({ provider: input.provider, usage: input.usage as SessionCall["usage"] }),
    bust: bustSignals(call(input.provider, input.usage), input.previous && call(input.previous.provider, input.previous.usage)),
    totals: tokenTotals(input.calls),
  };
}

const sources = ["src/audit.ts", "src/contextView.ts", "src/extract.ts"];
const goldenPath = new URL("../../../test/fixtures/usage-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = usageInputs(30, 300).map((input) => ({ input, output: usageOutputs(input) }));
  const sourceSha256 = Object.fromEntries(sources.map((s) => [s, createHash("sha256").update(readFileSync(new URL(`../../../${s}`, import.meta.url))).digest("hex")]));
  writeFileSync(goldenPath, JSON.stringify({ source: "turnTokens, bustSignals, tokenTotals", sourceSha256, seed: 30, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases`);
}
