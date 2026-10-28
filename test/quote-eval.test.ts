import { test } from "node:test";
import assert from "node:assert/strict";
import { readQuoteDataset, evaluateQuotes, scoreRows } from "../src/quoteEval.js";

const datasetPath = new URL("../../examples/evaluation/quotes.json", import.meta.url).pathname;

test("labeled quote evaluation reproduces QDL and keeps unused API usage unknown", async () => {
  const dataset = readQuoteDataset(datasetPath);
  const report = await evaluateQuotes(dataset, { repeats: 0 });
  assert.equal(report.summary.development.qdlMisses, 0);
  assert.equal(report.summary.development.qdlFalseAlerts, 0);
  assert.equal(report.summary.holdout.qdlMisses, 0);
  assert.equal(report.summary.holdout.qdlFalseAlerts, 0);
  assert.equal(report.summary.holdout.qdlReplayFailures, 0);
  assert.equal(report.summary.holdout.inputTokens, undefined);
  assert.ok(report.rows.every((row) => row.samples.length === 0));
});

test("Decisions evaluator counts false alerts, refusals and flips without treating unknown as false", async () => {
  const dataset = readQuoteDataset(datasetPath);
  const cases = [dataset.cases[0], dataset.cases[1]].map((item) => ({ ...item, split: "holdout" as const }));
  let request = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.input[0].content[0].type, "input_json");
    assert.equal(body.questions[0].type, "predicate");
    request++;
    const answer = request === 4 ? { type: "refusal", name: "needs_review" }
      : { type: "predicate", name: "needs_review", probability: request === 2 ? 0.8 : 0.1 };
    return new Response(JSON.stringify({ answers: [answer], usage: { input_tokens: 100 } }), { status: 200 });
  };
  const report = await evaluateQuotes({ version: 1, cases }, { repeats: 2, apiKey: "sk-fake-test", fetcher });
  const summary = scoreRows(report.rows, "holdout");
  assert.equal(summary.apiSamples, 4);
  assert.equal(summary.apiFalseAlerts, 1);
  assert.equal(summary.apiMisses, 1);
  assert.equal(summary.apiRefusals, 1);
  assert.equal(summary.apiFlips, 1);
  assert.equal(summary.apiProbabilityChanges, 1);
  assert.equal(summary.inputTokens, 400);
  assert.equal(summary.cachedTokens, undefined);
});
