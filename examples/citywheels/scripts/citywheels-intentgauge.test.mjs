import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { AuditLog } from "../../../dist/src/audit.js";

const execute = (input) => {
  const child = spawnSync(process.execPath, [new URL("./citywheels-intentgauge.mjs", import.meta.url).pathname], { input: JSON.stringify(input), encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH } });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
};

test("live worker requires an explicit key before executing a question", () => {
  const child = spawnSync(process.execPath, [new URL("./citywheels-intentgauge.mjs", import.meta.url).pathname, "--live"], { input: JSON.stringify({ question: "Refund CW-1002?" }), encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH } });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Live mode requires OPENAI_API_KEY/);
  assert.equal(child.stdout, "");
});

test("real CityWheels QDL respects second-level boundaries and isolates fixture overrides", () => {
  for (const [booking, now, expected] of [
    ["CW-1007", "2026-06-10T09:00:00+02:00", 186],
    ["CW-1007", "2026-06-10T09:00:01+02:00", 168],
    ["CW-1010", "2026-06-10T09:00:00+02:00", 170],
    ["CW-1010", "2026-06-10T09:00:01+02:00", 150],
  ]) {
    const output = execute({ question: `Refund if I cancel ${booking}?`, now });
    assert.equal(output.data.refund.total_refund_eur, expected);
    assert.equal(output.data.audit.chainVerified, true);
    assert.ok(output.data.audit.decisions >= 1);
    assert.equal(output.data.bookingsUnchanged, true);
    assert.ok(output.data.audit.records.some((record) => record.kind === "decision" && record.llmCallId));
    assert.equal(existsSync(output.data.audit.logPath), true);
    assert.equal(new AuditLog(output.data.audit.logPath).verifyChain().ok, true);
    const manifest = JSON.parse(readFileSync(join(output.data.audit.evidenceDirectory, "manifest.json"), "utf8"));
    assert.equal(manifest.status, "completed");
    assert.equal(manifest.logPath, output.data.audit.logPath);
    assert.equal(existsSync(join(output.data.audit.evidenceDirectory, "data/bookings.json")), true);
  }
  const changed = execute({ question: "Refund if I cancel CW-1002?", bookingPatch: { id: "CW-1002", rental_price_eur: 100 } });
  const original = execute({ question: "Refund if I cancel CW-1002?" });
  assert.equal(changed.data.refund.total_refund_eur, 350);
  assert.equal(original.data.refund.total_refund_eur, 340);
  assert.notEqual(changed.data.bookingFixtureHash, original.data.bookingFixtureHash);
});

const pythonRoot = process.env.CITYWHEELS_PYTHON_ROOT ?? fileURLToPath(new URL("../../../../EternalChat copy/help-desk-agent/help-desk-agent/", import.meta.url));

test("separate Python application uses the proxy and shared QDL without changing the native baseline", { skip: !existsSync(join(pythonRoot, "citywheels/agent.py")) && "Check out help-desk-agent or set CITYWHEELS_PYTHON_ROOT" }, () => {
  const run = (input) => {
    const child = spawnSync(process.execPath, [new URL("./citywheels-python-audited.mjs", import.meta.url).pathname, pythonRoot], { input: JSON.stringify(input), encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH } });
    assert.equal(child.status, 0, child.stderr); return JSON.parse(child.stdout);
  };
  const original = run({ question: "What is my refund if I cancel CW-1002?" });
  assert.equal(original.data.refund.total_refund_eur, 340);
  assert.match(original.answer, /340 EUR/);
  assert.equal(original.data.bookingsUnchanged, true);
  assert.equal(original.data.audit.requests, original.data.modelTurns);
  const log = new AuditLog(original.data.audit.logPath);
  assert.equal(log.verifyChain().ok, true);
  assert.ok(log.read().some((r) => r.kind === "decision" && r.llmCallId));
  const program = log.read().find((r) => r.kind === "program");
  assert.ok(program);
  const javascript = execute({ question: "Refund if I cancel CW-1002?" });
  assert.ok(javascript.data.audit.records.some((r) => r.kind === "program" && r.id === program.id));
  assert.equal(original.data.execution, "actual-python-agent-proxy-qdl");
  const shifted = run({ question: "Refund if I cancel CW-1007?", now: "2026-06-10T09:00:01+02:00" });
  assert.equal(shifted.data.refund.total_refund_eur, 168);
  const changed = run({ question: "Refund if I cancel CW-1002?", bookingPatch: { id: "CW-1002", rental_price_eur: 100 } });
  assert.equal(changed.data.refund.total_refund_eur, 350);
  const native = spawnSync(process.env.CITYWHEELS_PYTHON ?? "python3", ["-B", new URL("./citywheels-python.py", import.meta.url).pathname, pythonRoot], { input: JSON.stringify({ question: "Refund if I cancel CW-1002?" }), encoding: "utf8", timeout: 30000, env: { PATH: process.env.PATH } });
  assert.equal(native.status, 0, native.stderr);
  assert.equal(JSON.parse(native.stdout).data.refund.total_refund_eur, 340);
  assert.equal(JSON.parse(native.stdout).data.audit, undefined);
});
