import { configureSyntheticMonitoring } from "./casework-test-support.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startWorkbench } from "./helpdesk-workbench.mjs";
import { QualificationStore } from "../../../dist/src/qualification.js";

test("interactive workbench streams actual tools, compiles drafts, retains receipts and catches changed refund rules", { skip: !existsSync(join(process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url)), "dist/src/index.js")) && "Build the separate IntentGauge checkout to run this integration" }, async () => {
  const app = await startWorkbench({ port: 0, home: mkdtempSync(join(tmpdir(), "helpdesk-workbench-")) });
  const base = app.url.split("/#")[0];
  const headers = { "x-workbench-token": app.token, "content-type": "application/json" };
  const post = (path, value) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(value) });
  const run = async (value) => {
    const response = await post("/api/run", { target: "ai-audit", mode: "fake", caseId: "refund-1002", question: "What is my refund if I cancel CW-1002?", ...value });
    assert.equal(response.status, 200);
    return (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  };
  try {
    assert.equal((await fetch(base + "/api/config")).status, 401);
    const config = await (await fetch(base + "/api/config", { headers })).json();
    const baseline = await run({});
    for (const type of ["model-start", "model-result", "tool-start", "tool-result", "answer", "evaluation", "audit", "quineling", "complete"]) assert.ok(baseline.some((e) => e.type === type), type);
    const finished = baseline.find((e) => e.type === "complete").manifest;
    assert.equal(finished.status, "passed");
    assert.equal(finished.receipts, 1);
    const retainedCases = await (await fetch(base + "/api/casework/cases", { headers })).json();
    const retained = retainedCases.find((c) => c.origin.runId === finished.id);
    assert.ok(retained);
    const reviewBody = { rubric: { id: "refund-human", revision: "v1", text: "Check amount against verified booking facts and cancellation policy." }, assigned: ["demo-labeler-a", "demo-labeler-b"], adjudicator: "demo-adjudicator", context: { booking: "CW-1002", businessAt: "2026-06-10T09:00:00+02:00" } };
    assert.equal((await post(`/api/casework/cases/${retained.id}/learning`, { ...reviewBody, source: { split: "holdout" } })).status, 409);
    const assigned = await post(`/api/casework/cases/${retained.id}/learning`, reviewBody);
    assert.equal(assigned.status, 201, await assigned.clone().text());
    const task = await assigned.json();
    const reviewToken = new URLSearchParams(new URL(app.reviewUrls[0].url).hash.slice(1)).get("token");
    const reviewResponse = await fetch(base + "/api/casework/learning/assignments", { headers: { "x-workbench-token": reviewToken } });
    const review = (await reviewResponse.json()).find((t) => t.id === task.id);
    assert.equal(review.question, retained.question);
    assert.equal(review.answer, retained.answer);
    assert.equal(review.source.split, "dev");
    assert.equal(review.source.exposedToDevelopment, true);
    assert.ok(review.context.documents.length > 0);
    assert.equal("origin" in review, false);
    assert.equal("judge" in review, false);
    assert.equal((await fetch(new URL(app.reviewUrls[0].url))).status, 200);

    assert.ok(finished.qualifications.length > 0);
    const qualificationResponse = await fetch(`${base}/api/artifact?id=${finished.id}&file=qualification.json`, { headers });
    assert.equal(qualificationResponse.status, 200);
    const qualification = await qualificationResponse.json();
    assert.equal(qualification.packages[0].assessment.evidencePassed, true);
    assert.equal(qualification.packages[0].assessment.readyForApproval, false);
    assert.equal(qualification.packages[0].assessment.approval, "not-recorded");
    const reopened = new QualificationStore(qualification.store);
    assert.equal(reopened.load(finished.qualifications[0].digest).targetRevision, qualification.packages[0].package.targetRevision);
    const audit = baseline.find((e) => e.type === "audit");
    assert.equal(audit.verification.ok, true);
    assert.ok(existsSync(audit.logPath));
    assert.equal((await fetch(`${base}/api/artifact?id=${finished.id}&file=receipt-0.html`, { headers })).status, 200);
    const changed = structuredClone(config.policy);
    changed.inputs.find((i) => i.id === "shareHalf").value = 0.75;
    const compiledResponse = await post("/api/compile", { policy: changed });
    assert.equal(compiledResponse.status, 200);
    const compiled = await compiledResponse.json();
    assert.ok(compiled.source.length > 0);
    const regression = await run({ policyId: compiled.id });
    assert.equal(regression.find((e) => e.type === "complete").manifest.status, "failed");
    assert.notEqual(regression.find((e) => e.type === "complete").manifest.qualifications[0].digest, finished.qualifications[0].digest);
    assert.equal(regression.find((e) => e.type === "tool-result").result.total_refund_eur, 360);
    const failedManifest = regression.find((e) => e.type === "complete").manifest;
    const failedCase = (await (await fetch(base + "/api/casework/cases", { headers })).json()).find((c) => c.origin.runId === failedManifest.id);
    const failureTaskResponse = await post(`/api/casework/cases/${failedCase.id}/learning`, reviewBody);
    assert.equal(failureTaskResponse.status, 201, await failureTaskResponse.clone().text());
    const failureTask = await failureTaskResponse.json();
    const reviewPost = (index, path, body) => fetch(base + "/api/casework/" + path, { method: "POST", headers: { "content-type": "application/json", "x-workbench-token": new URLSearchParams(new URL(app.reviewUrls[index].url).hash.slice(1)).get("token") }, body: JSON.stringify(body) });
    for (const index of [0, 1]) assert.equal((await reviewPost(index, `learning/${failureTask.id}/label`, { value: false })).status, 200);
    assert.equal((await post(`/api/casework/learning/${failureTask.id}/publish`, {})).status, 200);
    assert.equal((await post(`/api/casework/cases/${failedCase.id}/handoff`, { action: "accept" })).status, 200);
    assert.equal((await post(`/api/casework/cases/${failedCase.id}/handoff`, { action: "resolve" })).status, 200);
    const regressionResponse = await post(`/api/casework/learning/${failureTask.id}/regression`, { reviewer: "demo-labeler-a", assertions: [{ id: "independent-refund-total", type: "equals", path: "/data/refund/total_refund_eur", value: 340, severity: "critical" }] });
    assert.equal(regressionResponse.status, 201, await regressionResponse.clone().text());
    const reviewedRegression = await regressionResponse.json();
    assert.ok(reviewedRegression.evidence.context.documents.length > 0);
    assert.equal((await post("/api/run", { target: "ai-audit", mode: "fake", regressionId: reviewedRegression.id })).status, 400);
    assert.equal((await reviewPost(0, `regressions/${reviewedRegression.id}/review`, { approved: true, rationale: "Independent policy: half rental plus deposit, processing fee excluded" })).status, 200);
    const rerun = async (target, policyId) => {
      const response = await post("/api/run", { target, mode: "fake", regressionId: reviewedRegression.id, ...(policyId ? { policyId } : {}) });
      assert.equal(response.status, 200, await response.clone().text());
      const events = (await response.text()).trim().split("\n").map(JSON.parse);
      const complete = events.find((e) => e.type === "complete");
      assert.ok(complete, JSON.stringify(events.at(-1)));
      return complete.manifest;
    };
    assert.equal((await rerun("ai-audit", compiled.id)).status, "failed");
    const fixed = await rerun("ai-audit");
    assert.equal(fixed.status, "passed");
    assert.equal(fixed.regression.sourceCaseId, failedCase.id);
    assert.equal(fixed.regression.digest, reviewedRegression.digest);
    assert.notEqual(fixed.id, failedManifest.id);
    assert.equal((await rerun("python")).status, "passed");
    const regressionRows = await (await fetch(base + "/api/casework/regressions", { headers })).json();
    assert.deepEqual(regressionRows.find((r) => r.id === reviewedRegression.id).runs.map((r) => r.passed), [false, true, true]);
    const originalCase = await (await fetch(base + `/api/casework/cases/${failedCase.id}`, { headers })).json();
    assert.equal(originalCase.outcome.state, "open");
    assert.equal(originalCase.escalation.owner, "quality-ops");
    assert.equal(originalCase.escalation.status, "open");
    assert.equal(originalCase.escalation.reason, "human_review_failed");

    const invalid = await post("/api/run", { target: "python", mode: "fake", policyId: compiled.id });
    assert.equal(invalid.status, 400);
    const python = await run({ target: "python" });
    assert.equal(python.find((e) => e.type === "complete").manifest.status, "passed");
    assert.ok(python.some((e) => e.type === "tool-result"));
    assert.equal(python.some((e) => e.type === "audit"), false);
    const pythonManifest = python.find((e) => e.type === "complete").manifest;
    const pythonQualification = await (await fetch(`${base}/api/artifact?id=${pythonManifest.id}&file=qualification.json`, { headers })).json();
    assert.ok(pythonQualification.packages[0].assessment.issues.includes("missing-component:gateway"));
    assert.ok(pythonQualification.packages[0].assessment.issues.includes("missing-component:dependencies"));
    const auditedPython = await run({ target: "python-audit" });
    const auditedPythonManifest = auditedPython.find((e) => e.type === "complete")?.manifest;
    assert.ok(auditedPythonManifest, JSON.stringify(auditedPython.at(-1)));
    assert.equal(auditedPythonManifest.status, "passed", JSON.stringify(auditedPython.filter((e) => e.type === "evaluation")));
    assert.ok(auditedPython.some((e) => e.type === "audit" && e.verification.ok));
    assert.ok(auditedPython.some((e) => e.type === "quineling"));
    const auditedCase = (await (await fetch(base + "/api/casework/cases", { headers })).json()).find((c) => c.origin.runId === auditedPythonManifest.id);
    assert.equal(auditedCase.origin.target, "python-audit");
    assert.equal(auditedCase.origin.audit.available, true);
    const auditedQualification = await (await fetch(`${base}/api/artifact?id=${auditedPythonManifest.id}&file=qualification.json`, { headers })).json();
    assert.ok(auditedQualification.packages[0].package.components.gateway);
    assert.ok(auditedQualification.packages[0].assessment.issues.includes("missing-component:dependencies"));
    const saved = await (await fetch(`${base}/api/run?id=${finished.id}`, { headers })).json();
    assert.equal(saved.report.passed, true);
    assert.ok(saved.events.length > 5);
  } finally { app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); }
});

