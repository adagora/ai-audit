import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, anchor, verifyAnchors } from "../src/audit.js";
import { BEND_NAT_MAX, composeContext, KIND_CODES, scaleToProvider, SEGMENTS, type ArenaBlock, type ContextBlock } from "../src/context.js";
import type { Api } from "../src/extract.js";
import { decide, inspect, redactText, scanText, type Mode } from "../src/scan.js";
import { SessionIndex, type SessionLink } from "../src/session.js";
import { gen, mockUpstream, pesel, startProxy, type Gen } from "./helpers.js";

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", LOWER = "abcdefghijklmnopqrstuvwxyz", DIGITS = "0123456789", ALNUM = UPPER + LOWER + DIGITS, NOISE = LOWER + "żółć";
interface Planted { rule: string; text: string; core: string; inKey?: boolean }
const planted = (rule: string, text: string, core = text): Planted => ({ rule, text, core });
const iban = (bban: string) => { let m = 0; for (const ch of bban + "252100") m = (m * 10 + Number(ch)) % 97; return "PL" + String(98 - m).padStart(2, "0") + bban; };
const SECRETS: ((g: Gen) => Planted)[] = [
  (g) => { const c = g.chars(16, UPPER + "234567"); return planted("aws-access-token", "AKIA" + c, c); },
  (g) => { const c = g.chars(40, ALNUM + "/+"); return planted("aws-secret-access-key", `aws_secret_access_key=${c}`, c); },
  (g) => { const c = g.chars(12, ALNUM); return planted("database-credentials", `postgres://app:${c}@db.example.invalid:5432/app`, c); },
  (g) => { const c = g.chars(14, ALNUM); return planted("database-password", `PGPASSWORD=${c}`, c); },
  (g) => { const c = g.chars(16, ALNUM); return planted("credential-client-secret", `client_secret=${c}`, c); },
  (g) => { const c = g.chars(36, ALNUM); return planted("github-pat", "ghp_" + c, c); },
  (g) => { const c = g.chars(20, ALNUM) + "T3BlbkFJ" + g.chars(20, ALNUM); return planted("openai-api-key", "sk-" + c, c); },
  (g) => { const c = g.chars(93, ALNUM + "_-"); return planted("anthropic-api-key", "sk-ant-api03-" + c + "AA", c); },
  (g) => { const c = g.chars(35, ALNUM + "_-"); return planted("gcp-api-key", "AIza" + c, c); },
  (g) => { const c = g.chars(24, ALNUM); return planted("stripe-access-token", "sk_" + "test_" + c, c); },
  (g) => planted("jwt", `eyJ${g.chars(20, ALNUM)}.eyJ${g.chars(20, ALNUM)}.${g.chars(20, ALNUM)}`),
  (g) => planted("slack-bot-token", `xoxb-${g.chars(11, DIGITS)}-${g.chars(12, DIGITS)}-${g.chars(24, ALNUM)}`),
  (g) => { const c = g.chars(96, ALNUM + "+/"); return planted("private-key", `-----BEGIN PRIVATE KEY-----\n${c}\n-----END PRIVATE KEY-----`, c); },
  (g) => planted("pii-email", `${g.chars(10, LOWER)}@${g.chars(8, LOWER)}.pl`),
  (g) => planted("pii-pesel", pesel(g.chars(10, DIGITS))),
  (g) => planted("pii-iban", iban(g.chars(24, DIGITS))),
  (g) => { const raw = iban(g.chars(24, DIGITS)), written = g.int(2) ? raw : raw.replace(/(.{4})/g, "$1 ").trim(); return planted("pii-iban", `${written} ${g.pick(["PLN", "EUR", "BIC WBKPPLPP", "2026"])}`, written); },
  (g) => planted("pii-phone", `+48 ${g.chars(3, DIGITS)} ${g.chars(3, DIGITS)} ${g.chars(3, DIGITS)}`),
  (g) => { const c = g.chars(40, ALNUM + "/+"); return planted("aws-access-token", `AKIA${g.chars(16, UPPER + "234567")}${g.pick([" : ", ":", " ", "/", ","])}${c}`, c); },
  (g) => { const c = encodeURIComponent(g.chars(40, ALNUM + "/+")); return planted("aws-secret-access-key", `s3://backup/x?secret-access-key=${c}`, c); },
  (g) => { const c = encodeURIComponent(g.chars(60, ALNUM + "/+") + "=="); return planted("presigned-url-credential", `https://b.s3.amazonaws.com/k?X-Amz-Expires=600&X-Amz-Security-Token=${c}&X-Amz-Signature=${g.chars(64, "0123456789abcdef")}`, c); },
  (g) => { const c = g.chars(14, ALNUM); return planted("database-credentials", `root:${c}@tcp(db.example.invalid:4000)`, c); },
  (g) => { const c = g.chars(14, ALNUM); return planted("database-password", `${g.pick(["PROD_", "APP_", ""])}DB_PASSWORD=${c}`, c); },
  (g) => { const c = g.chars(16, ALNUM); return planted("credential-client-secret", `AZURE_CLIENT_SECRET=${c}`, c); },
  (g) => { const c = g.chars(34, ALNUM + "_~.-"); return planted("azure-ad-client-secret", `${g.chars(3, ALNUM)}${g.chars(1, DIGITS)}Q~${c}`, c); },
  (g) => { const [prefix, rule] = g.pick([["ghu_", "github-app-token"], ["ghs_", "github-app-token"], ["gho_", "github-oauth"], ["ghr_", "github-refresh-token"]] as const), c = g.chars(36, ALNUM); return planted(rule, prefix + c, c); },
  (g) => { const c = g.chars(64, "0123456789abcdef"); return planted("openrouter-api-key", "sk-or-v1-" + c, c); },
  (g) => { const c = g.chars(80, ALNUM); return planted("xai-api-key", "xai-" + c, c); },
  (g) => { const c = g.chars(14, ALNUM) + g.chars(2, DIGITS); return planted("named-credential", `${g.pick(["TIDB_CLOUD_PRIVATE_KEY", "ELEVENLABS_API_KEY", "SERVER_SALT_SECRET", "NPM_TOKEN", "X-Api-Key"])}${g.pick(["=", ": "])}${c}`, c); },
  (g) => { const c = g.chars(12, ALNUM); return planted("named-credential", `UPDATE users SET password = '${c}' WHERE id = 7`, c); },
];
const SECRET_FIELDS = ["password", "apiKey", "salt_secret", "access_token", "webhookSecret"];
const SEPARATORS = [" ", "\n", "\t", '"', "'", ";"];
const PUNCTUATION = [".", ",", ")", ":", "!", "?", "]", "}", ">", "*", "|"];
const KEYS = ["note", "body", "args", "items", "meta", "query"];

