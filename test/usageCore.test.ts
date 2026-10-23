import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tokenTotals } from "../src/audit.js";
import { bustSignals, turnTokens, type SessionCall } from "../src/contextView.js";
import { usageInputs, usageOutputs, type UsageGoldenInput } from "./fixtures/capture-usage-goldens.js";
import { bustSignalsReference, tokenTotalsReference, turnTokensReference } from "./usageReference.js";

const goldens: { cases: { input: UsageGoldenInput; output: unknown }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/usage-goldens.json", import.meta.url), "utf8"));
const session = { id: "s", turn: 2, digest: "d2", parent: "d1", messages: 2 };
const call = (provider: string, usage?: Record<string, unknown>) => ({ id: "c", ts: "t", provider, usage, session, context: { bytes: {}, totalBytes: 0, tokenBasis: "unknown" } }) as unknown as SessionCall;

test("usage: every golden captured from the TypeScript turn tokens, bust signals and totals is reproduced byte for byte (ADR 0012, ADR 0020)", () => {
  assert.equal(goldens.cases.length, 300);
  for (const c of goldens.cases) assert.equal(JSON.stringify(usageOutputs(c.input)), JSON.stringify(c.output), JSON.stringify(c.input));
});

test("usage: same output as the TypeScript reference on generated inputs and on a log of 200,000 calls", () => {
  for (const i of usageInputs(31, 20_000)) {
    const now = call(i.provider, i.usage), before = i.previous && call(i.previous.provider, i.previous.usage);
    assert.equal(JSON.stringify(turnTokens(now)), JSON.stringify(turnTokensReference(now)), JSON.stringify(i));
    assert.equal(JSON.stringify(bustSignals(now, before)), JSON.stringify(bustSignalsReference(now, before)), JSON.stringify(i));
    assert.equal(JSON.stringify(tokenTotals(i.calls)), JSON.stringify(tokenTotalsReference(i.calls)), JSON.stringify(i));
  }
  const log = Array.from({ length: 200_000 }, (_, i) => ({ kind: "llm-call", upstreamStatus: i % 50 ? 200 : 500, usage: i % 7 ? { input: 1 + (i % 900), output: i % 11 } : { output: 3 } }));
  assert.equal(JSON.stringify(tokenTotals(log)), JSON.stringify(tokenTotalsReference(log)));
});
