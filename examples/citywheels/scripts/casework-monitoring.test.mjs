import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startWorkbench } from "./helpdesk-workbench.mjs";
import { configureSyntheticMonitoring } from "./casework-test-support.mjs";
import { MONITORING_SIGNALS } from "../../../dist/src/caseworkMonitoring.js";

const evaluator = process.env.INTENTGAUGE_ROOT ?? fileURLToPath(new URL("../../../../evalLOL/", import.meta.url));
test("monitoring HTTP requires reviewed fallback before activation, preserves alerts and explicitly restricts then recovers with fresh evidence", { skip: !existsSync(join(evaluator, "dist/src/index.js")) }, async () => {
  const home = mkdtempSync(join(tmpdir(), "casework-monitoring-http-"));
  const outside = "monitoring-outside-operator-credential", unprivileged = "monitoring-operator-without-reviewer";
  const identities = [{ token: outside, operator: { tenant: "another-shop", id: "outside", roles: ["operator", "reviewer"] } }, { token: unprivileged, operator: { tenant: "citywheels", id: "no-review", roles: ["operator"] } }];
  let app = await startWorkbench({ port: 0, home, caseworkIdentities: identities });
  const call = async (path, body, token = app.token) => {
    const response = await fetch(app.url.split("/#")[0] + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", "x-workbench-token": token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { status: response.status, value: response.headers.get("content-type")?.includes("ndjson") ? text.trim().split("\n").map(JSON.parse) : JSON.parse(text) };
  };
  const request = (route, body, token) => call("/api/casework/" + route, body, token);
  const run = async () => {
    const response = await call("/api/run", { target: "ai-audit", mode: "fake", caseId: "refund-1002", question: "What is my refund if I cancel CW-1002?" });
    assert.equal(response.status, 200);
    const manifest = response.value.find((event) => event.type === "complete")?.manifest;
    assert.equal(manifest?.status, "passed", JSON.stringify(response.value.at(-1)));
    return { digest: manifest.qualifications.find((p) => p.intent === "refund").digest, caseId: manifest.caseIds[0] };
  };
  const approve = async (digest) => {
    const response = await request("grants/approve", { packageDigest: digest, tier: "assist", expiresAt: new Date(Date.now() + 3600000).toISOString(), acceptsMutableModel: true, limits: { actions: ["deliver-answer"], maxAmountMinor: 0, currency: "EUR" } });
    assert.equal(response.status, 201, JSON.stringify(response.value)); return response.value;
  };
  const close = () => new Promise((resolve) => { app.server.closeAllConnections(); app.server.close(resolve); });
  try {
    const first = await run(), grant = await approve(first.digest);
    const missingPlan = await request("grants/activate", { grantId: grant.id });
    assert.equal(missingPlan.value.error, "audit_monitoring_plan_required");
    assert.equal((await request("monitoring", undefined, app.customerToken)).status, 403);
    const plan = await configureSyntheticMonitoring(app, { thresholds: Object.fromEntries(MONITORING_SIGNALS.map((s) => [s, s === "delivery-held" ? 2 : 1])) });
    const { id, tenant, reviewer, createdAt, scope, ...planBody } = plan;
    assert.equal((await request("monitoring/plans", planBody, unprivileged)).status, 403);
    assert.equal((await request("grants/activate", { grantId: grant.id })).status, 200);
    await request(`cases/${first.caseId}/deliver`, {}); await request(`cases/${first.caseId}/deliver`, {});
    assert.equal((await request("monitoring/scan", {})).value.incidents.length, 0);
    await request(`cases/${first.caseId}/outcome`, { state: "disputed", code: "customer_complaint" });
    const scan = await request("monitoring/scan", {}), [incident] = scan.value.incidents;
    assert.equal(scan.value.automaticRestriction, false);
    assert.equal(incident.signal, "complaint");
    assert.equal(incident.owner, plan.owner);
    assert.equal(incident.evidence[0].caseId, first.caseId);
    assert.equal((await request("authority")).value.revoked.includes(grant.id), false);
    assert.deepEqual((await request("monitoring/scan", {})).value.incidents, scan.value.incidents);
    assert.deepEqual((await request("monitoring", undefined, outside)).value.incidents, []);
    const restriction = { rationale: "Reviewed complaint; send new work to the named human fallback." };
    assert.equal((await request(`monitoring/incidents/${incident.id}/restrict`, restriction, outside)).status, 404);
    assert.equal((await request(`monitoring/incidents/${incident.id}/restrict`, restriction, unprivileged)).status, 403);
    assert.equal((await request(`monitoring/incidents/${incident.id}/restrict`, restriction)).value.status, "restricted");
    assert.equal((await request(`monitoring/incidents/${incident.id}/restrict`, restriction)).value.status, "restricted");
    assert.equal((await request("authority")).value.events.filter((e) => e.kind === "revoked").length, 1);
    assert.equal((await request(`cases/${first.caseId}/deliver`, {})).value.delivery.reason, "audit_authority_revoked");
    assert.equal((await request(`monitoring/incidents/${incident.id}/recover`, { packageDigest: first.digest, rationale: "Old evidence" })).value.error, "audit_monitoring_fresh_evidence_required");
    const second = await run();
    assert.notEqual(second.digest, first.digest);
    const recovery = await request(`monitoring/incidents/${incident.id}/recover`, { packageDigest: second.digest, rationale: "Fresh application evaluation and fallback capacity reviewed." });
    assert.equal(recovery.status, 200, JSON.stringify(recovery.value));
    assert.equal(recovery.value.status, "recovered");
    assert.equal((await request("authority")).value.active[JSON.stringify(["citywheels", "refund", "synthetic"])], grant.id);
    const replacement = await approve(second.digest);
    assert.equal((await request("grants/activate", { grantId: replacement.id })).status, 200);
    const oldReplacement = await approve(first.digest);
    assert.equal((await request("grants/activate", { grantId: oldReplacement.id })).value.error, "audit_monitoring_fresh_evidence_required");
    await close(); app = await startWorkbench({ port: 0, home, caseworkIdentities: identities });
    const persisted = (await request("monitoring")).value;
    assert.equal(persisted.incidents[0].recovery.activatedBy, replacement.id);
    assert.equal(persisted.plans[0].id, plan.id);
    assert.equal((await request("authority")).value.revoked.includes(grant.id), true);
  } finally { await close(); }
});
