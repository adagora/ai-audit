import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { admission, charge, validateBudget } from "../src/budget.js";
import { BEND_NAT_MAX } from "../src/context.js";
import { admissionInput, budgetInputs, budgetOutcome, chargeInput, type BudgetGoldenInput } from "./fixtures/capture-budget-goldens.js";
import { admissionReference, chargeReference } from "./budgetReference.js";
import { gen } from "./helpers.js";

const goldens: { cases: { input: BudgetGoldenInput; output: unknown }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/budget-goldens.json", import.meta.url), "utf8"));
const reference = { admission: admissionReference, charge: chargeReference } as unknown as NonNullable<Parameters<typeof budgetOutcome>[1]>;
const UNAVAILABLE = { error: "audit_budget_unavailable" };
const beyondBend = (n: unknown) => Number.isSafeInteger(n) && (n as number) > BEND_NAT_MAX;

function atBendBoundary(input: BudgetGoldenInput, typescript: unknown) {
  if ("admission" in input) {
    const { state, limits, request } = input.admission, used = (k: "input" | "output") => Object.values(state.pending).reduce((n, v) => n + v[k], state.spent[k]);
    return !state.blocked && [used("input"), used("output"), request.input, request.output, limits.input, limits.output].some((n) => n > BEND_NAT_MAX) ? UNAVAILABLE : typescript;
  }
  const { reserved, usage, anthropic } = input.charge;
  if (reserved.input > BEND_NAT_MAX || reserved.output > BEND_NAT_MAX) return UNAVAILABLE;
  const kept: Record<string, unknown> = Object.fromEntries(Object.entries(usage ?? {}).filter(([, n]) => !beyondBend(n)));
  const count = (k: string) => (Number.isSafeInteger(kept[k]) && (kept[k] as number) >= 0 ? (kept[k] as number) : 0);
  if (anthropic && Number.isSafeInteger(kept.input) && (kept.input as number) >= 0 && count("input") + count("cached") + count("cacheWrite") > BEND_NAT_MAX) delete kept.input;
  if (Object.keys(kept).length === Object.keys(usage ?? {}).length) return typescript;
  return budgetOutcome({ charge: { reserved, usage: kept, anthropic } }, reference);
}

test("budget: every golden captured from the TypeScript admission and charge is reproduced, except where a number passes 2^48-1, where Bend's numbers end (ADR 0044, ADR 0029)", () => {
  assert.equal(goldens.cases.length, budgetInputs().length);
  for (const c of goldens.cases) assert.deepEqual(budgetOutcome(c.input), atBendBoundary(c.input, c.output), JSON.stringify(c.input));
});

test("budget: same admission and charge as the TypeScript reference on 20,000 generated inputs, with the same rule at 2^48-1 (ADR 0044, ADR 0029)", () => {
  const g = gen(91);
  for (let n = 0; n < 10_000; n++) for (const input of [{ admission: admissionInput(g) }, { charge: chargeInput(g) }] as BudgetGoldenInput[])
    assert.deepEqual(budgetOutcome(input), atBendBoundary(input, budgetOutcome(input, reference)), JSON.stringify(input));
});

test("budget: past 2^48-1 an admission is unavailable unless the budget is blocked, a usage count is unknown, and a limit is a config error (ADR 0044, ADR 0029)", () => {
  const max = BEND_NAT_MAX, open = { spent: { input: 0, output: 0 }, pending: {} };
  assert.equal(admission(open, { input: max, output: max }, { input: max, output: 0 }), "ok");
  assert.throws(() => admission(open, { input: max + 1, output: 1 }, { input: 0, output: 0 }), /audit_budget_unavailable/);
  assert.throws(() => admission({ ...open, pending: { a: { input: max, output: 0 }, b: { input: 1, output: 0 } } }, { input: max, output: 1 }, { input: 0, output: 0 }), /audit_budget_unavailable/);
  assert.equal(admission({ ...open, blocked: true }, { input: max + 1, output: 1 }, { input: max + 1, output: 0 }), "blocked");
  assert.deepEqual(charge({ input: 10, output: 10 }, { input: max + 1, output: 4 }, false), { charged: { input: 10, output: 4 }, inputKnown: false, outputKnown: true, overrun: false });
  assert.deepEqual(charge({ input: 10, output: 10 }, { input: max, cached: 1, output: 4 }, true), { charged: { input: 10, output: 4 }, inputKnown: false, outputKnown: true, overrun: false });
  assert.deepEqual(charge({ input: 10, output: 10 }, { input: max, output: 4 }, true), { charged: { input: max, output: 4 }, inputKnown: true, outputKnown: true, overrun: true });
  assert.throws(() => charge({ input: max + 1, output: 0 }, undefined, false), /audit_budget_unavailable/);
  assert.throws(() => validateBudget({ period: "day", inputTokens: max + 1, outputTokens: 1, maxOutputTokens: 1 }), /audit_budget_config_invalid/);
  assert.doesNotThrow(() => validateBudget({ period: "day", inputTokens: max, outputTokens: max, maxOutputTokens: max }));
});
