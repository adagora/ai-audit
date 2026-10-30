import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tokenTotals } from "../src/audit.js";
import { BEND_NAT_MAX } from "../src/context.js";
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

test("usage: a token count above 2^48-1 (281 trillion) is unknown, where Bend's numbers end; the TypeScript counted it", () => {
  const huge = 2 ** 48, call = (usage: object) => ({ kind: "llm-call", upstreamStatus: 200, usage });
  assert.deepEqual(tokenTotals([call({ input: huge, output: 1 }), call({ input: huge - 1, output: 1 })]),
    { inputTokens: huge - 1, outputTokens: 2, unknownInputUsage: 1, unknownOutputUsage: 0, unknownUsage: 1, tokensComplete: false });
  assert.deepEqual(turnTokens({ provider: "anthropic", usage: { input: 10, cached: huge, output: 1 } }), { cacheRead: 0, cacheWrite: 0, input: 10, output: 1, prompt: 10 });
  assert.equal(tokenTotalsReference([call({ input: huge, output: 1 })]).inputTokens, huge);
});

test("usage: found by fuzzing: a count that would push a token sum past 2^48-1 is unknown, so stats, report and the session view do not throw (ADR 0012, ADR 0029)", () => {
  const max = BEND_NAT_MAX, billedCall = (usage: object) => ({ kind: "llm-call", upstreamStatus: 200, usage });
  assert.deepEqual(tokenTotals([billedCall({ input: max, output: 1 }), billedCall({ input: 1, output: max }), billedCall({ input: 2, output: 3 })]),
    { inputTokens: max, outputTokens: 4, unknownInputUsage: 2, unknownOutputUsage: 1, unknownUsage: 2, tokensComplete: false });
  const unknownTurn = { cacheRead: null, cacheWrite: null, input: null, output: 1, prompt: null };
  assert.deepEqual(turnTokens({ provider: "anthropic", usage: { input: max, cached: 1, output: 1 } }), unknownTurn);
  assert.deepEqual(turnTokens({ provider: "anthropic", usage: { input: 1, cacheWrite: max, output: 1 } }), unknownTurn);
  assert.deepEqual(turnTokens({ provider: "openai", usage: { input: max, cached: 2 ** 47, output: 1 } }), unknownTurn);
  assert.deepEqual(turnTokens({ provider: "openai", usage: { input: max, cached: 2 ** 47 - 1, output: 1 } }), { cacheRead: 2 ** 47 - 1, cacheWrite: null, input: 2 ** 47, output: 1, prompt: max });
  assert.deepEqual(bustSignals(call("anthropic", { input: 0, cached: 2 ** 47, output: 1 }), call("anthropic", { input: 10, cached: 5000, output: 1 })), []);
});
