import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, symlinkSync, linkSync, rmSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { scrubHistory } from "../src/history.js";
import { createInspectionProfile } from "../src/profile.js";
import { AuditLog, anchor, sha256, verifyAnchors } from "../src/audit.js";

const dirs: string[] = [];
const fresh = () => { const dir = mkdtempSync(join(tmpdir(), "history-")); dirs.push(dir); return dir; };
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const cli = new URL("../src/cli.js", import.meta.url).pathname;
const key = "ghp_" + "A".repeat(36);
const credentials = { aws_secret_access_key: "B".repeat(40), private_key: "synthetic-private-key" };

test("JSONL scrub CLI covers prompts, model output, tool arguments/results and text metadata", () => {
  const dir = fresh(), input = join(dir, "history.jsonl"), output = join(dir, "clean.jsonl");
  const values = [{ prompt: key, assistant: `postgres://user:fake-password@db.example.invalid/app` },
    { tool_call: { arguments: JSON.stringify(credentials) }, tool_result: credentials,
      image: `data:image/png;base64,${key}`, source: { type: "base64", media_type: "application/pdf", data: key }, title: "ticket agent@example.invalid" }];
  const original = values.map((v) => JSON.stringify(v)).join("\n") + "\n";
  writeFileSync(input, original);
  const receipt = JSON.parse(execFileSync(process.execPath, [cli, "scrub", "--input", input, "--output", output]).toString());
  const sanitized = readFileSync(output, "utf8"), parsed = sanitized.trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(readFileSync(input, "utf8"), original);
  assert.equal(receipt.records, 2); assert.equal(receipt.changed, 2);
  assert.equal(receipt.attachments, "excluded"); assert.equal(receipt.outputDigest, sha256(sanitized));
  assert.deepEqual(receipt.inspectionProfile, createInspectionProfile({ mode: "redact", scope: "history" }).receipt);
  assert.ok(!parsed[0].prompt.includes(key)); assert.ok(!parsed[0].assistant.includes("fake-password"));
  assert.equal(JSON.parse(parsed[1].tool_call.arguments).private_key, "[REDACTED:private-key]");
  assert.equal(parsed[1].source.data, key); assert.equal(parsed[1].image, values[1].image);
  assert.equal(statSync(output).mode & 0o777, 0o600);
  for (const secret of [key, credentials.aws_secret_access_key, credentials.private_key, input, output]) assert.ok(!JSON.stringify(receipt).includes(secret));
});

test("JSON exports retain structure, support Unicode, and produce idempotent sanitized content", async () => {
  const dir = fresh(), input = join(dir, "history.json"), output = join(dir, "clean.json"), second = join(dir, "again.json");
  writeFileSync(input, JSON.stringify({ title: "Zażółć gęślą jaźń 🦉", messages: [{ text: key }, { text: "clean" }], count: 2 }));
  const first = await scrubHistory({ input, output });
  const again = await scrubHistory({ input: output, output: second });
  assert.equal(first.records, 1); assert.equal(first.changed, 1); assert.equal(again.changed, 0);
  assert.equal(readFileSync(output, "utf8"), readFileSync(second, "utf8"));
  assert.equal(JSON.parse(readFileSync(output, "utf8")).title, "Zażółć gęślą jaźń 🦉");
  assert.equal(first.outputDigest, again.outputDigest);
});

test("exact allowlists work in history mode without appearing in the receipt", async () => {
  const dir = fresh(), input = join(dir, "h.jsonl"), output = join(dir, "c.jsonl");
  writeFileSync(input, JSON.stringify({ private_key: key }) + "\n");
  const receipt = await scrubHistory({ input, output, carnet: new Set([sha256(key)]) });
  assert.equal(receipt.changed, 0); assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), { private_key: key });
  assert.ok(!JSON.stringify(receipt).includes(sha256(key)));
});

test("JSONL is streamed with byte limits per record, not a limit on the full history", async () => {
  const dir = fresh(), input = join(dir, "h.jsonl"), output = join(dir, "c.jsonl");
  const record = JSON.stringify({ text: "🦉".repeat(24) });
  writeFileSync(input, (record + "\r\n").repeat(2000));
  const receipt = await scrubHistory({ input, output, maxRecordBytes: Buffer.byteLength(record) + 1 });
  assert.equal(receipt.records, 2000);
  await assert.rejects(scrubHistory({ input, output: join(dir, "too-small.jsonl"), maxRecordBytes: record.length }), /scrub_record_too_large/);
  assert.ok(!readdirSync(dir).some((f) => f.endsWith(".tmp")));
});

