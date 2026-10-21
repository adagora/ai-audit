import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conversationItems, loadOrCreateSessionKey, SessionIndex } from "../src/session.js";
import { mockUpstream, startProxy } from "./helpers.js";

const KEY = Buffer.alloc(32, 7);
const sys = { role: "system", content: "You are terse." };
const u1 = { role: "user", content: "Price of part A?" }, a1 = { role: "assistant", content: "12 PLN" };
const u2 = { role: "user", content: "And part B?" }, a2 = { role: "assistant", content: "15 PLN" }, u3 = { role: "user", content: "Total?" };
const step = (idx: SessionIndex, items: unknown[]) => { const l = idx.link(items)!; idx.remember(l); return l; };

test("linear conversation: each request extends the previous one", () => {
  const idx = new SessionIndex(KEY);
  const t1 = step(idx, [sys, u1]), t2 = step(idx, [sys, u1, a1, u2]), t3 = step(idx, [sys, u1, a1, u2, a2, u3]);
  assert.deepEqual([t1.turn, t2.turn, t3.turn], [1, 2, 3]);
  assert.equal(t2.id, t1.id); assert.equal(t3.id, t1.id);
  assert.equal(t1.parent, null); assert.equal(t2.parent, t1.digest); assert.equal(t3.parent, t2.digest);
});

test("retry of the same request keeps turn and parent", () => {
  const idx = new SessionIndex(KEY);
  const t1 = step(idx, [sys, u1]), t2 = step(idx, [sys, u1, a1, u2]), again = step(idx, [sys, u1, a1, u2]);
  assert.deepEqual([again.id, again.turn, again.parent, again.digest], [t1.id, 2, t1.digest, t2.digest]);
});

test("edited history branches from the last shared turn", () => {
  const idx = new SessionIndex(KEY);
  const t1 = step(idx, [sys, u1]), t2 = step(idx, [sys, u1, a1, u2]);
  step(idx, [sys, u1, a1, u2, a2, u3]);
  const edited = step(idx, [sys, u1, a1, { role: "user", content: "And part C?" }]);
  assert.equal(edited.id, t1.id); assert.equal(edited.turn, 2); assert.equal(edited.parent, t1.digest); assert.notEqual(edited.digest, t2.digest);
  const regenerated = step(idx, [sys, u1, a1, u2, { role: "assistant", content: "16 PLN" }, u3]);
  assert.equal(regenerated.turn, 3); assert.equal(regenerated.parent, t2.digest);
});

test("unrelated, edited-first-message and different-system conversations start new sessions", () => {
  const idx = new SessionIndex(KEY);
  const t1 = step(idx, [sys, u1]);
  assert.notEqual(step(idx, [sys, { role: "user", content: "Something else" }]).id, t1.id);
  assert.notEqual(step(idx, [{ role: "system", content: "Other" }, u1]).id, t1.id);
});

test("digests are keyed: another key gives unrelated digests; key order in a message does not matter", () => {
  const a = new SessionIndex(KEY).prefixDigests([sys, u1]), b = new SessionIndex(Buffer.alloc(32, 8)).prefixDigests([sys, u1]);
  assert.notEqual(a[1], b[1]);
  assert.deepEqual(new SessionIndex(KEY).prefixDigests([{ content: "You are terse.", role: "system" }]), [a[0]]);
});

test("conversation items: Anthropic system and Responses instructions count as the first item; previous_response_id is not linkable", () => {
  assert.equal(conversationItems("anthropic-messages", { system: "s", messages: [u1] })!.length, 2);
  assert.equal(conversationItems("openai-responses", { instructions: "i", input: "hi" })!.length, 2);
  assert.equal(conversationItems("openai-responses", { previous_response_id: "r", input: "hi" }), undefined);
});

test("session key file is created once with mode 0600", () => {
  const p = join(mkdtempSync(join(tmpdir(), "skey-")), "k");
  const k1 = loadOrCreateSessionKey(p), k2 = loadOrCreateSessionKey(p);
  assert.ok(k1.equals(k2)); assert.equal(statSync(p).mode & 0o777, 0o600);
});

test("proxy links turns in the log with hashes only and survives a restart", async () => {
  const up = await mockUpstream();
  const post = (url: string, messages: unknown[]) => fetch(url + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "m", messages }) }).then((r) => r.text());
  const px = await startProxy(up.url, "redact");
  try {
    await post(px.url, [sys, u1]); await post(px.url, [sys, u1, a1, u2]);
    px.close();
    const { createProxy } = await import("../src/proxy.js");
    const again = createProxy({ upstreamOpenai: up.url, upstreamAnthropic: up.url, mode: "redact", log: px.log, quiet: true });
    await new Promise<void>((r) => again.listen(0, "127.0.0.1", r));
    await post(`http://127.0.0.1:${(again.address() as import("node:net").AddressInfo).port}`, [sys, u1, a1, u2, a2, u3]);
    again.close();
    const text = readFileSync(px.log.path, "utf8"), recs = text.trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(recs.map((r) => r.session.turn), [1, 2, 3]);
    assert.equal(new Set(recs.map((r) => r.session.id)).size, 1);
    assert.ok(!text.includes("part A") && !text.includes("terse"));
  } finally { up.close(); }
});
