import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const directory = mkdtempSync(join(tmpdir(), "auditline-evidence-"));
const cli = fileURLToPath(new URL("../../dist/src/cli.js", import.meta.url));
const policy = fileURLToPath(new URL("./policy.json", import.meta.url));
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const command = (...args) => {
  const result = spawnSync(process.execPath, [cli, ...args, "--log", join(directory, "audit.jsonl")], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
};
const results = cases.map((item) => {
  const input = join(directory, `${item.name}-inputs.json`);
  writeFileSync(input, JSON.stringify(item.inputs));
  const decision = command("decide", "--policy", policy, "--inputs", input, "--system-id", "synthetic-evidence", "--use-case", "release");
  assert.equal(decision.status, "completed");
  const [assessment, allowed, action] = decision.outputs;
  assert.equal(assessment.state, item.expectedState);
  assert.equal(allowed, item.expectedAllowed);
  assert.equal(action.status, allowed ? "simulated" : "skipped");
  assert.equal(command("replay", "--decision", decision.decision).reproduced, true);
  let implementationDigest;
  for (const format of ["json", "svg"]) {
    const receipt = join(directory, `${item.name}.${format}`);
    command("receipt", "--decision", decision.decision, "--format", format, "--output", receipt);
    const verified = command("verify-receipt", "--input", receipt);
    assert.equal(verified.reproduced, true);
    assert.equal(verified.implementation.matched, true);
    implementationDigest = verified.implementation.digest;
  }
  return { case: item.name, state: assessment.state, allowed, action: action.status, implementationDigest, skipped: assessment.skipped.map((record) => record.reason) };
});
console.log(JSON.stringify({ directory, mode: "synthetic", clock: "recorded input, not current wall time", results }, null, 2));
