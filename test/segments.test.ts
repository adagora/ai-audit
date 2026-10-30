import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditLog, anchor, prune, verifyAnchors } from "../src/audit.js";
import { createProxy } from "../src/proxy.js";
import { mockUpstream, startProxy } from "./helpers.js";

const clockFrom = (start: string, stepMs: number) => { let t = Date.parse(start); return () => new Date((t += stepMs)).toISOString(); };
const fresh = (clock = clockFrom("2026-10-01T00:00:00.000Z", 1000), rotateBytes = 0) => {
  const dir = mkdtempSync(join(tmpdir(), "segments-"));
  return { dir, log: new AuditLog(join(dir, "audit.jsonl"), clock, rotateBytes) };
};
const decision = (log: AuditLog, output: unknown) => log.record({ systemId: "s", useCase: "u", input: "in", output });
const lines = (path: string) => readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const rewrite = (path: string, records: unknown[]) => writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n");

test("rotate renames the log into a timestamped segment and the next file starts with a record linking to it", () => {
  const { dir, log } = fresh();
  decision(log, 1); const last = decision(log, 2);
  const link = log.rotate();
  assert.deepEqual(link, { file: "audit.20261001T000003000Z.jsonl", count: 2, head: last.hash });
  decision(log, 3);
  assert.deepEqual(log.files(), [join(dir, "audit.20261001T000003000Z.jsonl"), log.path]);
  const [segment] = lines(log.path);
  assert.equal(segment.kind, "segment"); assert.equal(segment.prevHash, "0".repeat(64)); assert.deepEqual(segment.previous, link);
  assert.deepEqual(log.read().map((r) => r.kind), ["decision", "decision", "segment", "decision"]);
  assert.deepEqual(log.readCurrent().map((r) => r.kind), ["segment", "decision"]);
  assert.deepEqual(log.verifyChain(), { ok: true });
  assert.deepEqual(log.verifySeries(), { ok: true, files: 2, records: 4 });
  assert.equal(new AuditLog(join(dir, "empty.jsonl")).rotate(), undefined);
});

test("a torn last line is not rotated away", () => {
  const { log } = fresh();
  decision(log, 1);
  writeFileSync(log.path, readFileSync(log.path, "utf8").slice(0, -5));
  assert.throws(() => log.rotate(), /audit_log_unavailable: torn last line/);
  assert.equal(log.closedSegments().length, 0);
});

