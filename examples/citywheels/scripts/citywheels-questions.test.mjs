import { configureSyntheticMonitoring } from "./casework-test-support.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startWorkbench } from "./helpdesk-workbench.mjs";

const evaluator = process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url));
const pythonRoot = process.env.CITYWHEELS_PYTHON_ROOT ?? fileURLToPath(new URL("../../../../EternalChat copy/help-desk-agent/help-desk-agent/", import.meta.url));
const available = existsSync(join(evaluator, "dist/src/index.js")) && existsSync(join(pythonRoot, "citywheels/agent.py"));

test("authenticated customer questions run both applications against owned live facts, preserve unevaluated evidence and block stale delivery", { skip: !available && "Build the separate IntentGauge and Python application checkouts" }, async () => {
  const other = "other-customer-session-token-for-questions";
  const home = mkdtempSync(join(tmpdir(), "citywheels-questions-"));
  let app = await startWorkbench({ port: 0, home, caseworkIdentities: [{ token: other, customer: { tenant: "citywheels", customer: "someone-else" } }] });
  await configureSyntheticMonitoring(app);
  const request = async (path, body, token = app.token) => {
    const base = app.url.split("/#")[0];
    const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "x-workbench-token": token, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text();
    return { status: response.status, value: response.headers.get("content-type")?.includes("ndjson") ? text.trim().split("\n").map(JSON.parse) : JSON.parse(text) };
  };
  const close = () => new Promise((resolve) => { app.server.closeAllConnections(); app.server.close(resolve); });
  const question = { requestId: "a".repeat(36), bookingId: "CW-1002", question: "What is my refund if I cancel CW-1002?" };
  try {
    assert.equal((await request("/api/casework/questions", question, app.customerToken)).status, 409);
    for (const target of ["ai-audit", "python", "python-audit"]) {
      const experiment = await request("/api/run", { target, mode: "fake", caseId: "refund-1002", question: question.question });
      assert.equal(experiment.status, 200);
      const finished = experiment.value.find((event) => event.type === "complete")?.manifest;
      assert.equal(finished?.status, "passed", JSON.stringify(experiment.value.find((event) => event.type === "error")));
      const p = finished.qualifications.find((p) => p.intent === "refund");
      const approved = await request("/api/casework/grants/approve", { packageDigest: p.digest, tier: "assist", limits: { actions: ["deliver-answer"], maxAmountMinor: 0, currency: "EUR" }, expiresAt: new Date(Date.now() + 3600000).toISOString(), acceptsMutableModel: true });
      assert.equal(approved.status, 201, JSON.stringify(approved.value));
      assert.equal((await request("/api/casework/grants/activate", { grantId: approved.value.id })).status, 200);
      assert.equal((await request("/api/casework/questions", question, other)).value.error, "audit_executor_booking_not_accessible");
      const input = { ...question, requestId: (target === "ai-audit" ? "a" : target === "python" ? "b" : "c").repeat(36) };
      assert.equal((await request("/api/casework/questions", { ...input, tenant: "other" }, app.customerToken)).status, 409);
      const answer = await request("/api/casework/questions", input, app.customerToken);
      assert.equal(answer.status, 201, JSON.stringify(answer.value));
      assert.equal(answer.value.delivered, false);
      const id = answer.value.caseId;
      const c = (await request(`/api/casework/cases/${id}`)).value;
      const originalEvidence = await request(`/api/casework/cases/${id}/evidence`);
      assert.equal(originalEvidence.status, 200);
      assert.equal(originalEvidence.value.answer, c.answer);
      assert.equal(originalEvidence.value.context.bookingId, "CW-1002");
      assert.equal((await request(`/api/casework/cases/${id}/evidence`, undefined, other)).status, 403);
      assert.equal(c.origin.target, target);
      assert.equal(c.origin.evaluation, "not-evaluated");
      assert.equal(c.context.booking.status, "confirmed");
      assert.equal(c.context.bookingVersion, 1);
      assert.equal(c.origin.audit.available, target !== "python");
      assert.ok(c.answer.includes("340"), c.answer);
      assert.equal(JSON.stringify(c.context).includes("synthetic-original-"), false);
      assert.equal((await request("/api/casework/questions", input, app.customerToken)).value.caseId, id);
      assert.equal((await request("/api/casework/questions", { ...input, question: "different" }, app.customerToken)).value.error, "audit_casework_request_conflict");
      assert.equal((await request("/api/casework/inbox", undefined, app.customerToken)).value.length, target === "ai-audit" ? 0 : 1);
      if (target === "ai-audit") {
        assert.equal((await request(`/api/casework/cases/${id}/deliver`, {})).value.delivery.reason, "answer_review_required");
        await request(`/api/casework/cases/${id}/review`, { verdict: "approved" });
        assert.equal((await request(`/api/casework/cases/${id}/deliver`, {})).value.delivery.state, "delivered");
      } else {
        app.casework.backend.storage.transact((state) => { const b = state.bookings.find((b) => b.id === "CW-1002"); b.status = "cancelled"; b.version++; });
        await request(`/api/casework/cases/${id}/review`, { verdict: "approved" });
        assert.equal((await request(`/api/casework/cases/${id}/deliver`, {})).value.delivery.reason, "audit_casework_booking_changed");
        const updated = await request("/api/casework/questions", { ...input, requestId: (target === "python" ? "d" : "e").repeat(36) }, app.customerToken);
        assert.equal(updated.status, 201, JSON.stringify(updated.value));
        const changed = (await request(`/api/casework/cases/${updated.value.caseId}`)).value;
        assert.equal(changed.context.booking.status, "cancelled");
        assert.equal(changed.context.bookingVersion, 2);
        assert.match(changed.answer.toLowerCase(), /cancelled|not cancellable|cannot/);
        app.casework.backend.storage.transact((state) => { const b = state.bookings.find((b) => b.id === "CW-1002"); b.status = "confirmed"; b.version = 1; });
      }
      const hidden = await request("/api/casework/questions", { ...input, requestId: (target === "ai-audit" ? "f" : target === "python" ? "1" : "2").repeat(36), question: "What is my refund if I cancel CW-1003?" }, app.customerToken);
      assert.equal(hidden.status, 201, JSON.stringify(hidden.value));
      const inaccessible = (await request(`/api/casework/cases/${hidden.value.caseId}`)).value;
      const observation = JSON.parse(app.casework.qualifications.read(inaccessible.origin.observation).toString());
      assert.ok(observation.toolCalls.some((call) => call.result.found === false));
      assert.equal(JSON.stringify(observation.toolCalls).includes('"id":"CW-1003","status"'), false);
    }
    assert.equal((await request("/api/casework/requests", undefined, other)).value.length, 0);
    const requests = (await request("/api/casework/requests", undefined, app.customerToken)).value;
    assert.ok(requests.length >= 6);
    assert.equal("answer" in requests[0], false);
    await close();
    app = await startWorkbench({ port: 0, home });
    const repeated = await request("/api/casework/questions", question, app.customerToken);
    assert.equal(repeated.status, 200, JSON.stringify(repeated.value));
    assert.equal(repeated.value.caseId, requests.find((r) => r.delivered).caseId);
  } finally { await close(); }
});
