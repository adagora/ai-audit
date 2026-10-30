import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { admissionInput, budgetInputs, budgetOutcome, chargeInput, type BudgetGoldenInput } from "./fixtures/capture-budget-goldens.js";
import { admissionReference, chargeReference } from "./budgetReference.js";
import { gen } from "./helpers.js";

const goldens: { cases: { input: BudgetGoldenInput; output: unknown }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/budget-goldens.json", import.meta.url), "utf8"));
const reference = { admission: admissionReference, charge: chargeReference } as unknown as NonNullable<Parameters<typeof budgetOutcome>[1]>;

test("budget: every golden captured from the TypeScript admission and charge is reproduced (ADR 0044)", () => {
  assert.equal(goldens.cases.length, budgetInputs().length);
  for (const c of goldens.cases) assert.deepEqual(budgetOutcome(c.input), c.output, JSON.stringify(c.input));
});

test("budget: same admission and charge as the TypeScript reference on 20,000 generated inputs (ADR 0044)", () => {
  const g = gen(91);
  for (let n = 0; n < 10_000; n++) for (const input of [{ admission: admissionInput(g) }, { charge: chargeInput(g) }] as BudgetGoldenInput[])
    assert.deepEqual(budgetOutcome(input), budgetOutcome(input, reference), JSON.stringify(input));
});
