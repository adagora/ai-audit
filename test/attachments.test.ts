import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockUpstream, startProxy, makePdf, AWS, AUTH, ATTACHMENT_TOOLS } from "./helpers.js";
import { work, cacheStats, SANDBOX, inspectAttachment } from "../src/attachments.js";
import { AuditLog, anchor, sha256, verifyAnchors } from "../src/audit.js";
import { scanText } from "../src/scan.js";
import { createInspectionProfile } from "../src/profile.js";

const up = await mockUpstream();
const red = await startProxy(up.url, "redact"), np = await startProxy(up.url, "redact", { pageRedaction: false }), ng = await startProxy(up.url, "no-go");
const ck = await startProxy(up.url, "redact", { keys: [{ name: "team", sha256: sha256("team-key-1") }], upstreamKeys: { openai: "sk-upstream-1", anthropic: "sk-ant-upstream-1" } });
after(() => { up.close(); [red, np, ng, ck].forEach((p) => p.close()); });
const fx = (f: string) => readFileSync(new URL(`../../test/fixtures/${f}`, import.meta.url)).toString("base64");
const KEY_PNG = fx("key.png"), CLEAN_PNG = fx("clean.png");
const PDF = makePdf(["Offer 2026/10 for flange", `ci token ${AWS} do not share`]).toString("base64");
const post = (base: string, path: string, body: object, auth = AUTH) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", authorization: auth }, body: JSON.stringify(body) });
const chat = (parts: unknown[]) => ({ model: "gpt-x", messages: [{ role: "user", content: parts }] });
const ocrText = async (mime: string, b64: string) => ((await work({ op: "extract", mime, b64, raster: true })).units as any[]).map((u) => u.text).join(" ");
const last = () => up.seen[up.seen.length - 1];
console.log("sandbox:", SANDBOX);

const pdfReq = { model: "gpt-x", input: [{ role: "user", content: [{ type: "input_file", filename: "offer.pdf", file_data: `data:application/pdf;base64,${PDF}` }] }] };
for (const [name, p, code] of [["--no-page-redaction", () => np, "audit_unredactable_finding"], ["no-go", () => ng, "audit_findings_blocked"]] as const)
  test(`PDF with a fake key, ${name} -> 409 and upstream never called`, ATTACHMENT_TOOLS, async () => {
    const n = up.seen.length;
    const r = await post(p().url, "/v1/responses", pdfReq);
    const j = await r.json(); assert.equal(r.status, 409); assert.equal(j.error.code, code); assert.ok(j.error.findings.includes("aws-access-token"));
    assert.equal(up.seen.length, n);
  });

test("PDF with a fake key, default redact: raster-rebuilt, re-inspected clean, key gone upstream, logged as rasterized", ATTACHMENT_TOOLS, async () => {
  const r = await post(red.url, "/v1/messages", { model: "c", max_tokens: 5, messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: PDF } }, { type: "text", text: "summarise" }] }] });
  assert.equal(r.status, 200); await r.text();
  const fwd = last().body.toString(), sent = JSON.parse(fwd).messages[0].content[0].source.data;
  assert.notEqual(sent, PDF); assert.ok(!fwd.includes(AWS) && !Buffer.from(sent, "base64").toString("latin1").includes(AWS));
  const txt = await ocrText("application/pdf", sent);
  assert.ok(!txt.includes("AKIA") && /Offer/.test(txt), txt);
  const again = await inspectAttachment({ mime: "application/pdf", b64: sent }, "x", { pageRedaction: true, id: "t-reinspect" });
  assert.equal(again.findings.length, 0); assert.ok(!again.failed);
  const d = (red.log.read().at(-1) as any).decision;
  assert.equal(d.action, "forward-redacted"); assert.deepEqual(d.rasterized, ["$.messages.0.content.0.source.data"]);
});

