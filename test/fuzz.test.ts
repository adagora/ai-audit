import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog, redact } from "../src/audit.js";
import { discover } from "../src/attachments.js";
import { extract, type Api } from "../src/extract.js";
import { quinelingCalls, quinelingResults } from "../src/quinelings.js";
import { decide, hasDuplicateKeys, inspect, nestedDeeperThan, scanText } from "../src/scan.js";
import { gen, pesel, type Gen } from "./helpers.js";

const SCALE = Math.max(Number(process.env.FUZZ_SCALE ?? 1), 1), SEED = Number(process.env.FUZZ_SEED ?? 0);
const runs = (n: number) => Math.ceil(n * SCALE), seeded = (k: number) => gen(SEED * 7919 + k);
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", LOWER = "abcdefghijklmnopqrstuvwxyz", DIGITS = "0123456789";
const APIS = ["openai-chat", "openai-responses", "anthropic-messages"] as const;

const PUMP_CHARS = "aAeyQ0179._-:@/+=%~ \t\n\"'(),;&?#$[]{}<>\\|`!*";
const PUMP_ENDS = ["", " @", "@tcp(", "=", ":", "\n", "\n12345678", '"', "@a", "KEY-----", "Q~", "password", "ey", "AKIA", "postgres://", "client_secret="];
const PUMP_TOKENS = ["12345678901", "PL61109010140000071219812875", "mysql://a", "postgres://", "a@b.pl", "AKIA" + "IOSFODNN7EXAMPLQ", "password=", "eyJhbGciOiJIUzI1NiJ9"];
const STALLED = [["", "a", " @"], ["", "%", " @"], ["", "ey", "\n12345678"], ["", "ye", "\n"], ["", "a.", "\n"], ["", "-a", "\n"], ["", "7:", "@tcp("], ["password", "1", ""],
  ["", "12345678901,", ""], ["", "mysql://a,", ""], ["", "a@b.pl ", ""], ["mysql://h#?", "&/", ""]];
const timed = (run: () => unknown) => { const c0 = process.cpuUsage(); run(); const c = process.cpuUsage(c0); return (c.user + c.system) / 1000; };
const fastest = (run: () => unknown) => Math.min(timed(run), timed(run), timed(run));
const scanners = (text: string) => {
  const half = text.length >> 1;
  return [["scanText", () => scanText(text)], ["inspect", () => inspect(text)], ["inspect parts", () => inspect([text.slice(0, half), { type: "text", text: text.slice(half) }])],
    ["audit redact", () => redact(text)]] as const;
};
test("fuzz: scanning time grows linearly with input size and stays under half the inspection deadline per MiB (ADR 0050)", () => {
  const g = seeded(1), slowMs = 40, mibBudgetMs = 2500, growth = 10;
  const pump = () => (g.int(2) ? g.chars(1 + g.int(3), PUMP_CHARS) : g.pick(PUMP_TOKENS) + g.chars(g.int(3), PUMP_CHARS));
  const cases = [...STALLED, ...Array.from({ length: runs(40) }, () => [g.pick(PUMP_ENDS), pump(), g.pick(PUMP_ENDS)])];
  for (const [pre, pump, suf] of cases) {
    const pumped = (size: number) => pre + pump.repeat(Math.ceil(size / pump.length)) + suf;
    scanners(pumped(64 * 1024)).forEach(([name, run], k) => {
      if (timed(run) < slowMs) return;
      const ms = fastest(run), fourTimes = fastest(scanners(pumped(256 * 1024))[k][1]);
      assert.ok(fourTimes < growth * ms && fourTimes * 4 < mibBudgetMs, `${name}: ${ms.toFixed(0)} ms for 64 KiB, ${fourTimes.toFixed(0)} ms for 256 KiB of ${JSON.stringify(pre)} + ${JSON.stringify(pump)}... + ${JSON.stringify(suf)}`);
    });
  }
});