const leaks = (text: string, ps: Planted[]) => ps.filter((p) => Array.from({ length: p.core.length - 7 }, (_, i) => p.core.slice(i, i + 8)).some((w) => text.includes(w))).map((p) => `${p.rule}: ${p.text}`);
function sentence(g: Gen, ps: Planted[], density: number) {
  let out = "";
  for (let i = 1 + g.int(6); i > 0; i--) {
    const p = g.int(100) < density ? g.pick(SECRETS)(g) : undefined;
    if (p) ps.push(p);
    out += (out ? g.pick(SEPARATORS) : "") + (p ? p.text : g.chars(3 + g.int(6), NOISE));
  }
  return out;
}
function object(g: Gen, ps: Planted[], density: number, depth: number) {
  const o: Record<string, unknown> = {};
  for (let i = 1 + g.int(3); i > 0; i--) {
    const p = g.int(100) < density / 6 ? { ...g.pick(SECRETS)(g), inKey: true } : undefined;
    if (p) ps.push(p);
    if (!p && g.int(100) < density / 6) { const c = g.chars(14, ALNUM); ps.push(planted("named-credential", c)); o[g.pick(SECRET_FIELDS)] = c; continue; }
    o[p ? p.text : g.pick(KEYS) + i] = value(g, ps, density, depth + 1);
  }
  return o;
}
function value(g: Gen, ps: Planted[], density: number, depth: number): unknown {
  const kind = depth > 2 ? 0 : g.int(5);
  if (kind < 2) return sentence(g, ps, density);
  if (kind === 3) return JSON.stringify(object(g, ps, density, depth));
  if (kind === 4) return object(g, ps, density, depth);
  const t = sentence(g, ps, density), cuts = [0, ...Array.from({ length: 1 + g.int(3) }, () => g.int(t.length + 1)).sort((a, b) => a - b), t.length];
  return cuts.slice(1).map((c, i) => t.slice(cuts[i], c)).map((x) => (g.int(2) ? x : { type: "text", text: x }));
}
const API_BY_PATH: Record<string, Api> = { "/v1/chat/completions": "openai-chat", "/v1/messages": "anthropic-messages", "/v1/responses": "openai-responses" };
const QUINELING_TOOLS = ["quineling_v1_compile", "quineling_v1_run", "mcp__quinelings__quineling_inspect"];
function request(g: Gen, ps: Planted[], density: number, attachments = false): [string, object] {
  const s = () => sentence(g, ps, density), args = () => object(g, ps, density, 2), tool = g.int(3) ? "lookup" : g.pick(QUINELING_TOOLS);
  const result = () => (tool !== "lookup" && g.int(2) ? JSON.stringify({ result: { result: { format: "qdl-run", sourceHash: "ql_" + g.chars(64, "0123456789abcdef"), status: "completed" } }, note: s() }) : s());
  const image = () => (attachments && g.int(2) ? [{ type: "image_url", image_url: { url: "data:image/png;base64," + g.chars(8, ALNUM) } }] : []);
  switch (g.int(3)) {
    case 0: return ["/v1/chat/completions", { model: "m", tools: [{ type: "function", function: { name: tool, description: s(), parameters: {} } }], messages: [{ role: "system", content: s() }, { role: "user", content: [{ type: "text", text: s() }, ...image()] },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: tool, arguments: JSON.stringify(args()) } }] }, { role: "tool", tool_call_id: "c1", content: result() }] }];
    case 1: return ["/v1/messages", { model: "c", max_tokens: 5, system: s(), tools: [{ name: tool, description: s(), input_schema: {} }], messages: [{ role: "user", content: [{ type: "text", text: s() }] },
      { role: "assistant", content: [{ type: "tool_use", id: "u1", name: tool, input: args() }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: result() }] }] }];
    default: return ["/v1/responses", { model: "m", instructions: s(), tools: [{ type: "function", name: tool, description: s(), parameters: {} }], input: [{ role: "user", content: [{ type: "input_text", text: s() }] },
      { type: "function_call", call_id: "c1", name: tool, arguments: JSON.stringify(args()) }, { type: "function_call_output", call_id: "c1", output: result() }] }];
  }
}

