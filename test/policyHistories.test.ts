import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { policyHistories } from "../src/policies.js";
import { policiesInputs, policyRecords, type PoliciesGoldenInput } from "./fixtures/capture-policies-goldens.js";
import { policyHistoriesReference } from "./policiesReference.js";
import { gen } from "./helpers.js";

const goldens: { cases: { input: PoliciesGoldenInput; output: unknown }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/policies-goldens.json", import.meta.url), "utf8"));

test("policyHistories: every golden captured from the TypeScript is reproduced, byte for byte as the CLI prints it (ADR 0027)", () => {
  assert.equal(goldens.cases.length, policiesInputs().length);
  for (const c of goldens.cases) assert.equal(JSON.stringify(policyHistories(c.input.records, c.input.filter)), JSON.stringify(c.output), JSON.stringify(c.input));
});

test("policyHistories: same histories as the TypeScript reference on generated logs of up to 2,000 decisions", () => {
  const g = gen(81);
  for (let n = 0; n < 1_000; n++) {
    const records = policyRecords(g, g.int(5) === 0 ? g.int(2_000) : g.int(40)), filter = g.int(3) ? {} : { systemId: g.pick(["s1", "s2", ""]) };
    assert.equal(JSON.stringify(policyHistories(records, filter)), JSON.stringify(policyHistoriesReference(records, filter)));
  }
});

test("policyHistories: a log of 100,000 decisions gives the same histories as the reference without overflowing the stack", () => {
  const records = policyRecords(gen(82), 100_000);
  assert.equal(JSON.stringify(policyHistories(records)), JSON.stringify(policyHistoriesReference(records)));
});

test("policyHistories: 50,000 use cases of one decision each, and one use case with 50,000 versions, match the reference", () => {
  const decision = (n: number, useCase: string, sourceHash: string) => [
    { kind: "decision", id: `d${n}`, ts: `t${n}`, systemId: "s", useCase },
    { kind: "decision", id: `d${n}:qdl`, ts: `t${n}`, refId: `d${n}`, qdl: { sourceHash } },
  ];
  const manyUseCases = Array.from({ length: 50_000 }, (_, n) => decision(n, `u${n}`, "h")).flat();
  const manyVersions = Array.from({ length: 50_000 }, (_, n) => decision(n, "u", `h${n}`)).flat();
  for (const records of [manyUseCases, manyVersions]) assert.equal(JSON.stringify(policyHistories(records)), JSON.stringify(policyHistoriesReference(records)));
});
