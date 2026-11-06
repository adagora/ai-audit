import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const dir = mkdtempSync(join(tmpdir(), "auditline-native-install-"));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: dir, encoding: "utf8", timeout: 120000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
};
try {
  for (const file of ["package.json", "package-lock.json", "dist/src"]) cpSync(new URL(file, root), join(dir, file), { recursive: true });
  run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--offline"]);
  const tree = JSON.parse(run("npm", ["ls", "--omit=dev", "--all", "--json"]));
  assert.deepEqual(tree.dependencies ?? {}, {});
  writeFileSync(join(dir, "policy.json"), readFileSync(new URL("examples/evaluation/machining-policy.json", root)));
  writeFileSync(join(dir, "inputs.json"), readFileSync(new URL("examples/evaluation/machining-inputs.json", root)));
  const cli = (...args) => {
    const text = run(process.execPath, ["dist/src/cli.js", ...args, "--log", join(dir, "audit.jsonl")]);
    return text.trim() ? JSON.parse(text) : undefined;
  };
  const decision = cli("decide", "--policy", "policy.json", "--inputs", "inputs.json", "--system-id", "native-install", "--use-case", "quote");
  assert.equal(decision.status, "completed");
  assert.equal(decision.outputs[0], 394);
  cli("approve", "--decision", decision.decision, "--reviewer", "synthetic-reviewer", "--verdict", "approved");
  assert.equal(cli("replay", "--decision", decision.decision).reproduced, true);
  cli("policies");
  for (const format of ["json", "svg", "html"]) {
    cli("receipt", "--decision", decision.decision, "--format", format, "--output", `receipt.${format}`);
    if (format !== "html") {
      const verified = cli("verify-receipt", "--input", `receipt.${format}`);
      assert.equal(verified.reproduced, true);
      assert.equal(verified.implementation.matched, true);
    }
  }
  writeFileSync(join(dir, "evidence-policy.json"), readFileSync(new URL("examples/evidence-policy/policy.json", root)));
  const cases = JSON.parse(readFileSync(new URL("examples/evidence-policy/cases.json", root), "utf8"));
  for (const item of cases) {
    writeFileSync(join(dir, "evidence-inputs.json"), JSON.stringify(item.inputs));
    const recorded = cli("decide", "--policy", "evidence-policy.json", "--inputs", "evidence-inputs.json", "--system-id", "native-install", "--use-case", "release");
    assert.equal(recorded.outputs[1], item.expectedAllowed);
    assert.equal(recorded.outputs[0].state, item.expectedState);
    cli("receipt", "--decision", recorded.decision, "--format", "json", "--output", `${item.name}.json`);
    const verified = cli("verify-receipt", "--input", `${item.name}.json`);
    assert.equal(verified.implementation.matched, true);
  }
  console.log(JSON.stringify({ productionPackages: 0, sdkInstalled: false, decide: "completed", replay: "reproduced", receipts: ["json", "svg", "html"], implementation: "matched", evidenceCases: cases.length, review: "recorded", policies: "read" }));
} finally { rmSync(dir, { recursive: true, force: true }); }