const awsKey = (g: Gen) => "AKIA" + g.chars(16, UPPER + "234567");
function attachmentTree(g: Gen, planted: string[], depth: number): unknown {
  const secret = () => { const s = awsKey(g); planted.push(s); return s; };
  const leaf = () => g.pick([() => `note ${secret()}`, () => `data:${g.pick(["image/png", "text/plain", "application/pdf"])};base64,${secret()}`, () => g.chars(5, LOWER)])();
  if (depth > 3) return leaf();
  switch (g.int(5)) {
    case 0: return leaf();
    case 1: return Array.from({ length: 1 + g.int(3) }, () => attachmentTree(g, planted, depth + 1));
    case 2: {
      const o: Record<string, unknown> = { type: "base64", data: secret() }, media = g.pick(["image/png", "text/plain", 5, null, undefined]);
      if (media !== undefined) o.media_type = media;
      if (g.int(2)) o[g.pick(["extra", "source", "meta"])] = attachmentTree(g, planted, depth + 1);
      return o;
    }
    case 3: return { type: g.pick(["image", "document", "text", "input_image"]), [g.pick(["source", "content", "text", "image_url"])]: attachmentTree(g, planted, depth + 1) };
    default: return { [g.pick(["messages", "content", "input", "parts"])]: attachmentTree(g, planted, depth + 1) };
  }
}
const leavesOf = (v: unknown, path: (string | number)[] = ["$"], out: [string, string][] = []): [string, string][] => {
  if (typeof v === "string") out.push([JSON.stringify(path), v]);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) leavesOf(x, [...path, Array.isArray(v) ? Number(k) : k], out);
  return out;
};

test("fuzz: every string the scanner leaves unread is an attachment discover() inspects, so no secret reaches upstream unexamined (ADR 0003, 0009)", () => {
  const g = seeded(2);
  for (let i = 0; i < runs(3000); i++) {
    const planted: string[] = [], body = { messages: [{ role: "user", content: attachmentTree(g, planted, 0) }] }, r = inspect(body);
    if (decide("redact", r.findings).action === "block") continue;
    const inspected = new Set(discover(r.value).atts.map((a) => JSON.stringify(a.path)));
    for (const [path, text] of leavesOf(r.value)) if (planted.some((s) => text.includes(s))) assert.ok(inspected.has(path), `${path} unread in ${JSON.stringify(body)}`);
  }
});

function nestedJson(g: Gen, planted: string[], depth: number, inString: boolean): unknown {
  const kind = depth > 2 ? g.int(3) : g.int(6);
  if (kind === 0) { if (!inString || g.int(3)) return g.int(1000); const p = pesel(g.chars(1, "123456789") + g.chars(9, DIGITS)); planted.push(p); return Number(p); }
  if (kind === 1) { if (g.int(2)) return g.chars(1 + g.int(6), LOWER); const e = `${g.chars(6, LOWER)}@${g.chars(5, LOWER)}.pl`; planted.push(e); return e; }
  if (kind === 2) return g.pick([true, false, null]);
  if (kind === 3) return Array.from({ length: 1 + g.int(3) }, () => nestedJson(g, planted, depth + 1, inString));
  const o = Object.fromEntries(Array.from({ length: 1 + g.int(3) }, (_, k) => [`k${k}`, nestedJson(g, planted, depth + 1, inString || kind === 5)]));
  return kind === 4 ? o : JSON.stringify(o, null, g.pick([0, 1, 2]));
}

test("fuzz: JSON inside a string is redacted to a fixpoint and keeps no planted value, numbers included, whatever else it holds", () => {
  const g = seeded(3);
  for (let i = 0; i < runs(2000); i++) {
    const planted: string[] = [], input = { args: JSON.stringify(nestedJson(g, planted, 0, true)) }, r = inspect(input), out = JSON.stringify(r.value);
    assert.notEqual(decide("redact", r.findings).action, "block", JSON.stringify(input));
    assert.deepEqual(planted.filter((p) => out.includes(p)), [], JSON.stringify(input));
    assert.deepEqual(inspect(r.value).findings, [], JSON.stringify(input));
  }
});

