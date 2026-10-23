import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decide, type Finding, type Mode } from "../src/scan.js";
import { decideInputs, type DecideGoldenInput } from "./fixtures/capture-decide-goldens.js";
import { decideReference } from "./decideReference.js";
import { gen } from "./helpers.js";

const goldens: { cases: { input: DecideGoldenInput; output: unknown }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/decide-goldens.json", import.meta.url), "utf8"));

test("decide: every golden captured from the TypeScript decision is reproduced, for each mode and each list of up to three findings (ADR 0009)", () => {
  assert.equal(goldens.cases.length, decideInputs().length);
  for (const c of goldens.cases) assert.equal(JSON.stringify(decide(c.input.mode, c.input.findings)), JSON.stringify(c.output), JSON.stringify(c.input));
});

test("decide: same decision as the TypeScript reference on generated lists of up to 2,000 findings", () => {
  const g = gen(70), kinds: Finding[] = [{ rule: "a", path: "$" }, { rule: "b", path: "$", inKey: true }, { rule: "c", path: "$", unredactable: true }];
  for (let n = 0; n < 2_000; n++) {
    const mode = g.pick<Mode>(["redact", "no-go", "advisory"]), findings = Array.from({ length: g.int(3) === 0 ? g.int(2_000) : g.int(6) }, () => g.int(20) ? kinds[0] : g.pick(kinds));
    assert.equal(JSON.stringify(decide(mode, findings)), JSON.stringify(decideReference(mode, findings)));
  }
});
