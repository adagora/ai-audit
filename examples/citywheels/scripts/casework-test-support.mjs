import assert from "node:assert/strict";
import { MONITORING_SIGNALS } from "../dist/src/caseworkMonitoring.js";

export async function configureSyntheticMonitoring(app, overrides = {}) {
  const response = await fetch(app.url.split("/#")[0] + "/api/casework/monitoring/plans", { method: "POST", headers: { "content-type": "application/json", "x-workbench-token": app.token }, body: JSON.stringify({
    intent: "refund", expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(), windowMs: 3600000,
    thresholds: Object.fromEntries(MONITORING_SIGNALS.map((s) => [s, ["grant-expired", "release-changed", "plan-expired", "fallback-overload"].includes(s) ? 1 : 5])), owner: "quality-ops", responseMinutes: 60,
    fallback: { destination: "human", owner: "support-ops", capacityPerHour: 100, maxPendingCases: 100, basis: "synthetic", evidence: "Synthetic HTTP test capacity declaration" }, ...overrides,
  }) });
  const value = await response.json();
  assert.equal(response.status, 201, JSON.stringify(value));
  return value;
}
