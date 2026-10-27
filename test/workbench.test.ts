import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { AuditLog } from "../src/audit.js";
import { readEvidenceRecords } from "../src/evidence.js";
import { renderWorkbench } from "../src/workbench.js";

const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const cli = (...args: string[]) => spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
const from = "2026-10-27T00:00:00Z", to = "2026-10-28T00:00:00Z";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "audit-workbench-"));
  const log = new AuditLog(join(directory, "audit.jsonl"));
  const context = { bytes: { system: 20, tools: 10, user: 40, assistant: 5, toolResults: 0, attachments: 0, other: 12 }, totalBytes: 87, tokenBasis: "provider-scaled", tokens: { system: 4, tools: 2, user: 8, assistant: 1 } };
  log.append({ kind: "llm-call", id: "call-1", ts: "2026-10-27T10:00:00Z", provider: "openai", model: '<img src=x onerror=alert(1)>', systemId: "alice@example.com",
    virtualKey: "client@example.com", requestedModel: '<svg onload=alert(1)>', inspectionProfile: { digest: "d".repeat(64) },
    decision: { action: "forward-redacted", findings: [{ rule: "pii-email", path: "$.messages[0].content" }], signals: [{ rule: "pi-ignore-instructions", path: "$.messages[1].content" }] },
    session: { id: "session-1", turn: 1, digest: "digest-1", parent: null, messages: 1 }, context, usage: { input: 15, output: 3, cached: 5 }, upstreamStatus: 200,
    quinelings: [{ where: "result", op: "run", path: "$.messages[1].content", status: "completed", sourceHash: "ql_" + "a".repeat(64) }], output: "PRIVATE_OUTPUT" } as any);
  log.append({ kind: "llm-call", id: "call-2", ts: "2026-10-27T10:01:00Z", provider: "openai", model: "mock", decision: { action: "forward-original", findings: [] },
    session: { id: "session-1", turn: 2, digest: "digest-2", parent: "digest-1", messages: 3 }, context, upstreamStatus: 200 } as any);
  log.append({ kind: "decision", id: "decision-1", ts: "2026-10-27T10:02:00Z", systemId: "quote", useCase: "price", llmCallId: "call-1", inputHash: "b".repeat(64),
    output: "PRIVATE_DECISION_OUTPUT", redactedInput: "PRIVATE_INPUT", params: { note: "PRIVATE_PARAM" } } as any);
  log.append({ kind: "decision", id: "decision-1:qdl", refId: "decision-1", ts: "2026-10-27T10:02:00Z",
    qdl: { status: "completed", sourceHash: "ql_" + "a".repeat(64), inputs: { note: "PRIVATE_QDL_INPUT" }, outputsHash: "c".repeat(64) } } as any);
  log.append({ kind: "review", id: "review-1", refId: "decision-1", ts: "2026-10-27T10:03:00Z", review: { decision: "approved", reviewer: "PRIVATE_REVIEWER", note: "PRIVATE_REVIEW_NOTE", at: "2026-10-27T10:03:00Z" } } as any);
  return { directory, log };
}