test("image (OpenAI image_url data URI) with OCR'd key -> boxes blacked out, rest kept", ATTACHMENT_TOOLS, async () => {
  const r = await post(red.url, "/v1/chat/completions", chat([{ type: "text", text: "what is this?" }, { type: "image_url", image_url: { url: `data:image/png;base64,${KEY_PNG}` } }]));
  assert.equal(r.status, 200); await r.text();
  const url: string = JSON.parse(last().body.toString()).messages[0].content[1].image_url.url;
  const txt = await ocrText("image/png", url.split(",")[1]);
  assert.ok(!txt.includes("AKIA") && /region/.test(txt), txt);
  assert.match((red.log.read().at(-1) as any).decision.findings[0].path, /image_url\.url#ocr/);
});

test("clean image forwarded byte-identical; identical bytes hit the cache (no second OCR)", ATTACHMENT_TOOLS, async () => {
  const body = { model: "c", max_tokens: 5, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: CLEAN_PNG } }] }] };
  const h0 = cacheStats.hits;
  const t1 = Date.now(); await (await post(red.url, "/v1/messages", body)).text(); const first = Date.now() - t1;
  assert.equal(last().body.toString(), JSON.stringify(body));
  const t2 = Date.now(); await (await post(red.url, "/v1/messages", body)).text(); const second = Date.now() - t2;
  assert.equal(cacheStats.hits, h0 + 1); console.log(`clean image: first ${first} ms, cached ${second} ms`);
});

test("uninspectable attachments fail closed with 422", ATTACHMENT_TOOLS, async () => {
  for (const [body, code] of [
    [chat([{ type: "image_url", image_url: { url: "data:image/png;base64,bm90IGFuIGltYWdl" } }]), "audit_inspection_failed"],
    [chat([{ type: "image_url", image_url: { url: "https://example.com/x.png" } }]), "audit_uninspectable_reference"],
    [chat([{ type: "file", file: { file_id: "file-abc" } }]), "audit_uninspectable_reference"],
    [chat([{ type: "file", file: { file_data: "data:application/zip;base64,UEsDBA==" } }]), "audit_unsupported_attachment"],
  ] as const) { const r = await post(red.url, "/v1/chat/completions", body); assert.equal(r.status, 422); assert.equal((await r.json()).error.code, code); }
});

test("secret split across ordered text parts is caught and removed from every part", async () => {
  const r = await post(red.url, "/v1/chat/completions", chat([{ type: "text", text: "key: AKIAIOSFOD" }, { type: "text", text: "NN7EXAMPLQ please" }]));
  assert.equal(r.status, 200); await r.text();
  const parts = JSON.parse(last().body.toString()).messages[0].content;
  assert.deepEqual(parts.map((p: any) => p.text), ["key: [REDACTED:aws-access-token]", " please"]);
});

test("wrapped JWT (newlines/indent) is reconstructed and redacted", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const wrapped = `token:\n  ${jwt.slice(0, 40)}\n  ${jwt.slice(40, 90)}\n  ${jwt.slice(90)}\nend`;
  const s = scanText(wrapped); assert.equal(s.length, 1); assert.equal(s[0].rule, "jwt"); assert.equal(s[0].value, jwt);
});

test("client key: wrong -> 401; right -> upstream gets the upstream key, never the client key", async () => {
  assert.equal((await post(ck.url, "/v1/chat/completions", chat(["hi"]), "Bearer wrong")).status, 401);
  await (await post(ck.url, "/v1/chat/completions", chat(["hi"]), "Bearer team-key-1")).text();
  assert.equal(last().headers.authorization, "Bearer sk-upstream-1");
  await (await fetch(ck.url + "/v1/messages", { method: "POST", headers: { "x-api-key": "team-key-1", "content-type": "application/json" }, body: JSON.stringify({ model: "c", max_tokens: 1, messages: [] }) })).text();
  assert.equal(last().headers["x-api-key"], "sk-ant-upstream-1"); assert.equal(last().headers.authorization, undefined);
  assert.ok(!readFileSync(ck.log.path, "utf8").includes("upstream-1"));
});

