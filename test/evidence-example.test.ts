import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join, normalize } from "node:path";
import { tmpdir } from "node:os";

test("real CLI evidence example exports matching-build receipts for current, stale and conflicting cases", { timeout: 30000 }, () => {
  const result = spawnSync(process.execPath, ["examples/evidence-policy/run.mjs"], { encoding: "utf8", timeout: 25000 });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(normalize(report.directory).startsWith(join(normalize(tmpdir()), "auditline-evidence-")));
  try {
    assert.equal(report.mode, "synthetic");
    assert.deepEqual(report.results.map((r: any) => [r.case, r.allowed, r.action]), [["current", true, "simulated"], ["stale", false, "skipped"], ["conflict", false, "skipped"]]);
    assert.equal(new Set(report.results.map((r: any) => r.implementationDigest)).size, 1);
    for (const name of ["current", "stale", "conflict"]) {
      const receipt = JSON.parse(readFileSync(join(report.directory, `${name}.json`), "utf8"));
      assert.equal(receipt.version, 3);
      assert.equal(receipt.program.implementation.files.length, 5);
      const svg = readFileSync(join(report.directory, `${name}.svg`), "utf8");
      assert.ok(svg.includes("Interpreter "));
      assert.ok(svg.includes(`assessment = ${name === "conflict" ? "conflict" : "supported"}`));
      assert.ok(svg.includes(`allowed = ${name === "current" ? "true" : "false"}`));
    }
  } finally { rmSync(report.directory, { recursive: true, force: true }); }
});