test("workbench links sessions, scan history and QDL evidence without retained values", () => {
  const { log } = fixture();
  const snapshot = readEvidenceRecords(log);
  const result = renderWorkbench(snapshot.records, snapshot.digest, { from, to });
  assert.deepEqual([result.calls, result.sessions, result.findings, result.decisions, result.observedQuinelings], [2, 1, 2, 1, 1]);
  for (const shown of ["Sessions & context", "Scan & signal history", "Quinelings activity", "QDL decisions & reviews", "Where every feature lives", "System 20", "User 40", "pii-email", "pi-ignore-instructions", "decision-1", "receipt --log LOG", "Hash chain verified", "unknown"]) assert.ok(result.html.includes(shown), shown);
  for (const omitted of ["PRIVATE_OUTPUT", "PRIVATE_DECISION_OUTPUT", "PRIVATE_INPUT", "PRIVATE_PARAM", "PRIVATE_QDL_INPUT", "PRIVATE_REVIEWER", "PRIVATE_REVIEW_NOTE", "alice@example.com", "client@example.com", '<img src=x onerror=alert(1)>', '<svg onload=alert(1)>']) assert.equal(result.html.includes(omitted), false, omitted);
  assert.match(result.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(result.html, /\[withheld\]/);
  for (const expected of ["Investigate a request", "Client request", "Inspection", "Forwarding", "Provider result", "Tool observations", "QDL decision and review", "Integrity and origin", "No linked decision in this interval", "external anchor not checked", "decision-1", "observed", "derived", "unknown"]) assert.ok(result.html.includes(expected), expected);
  assert.match(result.html, /href="#investigate-/);
  assert.match(result.html, /QDL completed · review approved/);
  assert.equal(result.html.match(/<tr data-search-row/g)?.length, 8);
});

test("investigation marks absent forwarding evidence and stopped requests explicitly", () => {
  const { log } = fixture();
  log.append({ kind: "llm-call", id: "call-unreachable", ts: "2026-10-27T11:00:00Z", provider: "openai", decision: { mode: "redact", action: "forward-original", findings: [] }, upstreamStatus: null, error: "audit_upstream_unreachable" } as any);
  log.append({ kind: "llm-call", id: "call-blocked", ts: "2026-10-27T11:01:00Z", provider: "openai", decision: { mode: "no-go", action: "block", findings: [{ rule: "pii-email", path: "$.messages[0].content" }] }, upstreamStatus: null } as any);
  const snapshot = readEvidenceRecords(log);
  const result = renderWorkbench(snapshot.records, snapshot.digest, { from, to });
  assert.match(result.html, /No upstream response recorded/);
  assert.match(result.html, /The record does not establish that the upstream received this request/);
  assert.match(result.html, /Stopped by policy/);
  assert.match(result.html, /The policy record says this request was stopped before forwarding/);
  assert.equal(result.html.includes("PRIVATE_OUTPUT"), false);
});

test("workbench CLI exports exclusively, uses one verified snapshot, and rejects a broken chain", () => {
  const { directory, log } = fixture();
  const output = join(directory, "workbench.html"), original = readFileSync(log.path, "utf8");
  const exported = cli("workbench", "--log", log.path, "--output", output, "--from", from, "--to", to);
  assert.equal(exported.status, 0, exported.stderr);
  assert.equal(JSON.parse(exported.stdout).decisions, 1);
  assert.ok(readFileSync(output, "utf8").includes("decision-1"));
  assert.equal(readFileSync(log.path, "utf8"), original);
  const overwrite = cli("workbench", "--log", log.path, "--output", output);
  assert.equal(overwrite.status, 2);
  assert.match(overwrite.stderr, /audit_output_exists/);
  const invalidRange = cli("workbench", "--log", log.path, "--output", join(directory, "invalid.html"), "--from", to, "--to", from);
  assert.equal(invalidRange.status, 2);
  assert.match(invalidRange.stderr, /audit_invalid_time_range/);
  writeFileSync(log.path, original.replace("PRIVATE_OUTPUT", "ALTERED_OUTPUT"));
  const brokenFile = join(directory, "broken.html"), broken = cli("workbench", "--log", log.path, "--output", brokenFile);
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /audit_invalid_evidence_chain/);
  assert.equal(existsSync(brokenFile), false);
});

test("workbench caps displayed history and labels the selected interval", () => {
  const { log } = fixture();
  for (let i = 0; i < 505; i++) log.append({ kind: "llm-call", id: `extra-${i}`, ts: "2026-10-27T12:00:00Z", decision: { action: "forward-original", findings: [] },
    session: { id: "session-1", turn: i + 3, digest: `extra-digest-${i}`, parent: i ? `extra-digest-${i - 1}` : "digest-2", messages: 3 },
    context: { bytes: { system: 1, tools: 0, user: 1, assistant: 0, toolResults: 0, attachments: 0, other: 0 }, totalBytes: 2, tokenBasis: "provider-scaled" } } as any);
  const snapshot = readEvidenceRecords(log);
  const result = renderWorkbench(snapshot.records, snapshot.digest, { from, to });
  assert.equal(result.calls, 507);
  assert.match(result.html, /Showing the latest 500 of 507 rows/);
  assert.ok(result.html.includes("extra-504"));
  assert.equal(result.html.includes("extra-0</span>"), false);
  assert.match(result.html, /peak unknown tokens in shown calls/);
  assert.ok((result.html.match(/<tr data-search-row/g)?.length ?? 0) <= 1_010);
  const narrow = renderWorkbench(snapshot.records, snapshot.digest, { from: "2026-10-27T11:00:00+00:00", to });
  assert.equal(narrow.calls, 505);
});
