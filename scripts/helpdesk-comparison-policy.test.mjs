import { test } from "node:test";
import assert from "node:assert/strict";
import { businessSuite, businessEvaluators } from "./helpdesk-comparison-policy.mjs";

test("business outcomes exclude workflow and audit requirements without changing expected amounts", () => {
  const source = { cases: [{ id: "storm-1002", assertions: [{ id: "tool-calculate_refund" }, { id: "staff-decision" }, { id: "answer-0", value: "staff" }] }, { id: "refund", assertions: [{ id: "refund-amount", value: 340 }, { id: "verified-audit" }] }] };
  const suite = businessSuite(source);
  assert.deepEqual(suite.cases[0].assertions, [{ id: "answer-0", value: "staff" }]);
  assert.deepEqual(suite.cases[1].assertions, [{ id: "refund-amount", value: 340 }]);
  assert.equal(source.cases[0].assertions.length, 3);
});

test("storm outcome accepts either tool workflow and requires staff contact", async () => {
  const check = businessEvaluators.find((e) => e.id === "storm-outcome");
  const answer = "The staff decide each storm case. Contact help@citywheels.example.";
  for (const name of ["search_policies", "calculate_refund"]) assert.equal((await check.evaluate({ id: "storm-1002" }, { answer, toolCalls: [{ name }] })).status, "pass");
  assert.equal((await check.evaluate({ id: "storm-1002" }, { answer: "You automatically get a full refund." })).status, "fail");
});