test("law: every generated secret is found and fully masked when it stands alone", () => {
  const g = gen(1);
  for (const make of SECRETS) for (let i = 0; i < 50; i++) {
    const p = make(g), spans = scanText(p.text);
    assert.ok(spans.some((s) => s.rule === p.rule), p.text);
    assert.deepEqual(leaks(redactText(p.text, spans), [p]), []);
  }
});

test("law: in redact mode a request is blocked or every planted secret is gone, also when split across text parts; masking is a fixpoint; clean input is untouched (ADR 0009)", () => {
  const g = gen(2);
  for (let i = 0; i < 3000; i++) {
    const ps: Planted[] = [], input = value(g, ps, i % 4 ? 25 : 0, 0), r = inspect(input), d = decide("redact", r.findings);
    assert.equal(d.action === "block", ps.some((p) => p.inKey), JSON.stringify(input));
    if (!ps.length) { assert.deepEqual(r, { value: input, findings: [] }); continue; }
    if (d.action === "block") continue;
    assert.deepEqual(leaks(JSON.stringify(r.value), ps), [], JSON.stringify(input));
    assert.deepEqual(inspect(r.value), { value: r.value, findings: [] }, JSON.stringify(input));
  }
});

test("law: a key the scanner finds alone is still found when prose punctuation follows it", () => {
  const g = gen(3), missed = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const p = g.pick(SECRETS)(g), text = `see ${p.text}${g.pick(PUNCTUATION)} next`;
    if (leaks(redactText(text, scanText(text)), [p]).length) missed.add(p.rule);
  }
  assert.deepEqual([...missed].sort(), []);
});