test("a changed evaluator artifact stops new experiments until the server is restarted", { skip: !existsSync(join(process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url)), "dist/src/index.js")) }, async () => {
  const source = process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "casework-host-")), evaluator = join(root, "evaluator");
  mkdirSync(evaluator);
  cpSync(join(source, "dist"), join(evaluator, "dist"), { recursive: true });
  cpSync(join(source, "integrations"), join(evaluator, "integrations"), { recursive: true });
  const previous = process.env.INTENTGAUGE_ROOT;
  const previousCitywheels = process.env.CITYWHEELS_ROOT;
  process.env.INTENTGAUGE_ROOT = evaluator;
  process.env.CITYWHEELS_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
  let app;
  try {
    app = await startWorkbench({ port: 0, home: join(root, "workspace") });
    writeFileSync(join(evaluator, "dist/src/changed-after-start.js"), "export const changed = true;\n");
    const response = await fetch(app.url.split("/#")[0] + "/api/run", { method: "POST", headers: { "x-workbench-token": app.token, "content-type": "application/json" }, body: JSON.stringify({ target: "ai-audit", mode: "fake", caseId: "refund-1002", question: "Refund?" }) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "audit_casework_host_changed_restart_required");
  } finally {
    if (previous === undefined) delete process.env.INTENTGAUGE_ROOT; else process.env.INTENTGAUGE_ROOT = previous;
    if (previousCitywheels === undefined) delete process.env.CITYWHEELS_ROOT; else process.env.CITYWHEELS_ROOT = previousCitywheels;
    if (app) { app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); }
  }
});

