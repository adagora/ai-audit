import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AuditLog, canon, sha256, type Rec } from "../src/audit.js";
import { extract } from "../src/extract.js";
import { callFailed, firstDisagreement, governorIntent, governorSnapshots, labView, reportedTokens, type Governed } from "../src/lab.js";
import { compareSession, renderComparison } from "../src/labCompare.js";
import { recordQdl } from "../src/qdl.js";

const makeLog = () => new AuditLog(join(mkdtempSync(join(tmpdir(), "lab-compare-")), "audit.jsonl"));
const call = (log: AuditLog, id: string, overrides: Partial<Rec> = {}) => log.append({ kind: "llm-call", id, ts: "2026-10-26T10:00:00Z", upstreamStatus: 200, stop: "stop", session: { id: "session-a", turn: 1, digest: id, parent: null }, ...overrides });
const observed = (fields: Partial<Rec>): Rec => ({ kind: "llm-call", id: "fixture", ts: "2026-10-26T10:00:00Z", prevHash: "", hash: "", ...fields });
const cliPath = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const cli = (...args: string[]) => spawnSync(process.execPath, [cliPath, "lab", ...args], { encoding: "utf8" });

test("governor recognizes completion and tool handoff from all supported API shapes", () => {
  const responses = extract("openai-responses", JSON.stringify({ status: "completed", output: [] }), false);
  const anthropic = extract("anthropic-messages", JSON.stringify({ stop_reason: "tool_use", content: [] }), false);
  for (const stop of [responses.stop, anthropic.stop, "end_turn", "stop", "tool_calls", "stop_sequence", "pause_turn", "function_call"]) {
    assert.equal(callFailed(observed({ upstreamStatus: 200, stop })), false, stop);
  }
  for (const fields of [{ upstreamStatus: 500 }, { upstreamStatus: 200, stop: "incomplete" }, { upstreamStatus: 200, stop: "max_tokens" }, { upstreamStatus: 200, clientAborted: true }]) {
    assert.equal(callFailed(observed(fields)), true, JSON.stringify(fields));
  }
  assert.equal(callFailed(observed({ upstreamStatus: 200, stop: "completed", clientAborted: true })), false);
});

test("snapshots preserve append order and separate failed calls from successful retries and branches", () => {
  const log = makeLog();
  call(log, "later-turn", { upstreamStatus: 500, session: { id: "session-a", turn: 2, digest: "d2", parent: "d1" } });
  call(log, "earlier-turn", { session: { id: "session-a", turn: 1, digest: "d1", parent: null }, usage: { input: 10, output: 2 } });
  call(log, "retry", { session: { id: "session-a", turn: 2, digest: "d2", parent: "d1" } });
  call(log, "branch", { session: { id: "session-a", turn: 2, digest: "d3", parent: "d1" } });
  call(log, "other-session", { session: { id: "session-b", turn: 1 } });
  const snapshots = governorSnapshots(log.read());
  assert.deepEqual(snapshots.map((s) => s.callId), ["later-turn", "earlier-turn", "retry", "branch", "other-session"]);
  assert.deepEqual(snapshots.map((s) => s.failures), [1, 1, 1, 1, 0]);
  assert.equal(snapshots[2].retries, 1);
  assert.equal(snapshots[3].branches, 1);
  assert.equal(snapshots[0].reported, undefined);
  assert.equal(snapshots[1].reported, 12);
  for (const usage of [{ input: 1 }, { input: -1, output: 2 }, { input: Infinity, output: 1 }, { input: Number.MAX_SAFE_INTEGER, output: 1 }]) {
    assert.equal(reportedTokens(observed({ usage })), undefined);
  }
});

test("comparison evaluates unknown usage, recovers both policies, and marks observations after a proposed pause", async () => {
  const log = makeLog();
  call(log, "one", { upstreamStatus: 500 });
  call(log, "two", { upstreamStatus: 500, session: { id: "session-a", turn: 2 } });
  call(log, "three", { session: { id: "session-a", turn: 3 } });
  const original = readFileSync(log.path, "utf8");
  const report = await compareSession(log, { baselineLimit: 1, candidateLimit: 2 });
  assert.equal(readFileSync(log.path, "utf8"), original);
  assert.deepEqual(report.summary, { calls: 3, disagreements: 1, unknownUsage: 3, firstDisagreement: "one" });
  assert.deepEqual(report.rows.map((r) => [r.baseline.action, r.candidate.action]), [["pause", "continue"], ["pause", "pause"], ["pause", "pause"]]);
  assert.deepEqual(report.rows.map((r) => [r.baseline.hypothetical, r.candidate.hypothetical]), [[false, false], [true, false], [true, true]]);
  assert.deepEqual(report.rows[0].inputs, { failures: 1 });
  assert.equal(report.evidence.logDigest, sha256(original));
  assert.equal(report.evidence.replay, "reproduced");
  assert.equal(report.evidence.anchors, "not-checked");
  assert.notEqual(report.policies.baseline.sourceHash, report.policies.candidate.sourceHash);
  const { Session } = await import("@quinelings/agent-sdk/v1");
  const session = new Session();
  const artifact = session.recover({ source: report.policies.baseline.source });
  assert.equal(artifact.id, report.policies.baseline.sourceHash);
  assert.deepEqual(session.run({ artifactId: artifact.id, requestId: "exported", inputs: report.rows[0].inputs }).result.occurrences[0].outputs, report.rows[0].baseline.output);
  assert.equal(report.rows[0].recordHash, log.read()[0].hash);
  const same = await compareSession(log, { baselineLimit: 2, candidateLimit: 2 });
  assert.equal(same.summary.disagreements, 0);
  assert.equal(same.summary.firstDisagreement, undefined);
  const html = renderComparison(report);
  assert.match(html, /First disagreement: observation 1/);
  assert.match(html, /hypothetical/);
  assert.match(html, /unknown/);
  assert.match(html, /External anchors were not checked/);
});