async function throughProxy(modes: Mode[], seed: number, check: (mode: Mode, ps: Planted[], body: object, sent: string | undefined, record: object, added: number) => void) {
  const up = await mockUpstream(), px = Object.fromEntries(await Promise.all(modes.map(async (m) => [m, await startProxy(up.url, m)] as const)));
  try {
    const g = gen(seed);
    for (let i = 0; i < 30 * modes.length; i++) {
      const ps: Planted[] = [], [path, body] = request(g, ps, 20), mode = modes[i % modes.length], seen = up.seen.length, records = px[mode].log.read().length;
      await (await fetch(px[mode].url + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).text();
      const logged = px[mode].log.read();
      check(mode, ps, body, up.seen.length > seen ? up.seen[seen].body.toString() : undefined, logged.at(-1)!, logged.length - records);
    }
  } finally { up.close(); modes.forEach((m) => px[m].close()); }
}

test("law: through the proxy no planted secret reaches the log in any mode, no-go never forwards a request with a finding, advisory forwards the original bytes, one record per request, also with Quinelings traffic (ADR 0007, 0009, 0024)", async () => {
  let blocked = 0, observed = 0;
  await throughProxy(["redact", "no-go", "advisory"], 4, (mode, ps, body, sent, record, added) => {
    assert.equal(added, 1);
    assert.deepEqual(leaks(JSON.stringify(record), ps), [], mode);
    if ("quinelings" in record) observed++;
    if (mode === "no-go") { assert.equal(sent === undefined, ps.length > 0); if (ps.length) blocked++; }
    if (mode === "advisory") assert.equal(sent, JSON.stringify(body));
  });
  assert.ok(blocked >= 10, `only ${blocked} blocked requests`);
  assert.ok(observed >= 10, `only ${observed} records with Quinelings events`);
});

test("law: through the proxy in redact mode no planted secret reaches upstream (ADR 0009)", async () => {
  let redacted = 0;
  await throughProxy(["redact"], 10, (_mode, ps, _body, sent) => {
    if (sent === undefined) return;
    assert.deepEqual(leaks(sent, ps), []);
    if (ps.length) redacted++;
  });
  assert.ok(redacted >= 10, `only ${redacted} redacted forwards`);
});

const TAMPERS = ["edit", "delete", "reorder", "duplicate", "truncate", "swap-file"] as const;
const build = (path: string, g: Gen, n: number) => { const log = new AuditLog(path); for (let k = 0; k < n; k++) log.record({ systemId: "s", useCase: "u", input: g.chars(12, NOISE), output: g.chars(12, NOISE) }); return log; };
const lines = (path: string) => readFileSync(path, "utf8").trimEnd().split("\n");
function editLeaf(g: Gen, line: string) {
  const rec = JSON.parse(line), leaves: [any, string][] = [];
  const walk = (o: any) => Object.keys(o).forEach((k) => (typeof o[k] === "string" ? leaves.push([o, k]) : o[k] && typeof o[k] === "object" && walk(o[k])));
  walk(rec);
  const [o, k] = g.pick(leaves), at = g.int(o[k].length || 1), ch = g.pick([...ALNUM].filter((c) => c !== o[k][at]));
  o[k] = o[k].slice(0, at) + ch + o[k].slice(at + 1);
  return JSON.stringify(rec);
}

test("law: any edit, deletion, reorder, duplicate or truncation of the log, or a swapped file, fails verification (ADR 0002)", () => {
  const g = gen(5), dir = mkdtempSync(join(tmpdir(), "laws-"));
  for (let i = 0; i < 300; i++) {
    const n = 2 + g.int(6), log = build(join(dir, `log-${i}.jsonl`), g, n), anchors = join(dir, `anchors-${i}.jsonl`), kind = TAMPERS[i % TAMPERS.length], ls = lines(log.path);
    anchor(log, anchors);
    assert.deepEqual(verifyAnchors(log, anchors), { ok: true, anchors: 1 });
    const at = g.int(n - 1), other = (at + 1 + g.int(n - 1)) % n, out = [...ls];
    if (kind === "edit") out[g.int(n)] = editLeaf(g, ls[g.int(n)]);
    if (kind === "delete") out.splice(at, 1);
    if (kind === "reorder") [out[at], out[other]] = [ls[other], ls[at]];
    if (kind === "duplicate") out.splice(at + 1, 0, ls[at]);
    if (kind === "truncate") out.splice(g.int(n));
    if (kind === "swap-file") out.splice(0, n, ...lines(build(join(dir, `fake-${i}.jsonl`), g, n).path));
    writeFileSync(log.path, out.map((l) => l + "\n").join(""));
    assert.equal(verifyAnchors(log, anchors).ok, false, kind);
    if (kind !== "truncate" && kind !== "swap-file") assert.equal(log.verifyChain().ok, false, kind);
  }
});

test("law: provider tokens split across segments add up exactly, each segment gets its share rounded down or up, and empty segments get none (ADR 0017)", () => {
  const text = SEGMENTS.filter((s) => s !== "other" && s !== "attachments"), g = gen(6);
  const broken = (provider: number, sizes: number[]) => {
    const bytes = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<(typeof SEGMENTS)[number], number>, total = sizes.reduce((a, b) => a + b, 0);
    text.forEach((s, i) => (bytes[s] = sizes[i])); bytes.other = 5;
    if (!total) return undefined;
    const t = scaleToProvider({ bytes, totalBytes: total + 5, tokenBasis: "unknown" }, provider).tokens!;
    if (SEGMENTS.reduce((a, s) => a + t[s], 0) !== provider || t.other !== 0) return "sum";
    return text.find((s, i) => { const rest = (provider * sizes[i]) % total, low = (provider * sizes[i] - rest) / total; return (sizes[i] === 0 && t[s] !== 0) || (t[s] !== low && (t[s] !== low + 1 || rest === 0)); });
  };
  const sizes = [0, 0, 0, 0, 0];
  for (let provider = 0; provider <= 12; provider++) for (let k = 0; k < 5 ** 5; k++) {
    sizes.forEach((_, i) => (sizes[i] = Math.floor(k / 5 ** i) % 5));
    assert.equal(broken(provider, sizes), undefined, JSON.stringify({ provider, sizes }));
  }
  for (let i = 0; i < 50_000; i++) {
    const provider = g.int(2_000_001), random = sizes.map(() => (g.int(3) ? g.int(33_554_433) : 0));
    assert.equal(broken(provider, random), undefined, JSON.stringify({ provider, random }));
  }
});

test("law: leftover provider tokens go to the largest exact remainders, ties to the earlier segment (proved in bend/PROOF.bend; checked here on the generated JavaScript)", () => {
  const text = SEGMENTS.filter((s) => s !== "other" && s !== "attachments"), g = gen(17);
  const expected = (provider: number, sizes: number[]) => {
    const total = sizes.reduce((a, b) => a + b, 0), rest = sizes.map((b) => (provider * b) % total), base = sizes.map((b, i) => (provider * b - rest[i]) / total);
    let left = provider - base.reduce((a, b) => a + b, 0);
    for (const i of sizes.map((_, i) => i).sort((i, j) => rest[j] - rest[i] || i - j)) if (left-- > 0) base[i]++;
    return base;
  };
  const check = (provider: number, sizes: number[]) => {
    if (!sizes.some((b) => b)) return;
    const bytes = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<(typeof SEGMENTS)[number], number>;
    text.forEach((s, i) => (bytes[s] = sizes[i])); bytes.other = 5;
    const scaled = scaleToProvider({ bytes, totalBytes: 0, tokenBasis: "unknown" }, provider);
    if (provider * sizes.reduce((a, b) => a + b, 0) > BEND_NAT_MAX) return assert.equal(scaled.tokens, undefined);
    assert.deepEqual(text.map((s) => scaled.tokens![s]), expected(provider, sizes), JSON.stringify({ provider, sizes }));
  };
  for (let provider = 0; provider <= 12; provider++) for (let k = 0; k < 5 ** 5; k++) check(provider, text.map((_, i) => Math.floor(k / 5 ** i) % 5));
  for (let i = 0; i < 20_000; i++) check(g.int(2_000_001), text.map(() => (g.int(3) ? g.int(33_554_433) : 0)));
});

test("law: context composition never attributes more bytes than the request has, for every API (ADR 0017)", () => {
  const g = gen(7);
  for (let i = 0; i < 1000; i++) {
    const [path, body] = request(g, [], 10, true), raw = Buffer.byteLength(JSON.stringify(body)), c = composeContext(API_BY_PATH[path], body, raw);
    assert.equal(c.totalBytes, raw, JSON.stringify(body));
    assert.ok(SEGMENTS.every((s) => c.bytes[s] >= 0));
  }
});

test("law: a request that extends a remembered one is its next turn, a retry is the same turn, an edit branches from the longest remembered prefix (ADR 0018)", () => {
  const g = gen(8);
  for (let i = 0; i < 300; i++) {
    const idx = new SessionIndex(Buffer.alloc(32, i % 256)), remembered: { count: number; link: SessionLink }[] = [];
    const items = Array.from({ length: 2 + g.int(10) }, () => ({ role: g.pick(["user", "assistant", "tool"]), content: g.chars(1 + g.int(6), NOISE) }));
    for (let count = 1 + g.int(2); ; count = Math.min(items.length, count + 1 + g.int(3))) {
      const link = idx.link(items.slice(0, count))!, previous = remembered.at(-1)?.link;
      assert.equal(link.turn, remembered.length + 1);
      assert.equal(link.parent, previous?.digest ?? null);
      assert.equal(link.id, previous?.id ?? link.digest.slice(0, 16));
      idx.remember(link); remembered.push({ count, link });
      assert.deepEqual(idx.link(items.slice(0, count)), link);
      if (count === items.length) break;
    }
    const at = g.int(items.length), edited = items.slice(0, at + 1 + g.int(items.length - at)).map((x, k) => (k === at ? { ...x, content: x.content + "!" } : x));
    const base = remembered.filter((r) => r.count <= at && r.count < edited.length).at(-1)?.link, link = idx.link(edited)!;
    assert.equal(link.parent, base?.digest ?? null);
    assert.equal(link.turn, (base?.turn ?? 0) + 1);
  }
});

const blocksOf = (g: Gen, n: number): ContextBlock[] => Array.from({ length: n }, () => { const value = g.chars(1 + g.int(5), NOISE); return { kind: g.pick(SEGMENTS), bytes: Buffer.byteLength(value), value }; });
function edited(g: Gen, xs: ContextBlock[]): ContextBlock[] {
  const at = g.int(xs.length), out = [...xs];
  switch (g.int(6)) {
    case 0: { const value = String(xs[at].value) + "x"; out[at] = { ...xs[at], value, bytes: Buffer.byteLength(value) }; return out; }
    case 1: out.splice(at, 0, ...blocksOf(g, 1)); return out;
    case 2: return xs.length > 1 ? (out.splice(at, 1), out) : blocksOf(g, 1);
    case 3: return [...xs, ...blocksOf(g, 1 + g.int(3))];
    case 4: return xs.slice(0, at + 1);
    default: return out;
  }
}
const perByte = (blocks: ArenaBlock[]) => blocks.flatMap(([code, bytes, age]) => Array<string>(bytes).fill(`${code}${age}`));

test("law: the arena keeps every byte with its kind and age; blocks before the first difference keep their age, the rest are new this turn (ADR 0020)", () => {
  const g = gen(9);
  for (let i = 0; i < 500; i++) {
    const idx = new SessionIndex(Buffer.alloc(32, 7));
    let previous: ContextBlock[] | undefined, ages: number[] = [];
    for (let turn = 1; turn <= 4; turn++) {
      const blocks = previous ? edited(g, previous) : blocksOf(g, 1 + g.int(8)), before = previous;
      const a = idx.arena({ id: "s", turn, digest: `d${turn}`, parent: turn > 1 ? `d${turn - 1}` : null, messages: blocks.length }, blocks);
      const differs = before ? blocks.findIndex((b, k) => !(before[k] && before[k].kind === b.kind && before[k].value === b.value)) : -1;
      const first = before && differs === -1 && blocks.length < before.length ? blocks.length : differs;
      ages = blocks.map((_, k) => (before && (first === -1 || k < first) ? ages[k] : turn));
      const offset = blocks.slice(0, first).reduce((s, b) => s + b.bytes, 0);
      assert.deepEqual(a.firstChanged, !before || first === -1 || first >= before.length ? null : { block: first, offset });
      assert.deepEqual(perByte(a.blocks), blocks.flatMap((b, k) => Array<string>(b.bytes).fill(`${KIND_CODES[b.kind]}${ages[k]}`)));
      previous = blocks;
    }
  }
});