for (const [name, contents, code] of [
  ["malformed late record", JSON.stringify({ text: key }) + '\n{"private_key":"DO-NOT-PRINT"', "scrub_malformed_json"],
  ["duplicate keys", '{"a":1,"\\u0061":2}\n', "scrub_duplicate_keys"],
  ["nested duplicate keys", JSON.stringify({ text: '{"x":1,"x":2}' }), "scrub_unredactable_content"],
  ["secret property name", JSON.stringify({ [key]: "value" }), "scrub_unredactable_content"],
  ["invalid UTF-8", Buffer.from([0x22, 0xff, 0x22]), "scrub_invalid_utf8"],
] as const) test(`unsafe input: ${name} leaves original intact and publishes no partial file`, async () => {
  const dir = fresh(), input = join(dir, "h.jsonl"), output = join(dir, "c.jsonl");
  writeFileSync(input, contents);
  await assert.rejects(scrubHistory({ input, output }), new RegExp(code));
  assert.deepEqual(readFileSync(input), Buffer.from(contents));
  assert.deepEqual(readdirSync(dir), ["h.jsonl"]);
});

test("existing outputs, symlinks, hard links and input-as-output cannot replace the source", async () => {
  const dir = fresh(), input = join(dir, "h.jsonl"), original = JSON.stringify({ text: key });
  writeFileSync(input, original);
  await assert.rejects(scrubHistory({ input, output: input }), /scrub_output_must_differ/);
  for (const kind of ["regular", "symbolic", "hard"] as const) {
    const output = join(dir, kind);
    if (kind === "regular") writeFileSync(output, "keep");
    else if (kind === "symbolic") symlinkSync(input, output);
    else linkSync(input, output);
    await assert.rejects(scrubHistory({ input, output }), /scrub_output_exists/);
  }
  assert.equal(readFileSync(input, "utf8"), original);
  assert.equal(readFileSync(join(dir, "regular"), "utf8"), "keep");
});

test("chained audit records, including JSON arrays, are refused and anchors still verify", async () => {
  const dir = fresh(), input = join(dir, "audit.jsonl"), log = new AuditLog(input), anchors = join(dir, "anchors.jsonl");
  log.record({ systemId: "synthetic", useCase: "test", input: key, output: key });
  anchor(log, anchors);
  const before = readFileSync(input);
  await assert.rejects(scrubHistory({ input, output: join(dir, "clean.jsonl") }), /scrub_audit_log_forbidden/);
  const wrapped = join(dir, "wrapped.json"); writeFileSync(wrapped, JSON.stringify({ history: log.read() }));
  await assert.rejects(scrubHistory({ input: wrapped, output: join(dir, "wrapped-clean.json") }), /scrub_audit_log_forbidden/);
  writeFileSync(wrapped, JSON.stringify({ history: JSON.stringify(log.read()) }));
  await assert.rejects(scrubHistory({ input: wrapped, output: join(dir, "string-clean.json") }), /scrub_audit_log_forbidden/);
  assert.deepEqual(readFileSync(input), before); assert.ok(verifyAnchors(log, anchors).ok);
});

test("source edits during a scrub abort publication", async () => {
  const dir = fresh(), input = join(dir, "h.jsonl"), output = join(dir, "c.jsonl");
  writeFileSync(input, (JSON.stringify({ text: "ordinary content" }) + "\n").repeat(1000));
  let edited = false, done = false;
  const poll = () => {
    if (done) return;
    if (readdirSync(dir).some((f) => f.startsWith(".ai-audit-scrub-"))) { edited = true; appendFileSync(input, '{"new":"content"}\n'); return; }
    setImmediate(poll);
  };
  setImmediate(poll);
  try { await assert.rejects(scrubHistory({ input, output }), /scrub_source_changed/); assert.ok(edited); }
  finally { done = true; }
  assert.ok(!readdirSync(dir).includes("c.jsonl"));
});

test("CLI diagnostics are content-free and invalid arguments fail without an output", () => {
  const dir = fresh(), input = join(dir, "DO-NOT-PRINT.jsonl"), output = join(dir, "c.jsonl");
  writeFileSync(input, '{"text":"DO-NOT-PRINT"');
  const result = spawnSync(process.execPath, [cli, "scrub", "--input", input, "--output", output], { encoding: "utf8" });
  assert.equal(result.status, 2); assert.equal(result.stdout, ""); assert.equal(result.stderr.trim(), "scrub_malformed_json");
  for (const [args, code] of [[[], "scrub_input_and_output_required"],
    [["--input", input, "--output", output, "--format", "text"], "scrub_invalid_format"],
    [["--input", input, "--output", output, "--max-record-bytes", "NaN"], "scrub_invalid_record_limit"]] as const) {
    const r = spawnSync(process.execPath, [cli, "scrub", ...args], { encoding: "utf8" });
    assert.equal(r.status, 2); assert.equal(r.stdout, "");
    assert.equal(r.stderr.trim(), code);
  }
});