const WILD: ((g: Gen) => unknown)[] = [(g) => g.chars(1 + g.int(5), LOWER), (g) => g.int(100), () => null, () => ({}), () => [], () => true, (g) => ({ x: g.chars(3, LOWER) })];
const wild = (g: Gen, usual: () => unknown) => (g.int(4) ? usual() : g.pick(WILD)(g));
const INDEXES = [0, 1, 2, "__proto__", "constructor", "toString", "0"];
function upstreamEvents(g: Gen, api: Api): object[] {
  const s = () => g.chars(1 + g.int(6), LOWER), idx = () => (g.int(3) ? g.int(3) : g.pick(INDEXES)), n = 1 + g.int(6);
  if (api === "openai-chat") return Array.from({ length: n }, () => ({ model: wild(g, s), choices: [{ delta: { content: wild(g, s), tool_calls: [{ index: idx(), function: { name: wild(g, s), arguments: wild(g, s) } }] }, finish_reason: wild(g, () => undefined) }] }));
  if (api === "openai-responses") return [...Array.from({ length: n }, () => ({ type: "response.output_text.delta", delta: wild(g, s) })),
    { type: "response.completed", response: { model: wild(g, s), status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: wild(g, s) }] }, { type: "function_call", name: wild(g, s), arguments: wild(g, s) }] } }];
  return [{ type: "message_start", message: { model: wild(g, s), usage: {} } }, ...Array.from({ length: n }, () => g.pick([
    () => ({ type: "content_block_start", index: idx(), content_block: { type: g.pick(["text", "tool_use"]), name: wild(g, s), text: wild(g, () => undefined) } }),
    () => ({ type: "content_block_delta", index: idx(), delta: { text: wild(g, s), partial_json: wild(g, s) } })])())];
}
function upstreamBody(g: Gen, api: Api): object {
  const s = () => g.chars(1 + g.int(6), LOWER), n = () => wild(g, () => g.int(100));
  if (api === "openai-chat") return { model: wild(g, s), usage: { prompt_tokens: n(), completion_tokens: n() },
    choices: [{ message: { content: wild(g, s), tool_calls: [{ index: g.pick(INDEXES), function: { name: wild(g, s), arguments: wild(g, s) } }] }, finish_reason: wild(g, () => "stop") }] };
  if (api === "openai-responses") return { model: wild(g, s), status: wild(g, () => "completed"), usage: { input_tokens: n(), output_tokens: n() },
    output: [{ type: "message", content: [{ type: "output_text", text: wild(g, s) }] }, { type: "function_call", name: wild(g, s), arguments: wild(g, s) }] };
  return { model: wild(g, s), stop_reason: wild(g, () => "end_turn"), usage: { input_tokens: n(), output_tokens: n(), cache_read_input_tokens: n() },
    content: [{ type: "text", text: wild(g, s) }, { type: "tool_use", name: wild(g, s), input: wild(g, () => ({ q: s() })) }] };
}
const PROTO = Object.getOwnPropertyNames(Object.prototype);
const pollution = () => { const added = Object.getOwnPropertyNames(Object.prototype).filter((k) => !PROTO.includes(k)); added.forEach((k) => delete (Object.prototype as any)[k]); return added; };

test("fuzz: extract keeps its contract for any upstream body: strings and token counts out, Object.prototype untouched, unrelated SSE lines change nothing", () => {
  const g = seeded(4), junk = [": ping", "event: ping", "", "retry: 10", "data: not json", "data: [DONE]", "data: null", "data: 7", 'data: "x"', "data: true", "data: []"];
  for (let i = 0; i < runs(3000); i++) {
    const api = g.pick(APIS), sse = g.int(3) > 0;
    const body = sse ? upstreamEvents(g, api).map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") : JSON.stringify(upstreamBody(g, api));
    const o = extract(api, body, sse), polluted = pollution();
    assert.deepEqual(polluted, [], body);
    assert.equal(typeof o.text, "string", body);
    for (const t of o.toolCalls) assert.ok(typeof t.name === "string" && typeof t.args === "string", `${JSON.stringify(t)} from ${body}`);
    assert.ok([o.model, o.stop].every((v) => v === undefined || typeof v === "string"), `${JSON.stringify(o)} from ${body}`);
    assert.ok(Object.values(o.usage ?? {}).every((c) => c === undefined || (Number.isSafeInteger(c) && c >= 0)), `${JSON.stringify(o.usage)} from ${body}`);
    if (!sse) continue;
    const lines = body.split("\n");
    for (let k = 1 + g.int(4); k > 0; k--) lines.splice(g.int(lines.length + 1), 0, g.pick(junk));
    const again = extract(api, lines.join("\n"), true);
    assert.deepEqual(pollution(), [], body);
    assert.deepEqual(again, o, lines.join("\n"));
  }
});

const escaped = (g: Gen, c: string) => {
  const u = "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
  return c === '"' ? g.pick(['\\"', u]) : c === "\\" ? g.pick(["\\\\", u]) : c === "/" ? g.pick(["/", "\\/", u]) : g.int(5) ? c : u;
};
const jsonString = (g: Gen, s: string) => '"' + [...s].map((c) => escaped(g, c)).join("") + '"';
const KEY_CHARS = 'ab"\\/{}[],: ';
function jsonText(g: Gen, depth: number): { text: string; duplicate: boolean } {
  const ws = () => g.pick(["", " ", "\n", "\t "]);
  if (depth > 3 || g.int(4) === 0) return { text: g.pick([() => jsonString(g, g.chars(g.int(4), KEY_CHARS)), () => String(g.int(100)), () => "null"])(), duplicate: false };
  if (g.int(3) === 0) {
    const items = Array.from({ length: g.int(4) }, () => jsonText(g, depth + 1));
    return { text: `[${ws()}${items.map((x) => x.text).join(`${ws()},${ws()}`)}${ws()}]`, duplicate: items.some((x) => x.duplicate) };
  }
  const keys = Array.from({ length: g.int(4) }, () => g.chars(1 + g.int(2), KEY_CHARS));
  if (keys.length && g.int(4) === 0) keys.splice(g.int(keys.length + 1), 0, g.pick(keys));
  const values = keys.map(() => jsonText(g, depth + 1));
  return { text: `{${ws()}${keys.map((k, i) => `${jsonString(g, k)}${ws()}:${ws()}${values[i].text}`).join(`${ws()},${ws()}`)}${ws()}}`,
    duplicate: new Set(keys).size < keys.length || values.some((x) => x.duplicate) };
}