test("an append rotates a file grown past rotateBytes, and a log moved aside by hand is continued", () => {
  const { dir, log } = fresh(undefined, 1500);
  for (let i = 0; i < 20; i++) decision(log, i);
  const closed = log.closedSegments();
  assert.ok(closed.length >= 3, `${closed.length} segments`);
  for (const f of closed) assert.ok(statSync(f).size <= 1500 + 600, `${basename(f)} has ${statSync(f).size} bytes`);
  assert.deepEqual(log.read().filter((r) => r.kind === "decision").map((r) => r.output), Array.from({ length: 20 }, (_, i) => i));
  renameSync(log.path, join(dir, "audit.20261002T000000000Z.jsonl"));
  log.rotateBytes = 0;
  decision(log, 20);
  assert.equal(lines(log.path)[0].previous.file, "audit.20261002T000000000Z.jsonl");
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("a changed, shortened or deleted closed segment breaks the series and names the file", () => {
  const setup = () => {
    const { log } = fresh();
    decision(log, 1); decision(log, 2); log.rotate(); decision(log, 3); log.rotate(); decision(log, 4);
    return { log, closed: log.closedSegments() };
  };
  {
    const { log, closed } = setup(), records = lines(closed[0]);
    records[1].output = 99; rewrite(closed[0], records);
    assert.deepEqual(log.verifyChain(), { ok: false, badLine: 2, reason: "hash mismatch", file: basename(closed[0]) });
  }
  {
    const { log, closed } = setup();
    rewrite(closed[0], lines(closed[0]).slice(0, 1));
    assert.deepEqual(log.verifyChain(), { ok: false, badLine: 1, reason: `segment does not continue ${basename(closed[0])}`, file: basename(closed[1]) });
  }
  {
    const { log, closed } = setup();
    unlinkSync(closed[0]);
    assert.deepEqual(log.verifyChain(), { ok: false, badLine: 1, reason: `segment ${basename(closed[0])} is missing and no prune record lists it`, file: basename(closed[1]) });
  }
  {
    const { log, closed } = setup();
    unlinkSync(closed[1]);
    assert.deepEqual(log.verifyChain(), { ok: false, badLine: 1, reason: `segment does not continue ${basename(closed[0])}` });
  }
});

test("prune deletes closed segments older than the window after recording them; verify and anchors accept the recorded gap", () => {
  const { dir, log } = fresh(clockFrom("2026-01-01T00:00:00.000Z", 86_400_000)), anchors = join(dir, "anchors.jsonl");
  decision(log, "a"); const b = decision(log, "b");
  anchor(log, anchors, "2026-01-03T12:00:00.000Z");
  log.rotate(); decision(log, "c"); log.rotate(); decision(log, "d");
  anchor(log, anchors, "2026-01-09T00:00:00.000Z");
  const [first, second] = log.closedSegments();
  assert.throws(() => prune(log, 0), /audit_invalid_keep_days/);
  const pruned = prune(log, 5, new Date("2026-01-09T12:00:00.000Z"));
  assert.deepEqual(pruned, [{ file: basename(first), count: 2, head: b.hash, firstTs: "2026-01-02T00:00:00.000Z", lastTs: "2026-01-03T00:00:00.000Z" }]);
  assert.ok(!existsSync(first) && existsSync(second));
  const record = log.readCurrent().at(-1)!;
  assert.equal(record.kind, "prune"); assert.equal(record.keepDays, 5); assert.deepEqual(record.segments, pruned);
  assert.deepEqual(log.verifySeries(), { ok: true, files: 2, records: 5, prunedBefore: "2026-01-04T00:00:00.000Z", prunedThrough: basename(first) });
  assert.deepEqual(verifyAnchors(log, anchors), { ok: true, anchors: 2, pruned: 1 });
  assert.deepEqual(prune(log, 5, new Date("2026-01-09T12:00:00.000Z")), []);
  assert.equal(log.readCurrent().filter((r) => r.kind === "prune").length, 1);
  const records = lines(second); records[1].output = "changed"; rewrite(second, records);
  assert.throws(() => prune(log, 1, new Date("2027-01-01T00:00:00.000Z")), /audit_chain_broken/);
  assert.ok(existsSync(second));
});

test("segment names keep their order when the clock steps back, so the series still verifies", () => {
  let t = Date.parse("2026-10-01T00:00:00.000Z");
  const { log } = fresh(() => new Date(t).toISOString());
  decision(log, 1); t += 3000; log.rotate();
  decision(log, 2); t -= 60_000; log.rotate();
  decision(log, 3);
  assert.deepEqual(log.closedSegments().map((f) => basename(f)), ["audit.20261001T000003000Z.jsonl", "audit.20261001T000003001Z.jsonl"]);
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("a segment name comes after the segment the current file links to, also when prune removed every closed segment and the clock stepped back", () => {
  let t = Date.parse("2026-01-01T00:00:00.000Z");
  const { log } = fresh(() => new Date(t).toISOString());
  decision(log, 1); log.rotate(); decision(log, 2);
  assert.equal(prune(log, 1, new Date("2026-02-01T00:00:00.000Z")).length, 1);
  t -= 60_000; log.rotate();
  assert.deepEqual(log.closedSegments().map((f) => basename(f)), ["audit.20260101T000000001Z.jsonl"]);
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("an anchor of a pruned segment counts as pruned by its place in the series, also in the millisecond of the rotation or before a clock step back", () => {
  for (const back of [0, 60_000]) {
    let t = Date.parse("2026-01-01T00:00:00.000Z");
    const { dir, log } = fresh(() => new Date(t).toISOString()), anchors = join(dir, "anchors.jsonl");
    const a = decision(log, "a"); decision(log, "b");
    anchor(log, anchors, new Date(t).toISOString());
    t -= back; log.rotate(); decision(log, "c");
    assert.equal(prune(log, 1, new Date("2026-02-01T00:00:00.000Z")).length, 1);
    assert.deepEqual(verifyAnchors(log, anchors), { ok: true, anchors: 1, pruned: 1 }, `clock back ${back} ms`);
    appendFileSync(anchors, JSON.stringify({ ts: "2025-12-31T00:00:00.000Z", count: 1, head: a.hash }) + "\n");
    assert.deepEqual(verifyAnchors(log, anchors), { ok: true, anchors: 2, pruned: 2 }, "an anchor without a segment keeps the time rule");
  }
});

test("a temporary segment file left by a crash before its rename is replaced, and the series continues", () => {
  const { log } = fresh();
  decision(log, 1); log.rotate();
  renameSync(log.path, log.path + ".segment");
  decision(log, 2);
  assert.ok(!existsSync(log.path + ".segment"));
  assert.equal(lines(log.path)[0].kind, "segment");
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("an empty current file next to closed segments is started again with a segment record", () => {
  const { log } = fresh();
  decision(log, 1); log.rotate();
  writeFileSync(log.path, "");
  decision(log, 2);
  assert.deepEqual(lines(log.path).map((r) => r.kind), ["segment", "decision"]);
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("an anchor still catches a replaced or shortened current file after rotations", () => {
  const { dir, log } = fresh(), anchors = join(dir, "anchors.jsonl");
  decision(log, 1); log.rotate(); decision(log, 2); decision(log, 3);
  anchor(log, anchors);
  assert.deepEqual(verifyAnchors(log, anchors), { ok: true, anchors: 1 });
  rewrite(log.path, lines(log.path).slice(0, 2));
  assert.match(verifyAnchors(log, anchors).reason!, /^truncated: anchor .* saw 3 records, log has 2$/);
});

test("records are read line by line, also when a line is longer than one read and a character spans two reads", () => {
  const { log } = fresh(), big = "ż" + "€".repeat(800_000);
  const r = decision(log, big); decision(log, "after");
  assert.ok(statSync(log.path).size > 2 * 1024 * 1024);
  const raw = readFileSync(log.path);
  assert.ok([1, 2].some((k) => (raw[k * 1024 * 1024] & 0xc0) === 0x80), "a read boundary falls inside a character");
  assert.deepEqual(log.read().map((x) => x.output), [big, "after"]);
  assert.equal(log.read()[0].hash, r.hash);
  assert.deepEqual(log.verifyChain(), { ok: true });
});

const major = Number(process.versions.node.split(".")[0]);
test("each segment stores the QDL programs its decisions use, and replay works on both sides of a rotation", { skip: major < 22 ? "Quinelings SDK needs Node >= 22" : false }, async () => {
  const { recordQdl, replayQdl } = await import("../src/qdl.js");
  const one = (unit: string) => ({ kind: "number", unit, min: 0 });
  const perPiece = { format: "qdl-intent", version: 1, name: "Unit price", thought: "unit price = total / pieces",
    inputs: [{ id: "total", name: "total", type: one("PLN") }, { id: "pieces", name: "pieces", type: one("one") }],
    steps: [{ id: "unit", op: "arithmetic", inputs: ["total", "pieces"], params: { kind: "div" } }], outputs: ["unit"] };
  const entry = { systemId: "quote", useCase: "price", input: "part" };
  const { log } = fresh(clockFrom("2026-10-01T00:00:00.000Z", 1000));
  const before = await recordQdl(log, entry, { intent: perPiece }, { total: 100, pieces: 4 });
  log.rotate();
  const after = await recordQdl(log, entry, { intent: perPiece }, { total: 90, pieces: 3 });
  assert.equal(log.readCurrent().filter((r) => r.kind === "program").length, 1);
  assert.equal(log.read().filter((r) => r.kind === "program").length, 2);
  assert.equal((await replayQdl(log, before.step.id)).reproduced, true);
  assert.equal((await replayQdl(log, after.step.id)).reproduced, true);
  assert.deepEqual(log.verifyChain(), { ok: true });
});

test("the proxy links a session across a rotation and a restart, from the newest closed segment", async () => {
  const up = await mockUpstream();
  const sys = { role: "system", content: "You are terse." }, u1 = { role: "user", content: "Price of part A?" }, a1 = { role: "assistant", content: "12 PLN" };
  const u2 = { role: "user", content: "And part B?" }, a2 = { role: "assistant", content: "15 PLN" }, u3 = { role: "user", content: "Total?" };
  const post = (url: string, messages: unknown[]) => fetch(url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", messages }) }).then((r) => r.text());
  const px = await startProxy(up.url, "redact");
  try {
    await post(px.url, [sys, u1]); await post(px.url, [sys, u1, a1, u2]);
    px.close();
    px.log.rotate();
    const again = createProxy({ upstreamOpenai: up.url, upstreamAnthropic: up.url, mode: "redact", log: px.log, quiet: true });
    await new Promise<void>((r) => again.listen(0, "127.0.0.1", r));
    await post(`http://127.0.0.1:${(again.address() as import("node:net").AddressInfo).port}`, [sys, u1, a1, u2, a2, u3]);
    again.close();
    const calls = px.log.read().filter((r) => r.kind === "llm-call") as any[];
    assert.deepEqual(calls.map((c) => c.session.turn), [1, 2, 3]);
    assert.equal(new Set(calls.map((c) => c.session.id)).size, 1);
    assert.deepEqual(px.log.verifyChain(), { ok: true });
  } finally { up.close(); }
});

test("CLI: rotate, verify over the series, prune arguments and a broken segment", () => {
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url)), { log } = fresh();
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args, "--log", log.path], { encoding: "utf8" });
  decision(log, 1); decision(log, 2);
  const rotated = run("rotate");
  assert.equal(rotated.status, 0); assert.equal(JSON.parse(rotated.stdout).count, 2);
  decision(log, 3);
  assert.deepEqual([run("verify").status, run("verify").stdout.trim()], [0, "OK: 4 records in 2 files, chain intact"]);
  assert.deepEqual([run("prune").status, run("prune").stderr.trim()], [2, "audit_invalid_keep_days"]);
  assert.deepEqual([run("prune", "--keep-days", "30").status, run("prune", "--keep-days", "30").stdout.trim()], [0, '{"pruned":[]}']);
  const [closed] = log.closedSegments(), records = lines(closed);
  records[0].output = 7; rewrite(closed, records);
  assert.deepEqual([run("verify").status, run("verify").stdout.trim()], [1, `BROKEN at ${basename(closed)} line 1: hash mismatch`]);
  assert.deepEqual([run("prune", "--keep-days", "1").status, run("prune", "--keep-days", "1").stderr.trim()], [1, "audit_chain_broken"]);
});
