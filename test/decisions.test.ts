import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mockUpstream, startProxy } from "./helpers.js";
import { sha256 } from "../src/audit.js";

const skip = Number(process.versions.node.split(".")[0]) < 22 ? "Quinelings SDK needs Node >= 22" : false;
const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const policy = fileURLToPath(new URL("../../examples/quineling-quote/policy.json", import.meta.url));
const inputs = fileURLToPath(new URL("../../examples/quineling-quote/inputs.json", import.meta.url));
const up = await mockUpstream(), px = await startProxy(up.url, "redact");
after(() => { px.close(); up.close(); });
const dir = mkdtempSync(join(tmpdir(), "decisions-"));
const cliRun = (logPath: string, ...args: string[]) => {
  const r = spawnSync(process.execPath, [cli, ...args, "--log", logPath], { encoding: "utf8" });
  return { code: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : undefined, err: r.stderr.trim() };
};
const run = (...args: string[]) => cliRun(px.log.path, ...args);
const decide = (inputsFile: string, ...extra: string[]) => run("decide", "--policy", policy, "--inputs", inputsFile, "--system-id", "cad-quote", "--use-case", "machining-quote", ...extra);

test("decide, approve and replay from the CLI, linked to a proxied LLM call, in one chain with the proxy", { skip }, async () => {
  const llm = await fetch(px.url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-x", messages: [{ role: "user", content: "Quote flange DN100, CAM 42 min" }] }) });
  await llm.text();
  const llmCallId = llm.headers.get("x-request-id")!;
  const d = decide(inputs, "--llm-call", llmCallId);
  assert.equal(d.code, 0, d.err); assert.equal(d.out.status, "completed"); assert.deepEqual(d.out.outputs.slice(0, 3), [394, false, false]);
  assert.equal(d.out.outputs[4].action, "route-to-human-review");
  const rec = px.log.read().find((r) => r.id === d.out.decision)!;
  assert.equal(rec.llmCallId, llmCallId); assert.equal(rec.output !== undefined, true);
  const review = run("approve", "--decision", d.out.decision, "--reviewer", "A. Nowak", "--verdict", "approved", "--note", "policy price 394 PLN");
  assert.equal(review.code, 0, review.err); assert.equal(review.out.decision, d.out.decision);
  const replay = run("replay", "--decision", d.out.decision);
  assert.equal(replay.code, 0, replay.err); assert.deepEqual([replay.out.reproduced, replay.out.status], [true, "completed"]);
  assert.deepEqual(px.log.verifyChain(), { ok: true });
  assert.deepEqual(px.log.read().map((r) => r.kind), ["llm-call", "program", "decision", "decision", "review"]);
});

test("a refusal is recorded and replays as a refusal; usage errors write nothing; a tampered log does not reproduce", { skip }, async () => {
  const negative = join(dir, "negative.json");
  writeFileSync(negative, JSON.stringify({ minutes: -5, rate: 4.5, setup: 120, material: 85, llmPrice: 274 }));
  const before = px.log.read().length;
  const refused = decide(negative);
  assert.equal(refused.code, 1); assert.equal(refused.out.status, "refused");
  assert.deepEqual(refused.out.error, { code: "refinement", path: "$.bindings.minutes" }); assert.equal(refused.out.outputs, undefined);
  assert.equal(px.log.read().length, before + 2);
  const replay = run("replay", "--decision", refused.out.decision);
  assert.equal(replay.code, 0, replay.err); assert.deepEqual([replay.out.reproduced, replay.out.status], [true, "refused"]);
  for (const [args, code] of [
    [["decide", "--policy", policy, "--inputs", inputs, "--system-id", "s", "--use-case", "u", "--llm-call", "not-a-call"], "audit_unknown_llm_call"],
    [["decide", "--policy", inputs, "--inputs", inputs, "--system-id", "s", "--use-case", "u"], "audit_invalid_policy"],
    [["decide", "--policy", policy, "--inputs", join(dir, "missing.json"), "--system-id", "s", "--use-case", "u"], "audit_invalid_inputs"],
    [["decide", "--policy", policy, "--inputs", inputs], "audit_missing_argument"],
    [["approve", "--decision", refused.out.decision, "--reviewer", "A", "--verdict", "maybe"], "audit_invalid_verdict"],
    [["approve", "--decision", `${refused.out.decision}:qdl`, "--reviewer", "A", "--verdict", "approved"], "audit_unknown_decision"],
    [["replay", "--decision", "not-a-decision"], "audit_no_qdl_step"],
  ] as const) {
    const x = run(...args);
    assert.equal(x.code, 2, `${code}: ${x.err}`); assert.equal(x.err, code); assert.equal(x.out, undefined);
  }
  assert.equal(px.log.read().length, before + 2);
  const lines = readFileSync(px.log.path, "utf8").trim().split("\n"), i = lines.findIndex((l) => l.includes('"qdl"') && l.includes('"completed"'));
  const edited = JSON.parse(lines[i]); edited.qdl.inputs.rate = 3.5; lines[i] = JSON.stringify(edited);
  const tampered = join(dir, "tampered.jsonl"); writeFileSync(tampered, lines.join("\n") + "\n");
  const t = cliRun(tampered, "replay", "--decision", edited.refId);
  assert.equal(t.code, 1); assert.equal(t.out.reproduced, false);
  const restored = JSON.parse(lines[i]); restored.qdl.inputs.rate = 4.5; lines[i] = JSON.stringify(restored);
  const p = lines.findIndex((l) => l.includes('"kind":"program"')), program = JSON.parse(lines[p]);
  program.source = program.source.replace("150", "1"); lines[p] = JSON.stringify(program);
  writeFileSync(tampered, lines.join("\n") + "\n");
  const s = cliRun(tampered, "replay", "--decision", edited.refId);
  assert.equal(s.code, 1); assert.equal(s.err, "audit_qdl_source_invalid");
});

test("decide refuses inputs with personal data before running them, keeps only rule and path, and replay says not replayable", { skip }, async () => {
  const sensitive = join(dir, "sensitive.json"), email = "jan.kowalski@example.com";
  writeFileSync(sensitive, JSON.stringify({ minutes: 42, rate: 4.5, setup: 120, material: 85, llmPrice: 274, customer: email }));
  const before = px.log.read().length;
  const refused = decide(sensitive);
  assert.equal(refused.code, 1, refused.err); assert.equal(refused.out.status, "refused");
  assert.deepEqual(refused.out.error, { code: "audit-sensitive-input", path: "$.inputs.customer" });
  assert.deepEqual(refused.out.findings, [{ rule: "pii-email", path: "$.inputs.customer" }]);
  assert.equal(px.log.read().length, before + 2); assert.ok(!readFileSync(px.log.path, "utf8").includes(email));
  const replay = run("replay", "--decision", refused.out.decision);
  assert.equal(replay.code, 2); assert.equal(replay.err, "audit_qdl_not_replayable");
  const allow = join(dir, "allow.json"), bad = join(dir, "bad-allow.json");
  writeFileSync(allow, JSON.stringify([sha256(email)])); writeFileSync(bad, JSON.stringify(["not-a-hash"]));
  const allowed = decide(sensitive, "--allow-hashes", allow);
  assert.deepEqual(allowed.out.error, { code: "unknown-field", path: "$.customer" }); assert.equal(allowed.out.findings, undefined);
  const invalid = decide(sensitive, "--allow-hashes", bad);
  assert.equal(invalid.code, 2); assert.equal(invalid.err, "audit_invalid_allowlist");
});