test("fuzz: duplicate-key detection agrees with the generator on JSON with escapes, nesting and look-alike keys (ADR 0009)", () => {
  const g = seeded(5);
  for (let i = 0; i < runs(20000); i++) {
    const { text, duplicate } = jsonText(g, 0);
    JSON.parse(text);
    assert.equal(hasDuplicateKeys(text), duplicate, text);
  }
});

const depthOf = (v: unknown): number => (v !== null && typeof v === "object" ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0);
test("fuzz: the nesting-depth check agrees with the parsed value on JSON with escapes and brackets inside strings", () => {
  const g = seeded(10);
  for (let i = 0; i < runs(20000); i++) {
    const wrap = g.int(4), { text: inner, duplicate } = jsonText(g, 0);
    if (duplicate) continue;
    const text = "[".repeat(wrap) + inner + "]".repeat(wrap), depth = depthOf(JSON.parse(text));
    for (let limit = 0; limit <= depth + 1; limit++) assert.equal(nestedDeeperThan(text, limit), depth > limit, `${limit} ${text}`);
  }
});

const ODD_KEYS = ["__proto__", "constructor", "1", "01", "a,b", "a", "b,c", "", "ż", " ", "\ud800", "hash", "prevHash"];
const ODD_VALUES: ((g: Gen) => unknown)[] = [() => -0, () => 1e21, () => 0.1 + 0.2, () => "\ud800x", () => " \n\r\"\\", () => null, (g) => g.chars(3, LOWER), () => [undefined, 1], () => true];
function oddValue(g: Gen, depth: number): unknown {
  if (depth > 2 || g.int(3) === 0) return g.pick(ODD_VALUES)(g);
  if (g.int(3) === 0) return Array.from({ length: g.int(3) }, () => oddValue(g, depth + 1));
  const o = {};
  for (let k = g.int(4); k > 0; k--) Object.defineProperty(o, g.pick(ODD_KEYS), { value: oddValue(g, depth + 1), enumerable: true, writable: true, configurable: true });
  return o;
}

test("fuzz: any record content survives the log round trip: read() gives back what append wrote and the chain verifies (ADR 0002)", () => {
  const g = seeded(6), log = new AuditLog(join(mkdtempSync(join(tmpdir(), "fuzz-")), "log.jsonl")), written: unknown[] = [];
  for (let i = 0; i < runs(300); i++)
    written.push(JSON.parse(JSON.stringify(log.append({ kind: "decision", id: `d${i}`, ts: "2026-10-23T00:00:00.000Z", params: oddValue(g, 0) as Record<string, unknown>, output: oddValue(g, 0) }))));
  assert.deepEqual(log.verifyChain(), { ok: true });
  assert.deepEqual(log.read(), written);
});

const LEAK = "LEAK marker", HASH = "ql_" + "0123456789abcdef".repeat(4);
const toolResult = (g: Gen) => g.pick([
  () => JSON.stringify({ result: { result: { format: "qdl-run", sourceHash: g.pick([HASH, LEAK]), status: g.pick(["completed", LEAK]), outputs: [LEAK] } } }),
  () => JSON.stringify({ result: { id: g.pick([HASH, LEAK]), payload: { format: "qdl-program", name: LEAK } } }),
  () => JSON.stringify({ error: { code: g.pick(["missing-input", LEAK]), path: g.pick(["$.inputs.x", LEAK, "$.inputs.LEAK", `$.${"PL61109010140000071219812874"}`]), message: LEAK } }),
  () => `MCP error -32602: ${LEAK}`, () => LEAK, () => [{ type: "text", text: LEAK }]])();