test("casework HTTP enforces separate customer/operator sessions, exact-answer review, delivery limits and restart persistence", { skip: !existsSync(join(process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url)), "dist/src/index.js")) }, async () => {
  const home = mkdtempSync(join(tmpdir(), "casework-http-"));
  const outsiderToken = "outside-operator-credential-000000", otherCustomerToken = "other-customer-credential-00000000";
  const caseworkIdentities = [{ token: outsiderToken, operator: { tenant: "another-shop", id: "operator-b", roles: ["operator", "reviewer", "deployer"] } }, { token: otherCustomerToken, customer: { tenant: "citywheels", customer: "another-customer" } }];
  let app = await startWorkbench({ port: 0, home, caseworkIdentities });
  await configureSyntheticMonitoring(app);
  const request = (path, body, token = app.token, extra = {}) => fetch(app.url.split("/#")[0] + path, { method: body === undefined ? "GET" : "POST", headers: { "x-workbench-token": token, ...(body === undefined ? {} : { "content-type": "application/json" }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const call = async (path, body, token = app.token) => {
    const response = await request("/api/casework/" + path, body, token);
    const value = await response.json(); assert.ok(response.ok, `${response.status}: ${JSON.stringify(value)}`); return value;
  };
  const close = async () => { app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); };
  try {
    assert.equal((await request("/casework")).status, 200);
    assert.equal((await request("/api/casework/cases", undefined, "invalid")).status, 401);
    assert.equal((await request("/api/casework/cases", undefined, app.customerToken)).status, 403);
    assert.equal((await request("/api/config", undefined, app.customerToken)).status, 401);
    assert.equal((await request("/api/casework/session", undefined, app.token, { origin: "https://untrusted.example" })).status, 403);
    const response = await request("/api/run", { target: "ai-audit", mode: "fake", caseId: "refund-1002", question: "What is my refund if I cancel CW-1002?" });
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    const finished = events.find((e) => e.type === "complete")?.manifest;
    assert.equal(finished?.status, "passed", JSON.stringify(events.at(-1)));
    const [c] = await call("cases");
    assert.equal(c.id, finished.caseIds[0]);
    assert.equal(c.delivery.state, "not-sent");
    assert.equal(c.origin.audit.chainVerified, true);
    assert.equal((await call("inbox", undefined, app.customerToken)).length, 0);
    assert.deepEqual(await call("cases", undefined, outsiderToken), []);
    assert.equal((await request(`/api/casework/cases/${c.id}`, undefined, outsiderToken)).status, 404);
    const approve = async (tier) => call("grants/approve", { packageDigest: c.qualificationDigest, tier, limits: { actions: ["deliver-answer"], maxAmountMinor: 0, currency: "EUR" }, expiresAt: new Date(Date.now() + 3600000).toISOString(), acceptsMutableModel: true });
    const shadow = await approve("shadow");
    assert.equal((await call("authority")).events.at(-1).kind, "approved");
    await call("grants/activate", { grantId: shadow.id });
    assert.equal((await call(`cases/${c.id}/deliver`, {})).delivery.reason, "shadow_observation_only");
    const assist = await approve("assist");
    await call("grants/activate", { grantId: assist.id });
    assert.equal((await call(`cases/${c.id}/deliver`, {})).delivery.reason, "answer_review_required");
    assert.equal((await request(`/api/casework/cases/${c.id}/review`, { verdict: "approved" }, app.customerToken)).status, 403);
    await call(`cases/${c.id}/review`, { verdict: "approved" });
    assert.equal((await call(`cases/${c.id}/deliver`, {})).delivery.state, "delivered");
    await call(`cases/${c.id}/deliver`, {});
    assert.equal((await call("inbox", undefined, app.customerToken)).length, 1);
    assert.equal((await call("inbox", undefined, otherCustomerToken)).length, 0);
    const spoofed = await request("/api/casework/grants/approve", { packageDigest: c.qualificationDigest, tenant: "another-shop", roles: ["deployer"] });
    assert.equal(spoofed.status, 409);
    const foreignGrant = await request("/api/casework/grants/approve", { packageDigest: c.qualificationDigest, tier: "contain", limits: { actions: ["deliver-answer"], maxAmountMinor: 0, currency: "EUR" }, expiresAt: new Date(Date.now() + 3600000).toISOString(), acceptsMutableModel: true }, outsiderToken);
    assert.equal(foreignGrant.status, 403);
    await call(`cases/${c.id}/outcome`, { state: "resolved", code: "customer_confirmed" });
    await call(`cases/${c.id}/outcome`, { state: "reopened", code: "repeat_contact" });
    const metrics = await call("insights");
    assert.equal(metrics.overall.reopened, 1);
    assert.equal(metrics.overall.meanMeasuredCostMinor, null);
    await close();
    app = await startWorkbench({ port: 0, home, caseworkIdentities });
    assert.equal((await call(`cases/${c.id}`)).review.verdict, "approved");
    assert.equal((await call("inbox", undefined, app.customerToken)).length, 1);
    assert.equal((await call("authority")).grants.length, 2);
  } finally { await close(); }
});

test("executor HTTP requires the owning customer's consent and recovers card/voucher settlement across restart", { skip: !existsSync(join(process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url)), "dist/src/index.js")) }, async () => {
  const home = mkdtempSync(join(tmpdir(), "executor-http-"));
  const otherCustomer = "executor-other-customer-credential", operatorOnly = "executor-operator-only-credential";
  const caseworkIdentities = [{ token: otherCustomer, customer: { tenant: "citywheels", customer: "another-customer" } }, { token: operatorOnly, operator: { tenant: "citywheels", id: "operator-only", roles: ["operator"] } }];
  let app = await startWorkbench({ port: 0, home, caseworkIdentities });
  await configureSyntheticMonitoring(app);
  const request = (path, body, token = app.token) => fetch(app.url.split("/#")[0] + path, { method: body === undefined ? "GET" : "POST", headers: { "x-workbench-token": token, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const call = async (path, body, token = app.token) => { const response = await request("/api/casework/" + path, body, token); const value = await response.json(); assert.ok(response.ok, `${response.status}: ${JSON.stringify(value)}`); return value; };
  const close = async () => { app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve)); };
  try {
    const response = await request("/api/run", { target: "ai-audit", mode: "fake", caseId: "refund-1002", question: "What is my refund if I cancel CW-1002?" });
    const events = (await response.text()).trim().split("\n").map(JSON.parse);
    assert.equal(events.at(-1).type, "complete", JSON.stringify(events.at(-1)));
    const [c] = await call("cases");
    const grant = await call("grants/approve", { packageDigest: c.qualificationDigest, tier: "transact", limits: { actions: ["deliver-answer", "cancel-refund"], maxAmountMinor: 50000, currency: "EUR" }, expiresAt: new Date(Date.now() + 3600000).toISOString(), acceptsMutableModel: true });
    await call("grants/activate", { grantId: grant.id });
    const path = `cases/${c.id}/operations`;
    assert.equal((await request("/api/casework/" + path, { bookingId: "CW-1002", businessAt: "2026-06-01T00:00:00Z" })).status, 409);
    const op = await call(path, { bookingId: "CW-1002" });
    assert.equal(op.proposal.amountMinor, 34000);
    assert.equal(op.proposal.businessAt, "2026-06-10T07:00:00.000Z");
    assert.equal(op.events[0].actor, "local-operator");
    const action = `${path}/${op.proposal.id}/`;
    assert.equal((await request("/api/casework/" + action + "execute", {})).status, 409);
    assert.equal((await request("/api/casework/" + action + "consent", {})).status, 403);
    assert.equal((await request("/api/casework/" + action + "consent", {}, otherCustomer)).status, 404);
    assert.equal((await request("/api/casework/" + action + "consent", { amountMinor: 1 }, app.customerToken)).status, 409);
    await call(action + "consent", {}, app.customerToken);
    assert.equal((await request("/api/casework/" + action + "execute", {})).status, 409);
    assert.equal((await request("/api/casework/" + action + "review", { verdict: "approved" }, operatorOnly)).status, 403);
    await call(action + "review", { verdict: "approved" });
    const [publicOp] = await call("operations", undefined, app.customerToken);
    assert.equal("grantId" in publicOp, false);
    assert.equal("events" in publicOp, false);
    assert.equal("reviewer" in publicOp.review, false);
    assert.ok((await call("bookings", undefined, app.customerToken)).every((b) => !("paymentRef" in b)));
    const interrupted = await request("/api/casework/" + action + "execute", { fault: "after-refund" });
    assert.equal(interrupted.status, 409);
    assert.equal((await interrupted.json()).error, "synthetic_crash_after_refund");
    assert.equal((await call("operations"))[0].status, "dispatching");
    assert.equal(app.casework.backend.storage.read().refunds.length, 1);
    await close(); app = await startWorkbench({ port: 0, home, caseworkIdentities });
    assert.equal((await call(action + "reconcile", {})).status, "done");
    assert.equal((await call(action + "execute", {})).status, "done");
    assert.equal((await call(path, { bookingId: "CW-1002" })).proposal.id, op.proposal.id);
    assert.equal(app.casework.backend.storage.read().refunds.length, 1);
    assert.equal((await call(`cases/${c.id}`)).outcome.state, "open");
    const voucher = await call(path, { bookingId: "CW-1004" });
    assert.equal(voucher.proposal.paymentKind, "voucher");
    const voucherAction = `${path}/${voucher.proposal.id}/`;
    await call(voucherAction + "consent", {}, app.customerToken);
    assert.equal((await call(voucherAction + "execute", { fault: "refund-failure" })).status, "unknown");
    assert.equal((await call(voucherAction + "reconcile", {})).status, "unknown");
    assert.equal((await request("/api/casework/" + voucherAction + "resolve", {}, operatorOnly)).status, 403);
    assert.equal((await request("/api/casework/" + voucherAction + "resolve", { amountMinor: 1 })).status, 409);
    assert.equal((await call(voucherAction + "resolve", {})).status, "done");
    assert.equal((await call(voucherAction + "resolve", {})).status, "done");
    const ledger = app.casework.backend.storage.read().refunds;
    assert.equal(ledger.length, 2);
    assert.equal(ledger.find((r) => r.operationId === voucher.proposal.id).paymentKind, "voucher");
    const pythonResponse = await request("/api/run", { target: "python", mode: "fake", caseId: "refund-1003-late", question: "What is my refund if I cancel CW-1003?" });
    const pythonEvents = (await pythonResponse.text()).trim().split("\n").map(JSON.parse);
    assert.equal(pythonEvents.at(-1).manifest?.status, "passed", JSON.stringify(pythonEvents.at(-1)));
    const pythonCase = (await call("cases")).find((row) => row.origin.target === "python");
    assert.equal(pythonCase.origin.audit.available, false);
    const pythonPath = `cases/${pythonCase.id}/operations`;
    const pythonOp = await call(pythonPath, { bookingId: "CW-1003" });
    assert.equal(pythonOp.proposal.amountMinor, 5000);
    await call(`${pythonPath}/${pythonOp.proposal.id}/consent`, {}, app.customerToken);
    assert.equal((await request(`/api/casework/${pythonPath}/${pythonOp.proposal.id}/execute`, {})).status, 409);
    const pythonGrant = await call("grants/approve", { packageDigest: pythonCase.qualificationDigest, tier: "transact", limits: { actions: ["cancel-refund"], maxAmountMinor: 50000, currency: "EUR" }, expiresAt: new Date(Date.now() + 3600000).toISOString(), acceptsMutableModel: true });
    await call("grants/activate", { grantId: pythonGrant.id });
    assert.equal((await call(`${pythonPath}/${pythonOp.proposal.id}/execute`, {})).status, "done");
    assert.equal(app.casework.backend.storage.read().refunds.length, 3);
    assert.deepEqual(await call("operations", undefined, otherCustomer), []);
  } finally { await close(); }
});

test("learning API keeps assigned labels blind and isolates review-only sessions", { skip: !existsSync(join(process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url)), "dist/src/index.js")) && "Build IntentGauge first" }, async () => {
  const tokenA = "a".repeat(32), tokenB = "b".repeat(32), tokenC = "c".repeat(32);
  const caseworkIdentities = [
    { token: tokenA, operator: { tenant: "citywheels", id: "first", roles: ["labeler"] } },
    { token: tokenB, operator: { tenant: "citywheels", id: "second", roles: ["labeler"] } },
    { token: tokenC, operator: { tenant: "citywheels", id: "third", roles: ["adjudicator"] } }
  ];
  const app = await startWorkbench({ port: 0, home: mkdtempSync(join(tmpdir(), "learning-api-")), caseworkIdentities });
  const base = app.url.split("/#")[0];
  const request = (path, token, body) => fetch(base + "/api/casework/" + path, { headers: { "x-workbench-token": token, "content-type": "application/json" }, ...(body === undefined ? {} : { method: "POST", body: JSON.stringify(body) }) });
  try {
    const input = { caseId: null, intent: "refund", question: "Refund?", answer: "340 EUR", context: { policy: "Full rental and deposit" },
      source: { family: "demo", kind: "synthetic", sampling: "development", split: "dev", owner: "qa", reference: "demo", sanitized: true, exposedToDevelopment: true },
      rubric: { id: "amount", text: "Amount matches policy", revision: "v1" }, assigned: ["first", "second"], adjudicator: "third" };
    assert.equal((await request("learning", tokenA, input)).status, 403);
    assert.equal((await request("learning", app.token, { ...input, assigned: ["unknown", "second"] })).status, 409);
    const created = await request("learning", app.token, input);
    assert.equal(created.status, 201);
    const { id } = await created.json();
    assert.equal((await request("cases", tokenA)).status, 403);
    assert.equal((await request("operations", tokenA)).status, 403);
    const economicsDataset = JSON.parse(readFileSync(new URL("../workbench/economics.sample.json", import.meta.url), "utf8"));
    assert.equal((await request("economics/analyze", tokenA, { dataset: economicsDataset })).status, 403);
    const economicResponse = await request("economics/analyze", app.token, { dataset: economicsDataset });
    assert.equal(economicResponse.status, 200);
    const economics = await economicResponse.json();
    assert.equal(economics.comparisonSupported, false);
    assert.equal(economics.provenance.diagnosticPairs, 2);
    assert.equal(economics.weighted.candidateMeanMinor, null);
    assert.equal(economics.diagnostics[0].candidate.total, 401);

    assert.equal((await request(`learning/${id}/label`, tokenA, { value: true, roles: ["operator"] })).status, 409);
    assert.equal((await request(`learning/${id}/label`, tokenA, { value: true })).status, 200);
    const assignments = await (await request("learning/assignments", tokenB)).json();
    assert.equal(assignments[0].peerLabels, null);
    assert.equal(assignments[0].ownLabel, null);
    assert.equal((await request(`learning/${id}/label`, tokenB, { value: false })).status, 200);
    assert.equal((await request(`learning/${id}/publish`, app.token, {})).status, 409);
    assert.equal((await request(`learning/${id}/adjudicate`, tokenC, { value: false })).status, 200);
    const published = await (await request(`learning/${id}/publish`, app.token, {})).json();
    assert.equal(published.gold, false);
    assert.equal(published.representative, false);
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});

