import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Rec } from "../src/audit.js";
import { effectAuthorized } from "../src/verdict.js";
import { effectIds, verdictInputs, verdictLog, type VerdictGoldenInput } from "./fixtures/capture-verdict-goldens.js";
import { effectAuthorizedReference } from "./verdictReference.js";
import { gen } from "./helpers.js";

const goldens: { cases: { input: VerdictGoldenInput; output: [string, boolean][] }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/verdict-goldens.json", import.meta.url), "utf8"));

test("verdict: every golden captured from the TypeScript effect check is reproduced (ADR 0055, ADR 0057)", () => {
  assert.equal(goldens.cases.length, verdictInputs().length);
  for (const c of goldens.cases) assert.deepEqual(effectIds(c.input.records).map((id) => [id, effectAuthorized(c.input.records, id)]), c.output, JSON.stringify(c.input));
});

test("verdict: same effect check as the TypeScript reference on 2,000 generated logs (ADR 0055, ADR 0057)", () => {
  const g = gen(101);
  for (let n = 0; n < 2_000; n++) {
    const records = verdictLog(g, g.int(5) === 0 ? g.int(400) : g.int(40));
    for (const id of effectIds(records)) assert.equal(effectAuthorized(records, id), effectAuthorizedReference(records, id), JSON.stringify({ id, records }));
  }
});

test("verdict: an effect after 100,000 reviews of its decision follows the last one", () => {
  const reviews = Array.from({ length: 100_000 }, (_, n) => ({ kind: "review", id: `r${n}`, ts: "t", refId: "d", review: { reviewer: "ada", decision: n % 2 ? "rejected" : "approved", at: "t" } }));
  for (const last of ["approved", "rejected"]) {
    const records = [{ kind: "decision", id: "d", ts: "t", output: [{ action: "send", status: "simulated" }] }, ...reviews, { ...reviews[0], id: "last", review: { ...reviews[0].review, decision: last } },
      { kind: "effect", id: "e", ts: "t", refId: "d", effect: { action: "send", status: "done" } }] as Rec[];
    assert.equal(effectAuthorized(records, "e"), last === "approved");
    assert.equal(effectAuthorizedReference(records, "e"), last === "approved");
  }
});