test("comparison refuses ambiguous sessions, invalid limits and damaged evidence", async () => {
  const log = makeLog();
  call(log, "one");
  call(log, "other", { session: { id: "session-b", turn: 1 } });
  const opts = { baselineLimit: 2, candidateLimit: 3 };
  await assert.rejects(compareSession(log, opts), /audit_lab_session_required/);
  await assert.rejects(compareSession(log, { ...opts, sessionId: "absent" }), /audit_lab_session_not_found/);
  assert.equal((await compareSession(log, { ...opts, sessionId: "session-b" })).summary.calls, 1);
  for (const baselineLimit of [0, -1, 1.5, NaN, Infinity]) await assert.rejects(compareSession(log, { ...opts, baselineLimit }), /audit_invalid_failure_limit/);
  const original = readFileSync(log.path, "utf8");
  for (const damaged of [original.replace('"upstreamStatus":200', '"upstreamStatus":500'), original.trimEnd(), "null\n", "{\n"]) {
    writeFileSync(log.path, damaged);
    await assert.rejects(compareSession(log, opts), /audit_invalid_evidence_chain/);
  }
  writeFileSync(log.path, original);
  call(log, "one");
  await assert.rejects(compareSession(log, { ...opts, sessionId: "session-a" }), /audit_lab_duplicate_call/);
});

test("lab CLI writes separate HTML or JSON and cannot overwrite the source log", () => {
  const log = makeLog();
  call(log, "<script>unsafe</script>", { upstreamStatus: 500 });
  const original = readFileSync(log.path, "utf8");
  const json = cli("--log", log.path, "--baseline-limit", "1", "--candidate-limit", "2");
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).summary.disagreements, 1);
  const output = log.path + ".html";
  const html = cli("--log", log.path, "--output", output);
  assert.equal(html.status, 0, html.stderr);
  const page = readFileSync(output, "utf8");
  assert.equal(page.includes("<script>unsafe"), false);
  assert.match(page, /&lt;script&gt;unsafe/);
  const overwrite = cli("--log", log.path, "--output", log.path);
  assert.equal(overwrite.status, 2);
  assert.match(overwrite.stderr, /audit_output_exists/);
  assert.equal(readFileSync(log.path, "utf8"), original);
  const invalid = cli("--log", log.path, "--format", "csv");
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /audit_invalid_format/);
});

test("first disagreement includes a first-row split without inventing prior agreement", () => {
  const row = { strict: { output: [true] }, loose: { output: [false] } } as Governed;
  assert.deepEqual(firstDisagreement([row]), { agreed: undefined, split: row });
  assert.equal(firstDisagreement([]), undefined);
});

test("inspection refuses mismatched calls, mismatched inputs, forged outputs and replay divergence", async () => {
  const log = makeLog();
  call(log, "one");
  call(log, "two");
  const decision = async (llmCallId: string, failures: number, limit: number) => (await recordQdl(log, { systemId: "test", useCase: "lab", input: "fixture", llmCallId }, { intent: governorIntent(limit) }, { failures })).decision.id;
  const a = await decision("one", 1, 1), b = await decision("one", 1, 2);
  const otherCall = await decision("two", 1, 2), otherInput = await decision("one", 2, 2);
  await labView(log, a, b);
  await assert.rejects(labView(log, a, otherCall), /audit_lab_incomparable_decisions/);
  await assert.rejects(labView(log, a, otherInput), /audit_lab_incomparable_decisions/);
  const original = log.read();
  const reseal = (records: Rec[]) => {
    let previous = "0".repeat(64);
    for (const record of records) {
      record.prevHash = previous;
      const { hash, ...body } = record;
      previous = record.hash = sha256(canon(body));
    }
    writeFileSync(log.path, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  };
  const forged = structuredClone(original);
  forged.find((r) => r.id === a)!.output = ["forged"];
  reseal(forged);
  await assert.rejects(labView(log, a, b), /audit_lab_inconsistent_decision/);
  const divergent = structuredClone(original);
  (divergent.find((r) => r.refId === a)!.qdl as { inputHash: string }).inputHash = "0".repeat(64);
  reseal(divergent);
  await assert.rejects(labView(log, a, b), /audit_lab_replay_failed/);
});