test("learning export is consumed by the separate IntentGauge calibration engine", { skip: !existsSync(join(process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url)), "dist/src/index.js")) && "Build IntentGauge first" }, async () => {
  const { CaseworkLearning } = await import("../../../dist/src/caseworkLearning.js");
  const { evidenceDigest } = await import("../../../dist/src/qualification.js");
  const { pathToFileURL } = await import("node:url");
  const { calibrate } = await import(pathToFileURL(join(process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url)), "dist/src/index.js")).href);
  const store = new CaseworkLearning(mkdtempSync(join(tmpdir(), "learning-calibration-")));
  const principal = (id, role) => ({ tenant: "shop", id, roles: [role] });
  const operator = principal("operator", "operator"), rubric = { id: "correct", revision: "v1", text: "Matches verified policy" }, ids = [];
  for (let n = 0; n < 30; n++) {
    const task = store.create(operator, { caseId: null, intent: "refund", question: `Synthetic validation sample ${n}`, answer: "Candidate", context: {},
      rubric, source: { family: `sample-${n}`, kind: "synthetic", sampling: "random", split: "holdout", owner: "qa", reference: "test-only", sanitized: true, exposedToDevelopment: false }, assigned: ["a", "b"], adjudicator: "c" });
    ids.push(task.id);
    store.recordJudge(operator, task.id, { name: "frozen", revision: "r1", value: n % 2 === 0, source: "test-only" });
    store.label(principal("a", "labeler"), task.id, n % 2 === 0);
    store.label(principal("b", "labeler"), task.id, n === 29 ? true : n % 2 === 0);
  }
  const exportInput = () => store.calibrationInput(operator, ids, evidenceDigest(rubric), { name: "frozen", revision: "r1" });
  const unresolved = calibrate(exportInput().dataset);
  assert.equal(unresolved.eligible, false);
  assert.equal(unresolved.slices[0].unresolved, 1);
  store.adjudicate(principal("c", "adjudicator"), ids[29], false);
  const exported = exportInput(), resolved = calibrate(exported.dataset);
  assert.equal(resolved.eligible, true);
  assert.equal(resolved.slices[0].classSupport.positive, 15);
  assert.equal(resolved.slices[0].classSupport.negative, 15);
  assert.equal(exported.provenance.representative, false);
  assert.equal(calibrate({ ...exported.dataset, rows: exported.dataset.rows.slice(0, 29) }).eligible, false);
});