const TOOL_NAMES = ["quineling_v1_run", "mcp__quinelings__quineling_inspect", "quineling_v1_offspring_admit", "quineling_v1_novel", "lookup", `quineling_${LEAK}`, LEAK];
function quinelingBody(g: Gen, api: Api): object {
  const name = g.pick(TOOL_NAMES), result = toolResult(g);
  if (api === "openai-chat") return { messages: [{ role: "assistant", tool_calls: [{ id: "c1", function: { name } }] }, { role: "tool", tool_call_id: g.pick(["c1", "c2"]), name: g.pick(TOOL_NAMES), content: result }] };
  if (api === "anthropic-messages") return { messages: [{ role: "assistant", content: [{ type: "tool_use", id: "u1", name }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: g.pick(["u1", "u2"]), content: result }] }] };
  return { input: [{ type: "function_call", call_id: "c1", name }, { type: "function_call_output", call_id: g.pick(["c1", "c2"]), output: result }] };
}

test("fuzz: Quinelings events carry only shapes, hashes, codes and clean structural error paths, never free text from the traffic (ADR 0032)", () => {
  const g = seeded(7);
  for (let i = 0; i < runs(3000); i++) {
    const api = g.pick(APIS), body = quinelingBody(g, api);
    const calls = [{ name: g.pick(TOOL_NAMES), args: g.pick([JSON.stringify({ intent: { note: LEAK }, artifactId: g.pick([HASH, LEAK]) }), LEAK]) }];
    const events = [...quinelingResults(api, body), ...quinelingCalls(calls)], from = JSON.stringify({ body, calls });
    for (const e of events) if (e.error?.path !== undefined) assert.ok(/^\$[\w.[\]-]{0,255}$/.test(e.error.path) && !scanText(e.error.path).length, `${e.error.path} from ${from}`);
    const withoutPaths = events.map((e) => (e.error ? { ...e, error: { code: e.error.code } } : e));
    assert.ok(!JSON.stringify(withoutPaths).includes("LEAK"), `${JSON.stringify(events)} from ${from}`);
  }
});

const TEXT_PIECES = ["AKIA", "ey", "password=", "@", ".", " ", "\n", "-", "_", "PL", "+48 ", "sk-", "ghp_", "😀", "\ud800", "[REDACTED:jwt]", "=", "'", '"', ":", "/", "0", "1", "a", "Z",
  "eyJhbGciOiJIUzI1NiJ9x.eyJzdWIi\n  OiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV", "AKIA" + "IOSFODNN7EXAMPLQ", "44051401359", "client_secret = ", "postgres://", "jan@firma.pl"];
const piecesText = (g: Gen) => Array.from({ length: g.int(60) }, () => (g.int(3) ? g.pick(TEXT_PIECES) : g.chars(1 + g.int(20), UPPER + LOWER + DIGITS))).join("");
test("fuzz: spans found in any text are sorted, disjoint, inside the text and inside their own match; a JWT wrapped over lines keeps its value without the whitespace", () => {
  const g = seeded(8);
  for (let i = 0; i < runs(3000); i++) {
    const text = piecesText(g), spans = scanText(text);
    spans.forEach((s, k) => {
      assert.ok(s.matchStart <= s.start && s.start < s.end && s.end <= s.matchEnd && s.matchStart >= 0 && s.matchEnd <= text.length, JSON.stringify({ text, s }));
      const slice = text.slice(s.start, s.end);
      assert.ok(s.value === slice || (s.rule === "jwt" && s.value === slice.replace(/\s+/g, "")), JSON.stringify({ text, s }));
      if (k) assert.ok(spans[k - 1].end <= s.start, JSON.stringify({ text, spans }));
    });
  }
});

test("fuzz: masking any text is a fixpoint, so no mask leaves a finding standing beside it", () => {
  const g = seeded(9);
  for (let i = 0; i < runs(3000); i++) {
    const text = piecesText(g), once = inspect(text);
    if (decide("redact", once.findings).action === "block") continue;
    assert.deepEqual(inspect(once.value).findings, [], JSON.stringify({ text, once: once.value }));
  }
});

test("fuzz: masking text split into content parts is a fixpoint, so a mask never completes a finding across parts", () => {
  const g = seeded(10);
  for (let i = 0; i < runs(3000); i++) {
    const parts = Array.from({ length: 2 + g.int(3) }, () => piecesText(g).slice(0, 1 + g.int(40))).map((t) => (g.int(2) ? t : { type: "text", text: t }));
    const once = inspect(parts);
    if (decide("redact", once.findings).action === "block") continue;
    assert.deepEqual(inspect(once.value).findings, [], JSON.stringify({ parts, once: once.value }));
  }
});
