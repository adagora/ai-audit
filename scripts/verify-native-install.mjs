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
    if (format !== "html") assert.equal(cli("verify-receipt", "--input", `receipt.${format}`).reproduced, true);
  }
  console.log(JSON.stringify({ productionPackages: 0, sdkInstalled: false, decide: "completed", replay: "reproduced", receipts: ["json", "svg", "html"], review: "recorded", policies: "read" }));
} finally { rmSync(dir, { recursive: true, force: true }); }