test("metrics: counts by decision/status + latency, no content", ATTACHMENT_TOOLS, async () => {
  const m = await (await fetch(red.url + "/metrics")).text();
  const sum = (re: RegExp) => m.split("\n").filter((l) => re.test(l)).reduce((a, l) => a + Number(l.split(" ").at(-1)), 0);
  assert.ok(sum(/^ai_audit_requests_total\{.*decision="forward-redacted"/) >= 2 && sum(/^ai_audit_requests_total\{.*decision="reject"/) >= 4);
  assert.ok(sum(/^ai_audit_requests_total\{.*status="422"/) >= 4 && sum(/^ai_audit_request_duration_seconds_sum /) > 0 && sum(/^ai_audit_attachment_cache_hits /) >= 1);
  assert.ok(!m.includes("AKIA"));
});

test("anchor: whole-file swap and truncation detected", () => {
  const dir = mkdtempSync(join(tmpdir(), "anc-")), log = new AuditLog(join(dir, "a.jsonl")), anc = join(dir, "anchors.jsonl");
  for (let i = 0; i < 3; i++) log.record({ systemId: "s", useCase: "u", input: `i${i}`, output: i });
  anchor(log, anc); log.record({ systemId: "s", useCase: "u", input: "i3", output: 3 }); anchor(log, anc);
  assert.deepEqual(verifyAnchors(log, anc), { ok: true, anchors: 2 });
  const orig = readFileSync(log.path);
  writeFileSync(log.path, ""); for (let i = 0; i < 4; i++) log.record({ systemId: "s", useCase: "u", input: `i${i}`, output: i === 1 ? 999 : i });
  assert.equal(log.verifyChain().ok, true);
  assert.match(verifyAnchors(log, anc).reason!, /^swapped/);
  writeFileSync(log.path, orig.toString().split("\n").slice(0, 2).join("\n") + "\n");
  assert.match(verifyAnchors(log, anc).reason!, /^truncated/);
  writeFileSync(log.path, orig); appendFileSync(log.path, ""); assert.equal(verifyAnchors(log, anc).ok, true);
});

test("attachment cache reuses only the same content-addressed inspection policy", ATTACHMENT_TOOLS, async () => {
  const carnet = new Set([sha256("synthetic-cache-profile-one")]);
  const profile = createInspectionProfile({ mode: "redact", carnet });
  const a = { mime: "image/png", b64: CLEAN_PNG };
  const misses = cacheStats.misses, hits = cacheStats.hits;
  assert.ok(!(await inspectAttachment(a, "profile-test", profile)).failed);
  assert.equal(cacheStats.misses, misses + 1);
  await inspectAttachment(a, "profile-test", createInspectionProfile({ mode: "redact", carnet: new Set([...carnet].reverse()) }));
  assert.equal(cacheStats.hits, hits + 1);
  carnet.add(sha256("synthetic-cache-profile-two"));
  await inspectAttachment(a, "profile-test", createInspectionProfile({ mode: "redact", carnet }));
  assert.equal(cacheStats.misses, misses + 2);
  await inspectAttachment(a, "profile-test", createInspectionProfile({ mode: "no-go", carnet }));
  assert.equal(cacheStats.misses, misses + 3);
});

test("a PDF containing an AWS secret-access assignment is sanitized by the shared scanner", ATTACHMENT_TOOLS, async () => {
  const secret = "B".repeat(40);
  const pdf = makePdf(["AWS_SECRET_ACCESS_KEY=", secret]).toString("base64");
  const r = await post(red.url, "/v1/messages", { model: "c", max_tokens: 5, messages: [{ role: "user", content: [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
  ] }] });
  assert.equal(r.status, 200); await r.text();
  const sent = JSON.parse(last().body.toString()).messages[0].content[0].source.data;
  assert.notEqual(sent, pdf);
  assert.ok(!(await ocrText("application/pdf", sent)).includes(secret));
  assert.ok((red.log.read().at(-1)!.decision as any).findings.some((f: any) => f.rule === "aws-secret-access-key"));
});
