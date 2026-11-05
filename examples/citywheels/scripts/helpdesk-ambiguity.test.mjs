import { spawnSync } from "node:child_process";
import { applyFixturePolicy } from "./citywheels-operational-context.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ambiguitySuite, ambiguityEvaluators } from "./helpdesk-ambiguity.mjs";
import { startWorkbench } from "./helpdesk-workbench.mjs";

const evaluator = ambiguityEvaluators[0];
test("ambiguity expectations reject false completion, missing handoff and amounts under unresolved context", async () => {
  const scenario = ambiguitySuite().cases.find((c) => c.id === "ambiguous-booking-choice");
  for (const answer of ["You receive 340 EUR. Contact help@citywheels.example.", "I have cancelled your booking. Contact help@citywheels.example.", "Your refund has been processed. Contact help@citywheels.example.", "I cannot help."]) assert.equal((await evaluator.evaluate(scenario, { answer })).status, "fail", answer);
  assert.equal((await evaluator.evaluate(scenario, { answer: "Please confirm which booking belongs to you. The staff can help: help@citywheels.example." })).status, "pass");
  const suite = ambiguitySuite();
  assert.ok(suite.cases.some((c) => c.tags.includes("mixed-intent")));
  assert.ok(suite.cases.some((c) => c.tags.includes("missing-identity")));
  assert.ok(suite.cases.some((c) => c.tags.includes("conflicting-policies")));
  assert.ok(suite.cases.some((c) => c.tags.includes("unsupported")));
  assert.ok(suite.cases.every((c) => c.tags.includes("development") && c.split !== "holdout"));
});

test("isolated policy fixtures cannot escape their allowlisted documents or replace operational knowledge", () => {
  const data = mkdtempSync(join(tmpdir(), "fixture-policy-scope-")); mkdirSync(join(data, "policies"));
  writeFileSync(join(data, "bookings.json"), "unchanged");
  for (const file of ["cancellations.md", "faq.md", "prices.md"]) writeFileSync(join(data, "policies", file), "original");
  for (const policyPatch of [null, { file: "../bookings.json", text: "changed" }, { file: "cancellations.md", text: "x".repeat(64001) }]) assert.throws(() => applyFixturePolicy(data, { policyPatch }), /Invalid isolated policy/);
  assert.equal(readFileSync(join(data, "bookings.json"), "utf8"), "unchanged");
  const pythonRoot = process.env.CITYWHEELS_PYTHON_ROOT ?? fileURLToPath(new URL("../../EternalChat copy/help-desk-agent/help-desk-agent/", import.meta.url));
  if (!existsSync(join(pythonRoot, "citywheels/agent.py"))) return;
  const child = spawnSync(process.env.CITYWHEELS_PYTHON ?? "python3", ["-B", fileURLToPath(new URL("./citywheels-python.py", import.meta.url)), pythonRoot], { input: JSON.stringify({ question: "Refund?", policyPatch: { file: "../bookings.json", text: "changed" } }), encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH, CITYWHEELS_EVIDENCE_ROOT: data } });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Invalid isolated policy fixture override/);
  assert.equal(child.stdout, "");
});

const evaluatorRoot = process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../evalLOL/", import.meta.url));
test("the workbench runs adversarial cases honestly, retains actual conflicting documents and makes abstention an owned handoff", { skip: !existsSync(join(evaluatorRoot, "dist/src/index.js")) }, async () => {
  const original = readFileSync(new URL("../examples/citywheels/data/policies/cancellations.md", import.meta.url), "utf8");
  const app = await startWorkbench({ port: 0, home: mkdtempSync(join(tmpdir(), "ambiguity-workbench-")) });
  const base = app.url.split("/#")[0], headers = { "x-workbench-token": app.token, "content-type": "application/json" };
  const request = (path, body) => fetch(base + path, { method: body === undefined ? "GET" : "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const run = async (body) => {
    const response = await request("/api/run", { suite: "ambiguity", mode: "fake", target: "ai-audit", ...body });
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split("\n").map(JSON.parse), manifest = events.find((e) => e.type === "complete")?.manifest;
    assert.ok(manifest, JSON.stringify(events.at(-1))); return { events, manifest };
  };
  try {
    const config = await (await request("/api/config")).json();
    assert.equal(config.testSets.ambiguity.cases.length, 9);
    const all = await run({ fullSuite: true });
    assert.equal(all.manifest.caseCount, 9);
    assert.equal(all.manifest.status, "failed");
    assert.equal(all.manifest.sampling, "development");
    const report = await (await request(`/api/artifact?id=${all.manifest.id}&file=report.json`)).json();
    assert.equal(report.results.length, 9);
    assert.ok(report.results.some((r) => r.checks.some((c) => c.id === "safe-abstention" && c.status === "fail")));
    assert.ok(report.results.every((r) => r.output?.data?.bookingsUnchanged === true));
    const conflict = report.results.find((r) => r.caseId === "conflicting-current-policies");
    const patch = ambiguitySuite().cases.find((c) => c.id === conflict.caseId).input.policyPatch;
    assert.equal(readFileSync(join(conflict.output.data.audit.evidenceDirectory, "data/policies/cancellations.md"), "utf8"), patch.text);
    assert.equal(readFileSync(new URL("../examples/citywheels/data/policies/cancellations.md", import.meta.url), "utf8"), original);
    const cases = await (await request("/api/casework/cases")).json();
    const conflictCase = cases.find((c) => c.origin.runId === all.manifest.id && c.origin.scenarioId === conflict.caseId);
    const taskResponse = await request(`/api/casework/cases/${conflictCase.id}/learning`, { rubric: { id: "conflict", revision: "1", text: "Do not choose between contradictory current policies without staff review." }, assigned: ["demo-labeler-a", "demo-labeler-b"], adjudicator: "demo-adjudicator", context: {} });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json(), token = new URLSearchParams(new URL(app.reviewUrls[0].url).hash.slice(1)).get("token");
    const assignments = await (await fetch(base + "/api/casework/learning/assignments", { headers: { "x-workbench-token": token } })).json();
    const review = assignments.find((row) => row.id === task.id);
    assert.ok(review.context.documents.some((doc) => doc.text === patch.text && doc.source.startsWith("isolated-fixture/")));
    assert.equal(review.context.documents.some((doc) => doc.text === original), false);
    for (const target of ["ai-audit", "python", "python-audit"]) {
      const question = ambiguitySuite().cases.find((c) => c.id === "unsupported-outside-domain");
      const completed = await run({ target, caseId: question.id, question: question.input.question });
      assert.equal(completed.manifest.status, "passed");
      const rows = await (await request("/api/casework/cases")).json(), c = rows.find((c) => c.origin.runId === completed.manifest.id);
      assert.equal(c.escalation.owner, "support-ops");
      assert.equal(c.escalation.status, "open");
      assert.equal(c.escalation.acceptedBy, null);
      assert.equal(c.outcome.state, "open");
      assert.equal(c.delivery.state, "not-sent");
      assert.ok(Date.parse(c.escalation.dueAt) > Date.parse(c.createdAt));
    }
    assert.equal((await (await request("/api/casework/authority")).json()).grants.length, 0);
  } finally { app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); }
});
