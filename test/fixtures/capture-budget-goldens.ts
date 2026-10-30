import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { admission, charge, type Tokens } from "../../src/budget.js";
import type { Usage } from "../../src/extract.js";
import { gen, type Gen } from "../helpers.js";

export interface AdmissionInput { state: { spent: Tokens; pending: Record<string, Tokens>; blocked?: boolean }; limits: Tokens; request: Tokens }
export interface ChargeInput { reserved: Tokens; usage?: Usage; anthropic: boolean }
export type BudgetGoldenInput = { admission: AdmissionInput } | { charge: ChargeInput };

const BEND_EDGE = 2 ** 48 - 1, SAFE = Number.MAX_SAFE_INTEGER;
export const count = (g: Gen) => { const r = g.int(20); return r < 10 ? g.int(12) : r < 16 ? 1_000 * g.int(200) : r < 19 ? BEND_EDGE - 1 + g.int(3) : SAFE - g.int(3); };
const tokens = (g: Gen): Tokens => ({ input: count(g), output: count(g) });
const odd = (g: Gen): unknown => g.pick([undefined, undefined, -1, 1.5, "7", null, count(g), count(g), count(g)]);

export function admissionInput(g: Gen): AdmissionInput {
  const pending = Object.fromEntries(Array.from({ length: g.int(4) }, (_, n) => [`r${n}`, tokens(g)])), spent = tokens(g), request = tokens(g);
  const used = (k: keyof Tokens) => Object.values(pending).reduce((n, v) => n + v[k], spent[k]) + request[k];
  const limit = (k: keyof Tokens) => { const r = g.int(4); return r === 0 ? count(g) : Math.min(SAFE, Math.max(0, used(k) + g.int(5) - 2 + (r === 1 ? 1_000 : 0))); };
  return { state: { spent, pending, ...(g.int(6) === 0 && { blocked: g.int(2) === 0 }) }, limits: { input: limit("input"), output: limit("output") }, request };
}

export function chargeInput(g: Gen): ChargeInput {
  const usage = Object.fromEntries((["input", "output", "cached", "cacheWrite"] as const).map((k) => [k, odd(g)]).filter(([, v]) => v !== undefined)) as Usage;
  return { reserved: tokens(g), ...(g.int(8) && { usage }), anthropic: g.int(2) === 0 };
}

const EDGES: BudgetGoldenInput[] = [
  { admission: { state: { spent: { input: 0, output: 0 }, pending: {} }, limits: { input: 0, output: 0 }, request: { input: 0, output: 0 } } },
  { admission: { state: { spent: { input: 5, output: 5 }, pending: { a: { input: 3, output: 3 } } }, limits: { input: 10, output: 10 }, request: { input: 2, output: 2 } } },
  { admission: { state: { spent: { input: 5, output: 5 }, pending: { a: { input: 3, output: 3 } } }, limits: { input: 10, output: 10 }, request: { input: 3, output: 2 } } },
  { admission: { state: { spent: { input: 5, output: 5 }, pending: { a: { input: 3, output: 3 } } }, limits: { input: 10, output: 10 }, request: { input: 2, output: 3 } } },
  { admission: { state: { spent: { input: 11, output: 0 }, pending: {} }, limits: { input: 10, output: 10 }, request: { input: 0, output: 0 } } },
  { admission: { state: { spent: { input: 0, output: 0 }, pending: {}, blocked: true }, limits: { input: 10, output: 10 }, request: { input: 0, output: 0 } } },
  { admission: { state: { spent: { input: SAFE, output: 0 }, pending: { a: { input: 1, output: 0 } } }, limits: { input: SAFE, output: SAFE }, request: { input: 0, output: 0 } } },
  { charge: { reserved: { input: 10, output: 10 }, usage: { input: 4, output: 6 }, anthropic: false } },
  { charge: { reserved: { input: 10, output: 10 }, usage: { input: 4, output: 6, cached: 3, cacheWrite: 4 }, anthropic: true } },
  { charge: { reserved: { input: 10, output: 10 }, usage: { input: 4, output: 11 }, anthropic: false } },
  { charge: { reserved: { input: 10, output: 10 }, anthropic: true } },
  { charge: { reserved: { input: 10, output: 10 }, usage: { cached: 3, output: 2 }, anthropic: true } },
  { charge: { reserved: { input: 10, output: 10 }, usage: { input: SAFE, cached: 1 }, anthropic: true } },
];

export const budgetInputs = (): BudgetGoldenInput[] => {
  const g = gen(90);
  return [...EDGES, ...Array.from({ length: 300 }, (): BudgetGoldenInput => ({ admission: admissionInput(g) })), ...Array.from({ length: 300 }, (): BudgetGoldenInput => ({ charge: chargeInput(g) }))];
};

export function budgetOutcome(input: BudgetGoldenInput, core: { admission: typeof admission; charge: typeof charge } = { admission, charge }) {
  try {
    return { value: "admission" in input ? core.admission(input.admission.state, input.admission.limits, input.admission.request) : core.charge(input.charge.reserved, input.charge.usage, input.charge.anthropic) };
  } catch (e) { return { error: (e as Error).message }; }
}

const goldenPath = new URL("../../../test/fixtures/budget-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = budgetInputs().map((input) => ({ input, output: budgetOutcome(input) }));
  const sourceSha256 = createHash("sha256").update(readFileSync(new URL("../../../src/budget.ts", import.meta.url))).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/budget.ts admission, charge", sourceSha256, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases from src/budget.ts ${sourceSha256.slice(0, 16)}`);
}
