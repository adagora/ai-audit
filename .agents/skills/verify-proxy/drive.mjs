#!/usr/bin/env node
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const cli = join(repo, "dist/src/cli.js");
const only = process.argv.slice(2);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const evidence = process.env.VERIFY_PROXY_EVIDENCE ?? join(homedir(), ".ai-audit-verify", runId);
const scratch = join(evidence, "scratch");
mkdirSync(scratch, { recursive: true });
if (!existsSync(cli)) { console.error(`missing ${cli}; run npm run build first`); process.exit(2); }

const AWS = "AKIA" + "IOSFODNN7EXAMPLQ";
const CLIENT_KEY = "aia-verify-client-key";
const ADMIN_KEY = "aia-verify-admin-key";
const UPSTREAM_KEY = "sk-verify-upstream-FAKE";
const toolsOk = ["tesseract", "pdftotext", "pdfinfo", "pdftoppm", "python3"].every((c) => { try { execFileSync("which", [c], { stdio: "ignore" }); return true; } catch { return false; } });

const seen = [];
const sse = (res, frames) => { res.writeHead(200, { "content-type": "text/event-stream" }); for (const f of frames) res.write(f); res.end(); };
const upstream = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString(), body = raw ? JSON.parse(raw) : {};
  seen.push({ path: req.url, raw, auth: req.headers.authorization ?? req.headers["x-api-key"] ?? null, model: body.model });
  if (req.url === "/v1/chat/completions") {
    if (!body.stream) return void res.end(JSON.stringify({ model: body.model, choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 20 } } }));
    return sse(res, [{ model: body.model, choices: [{ delta: { content: "Hel" } }] }, { model: body.model, choices: [{ delta: { content: "lo" }, finish_reason: "stop" }] },
      ...(body.stream_options?.include_usage ? [{ choices: [], usage: { prompt_tokens: 40, completion_tokens: 2 } }] : [])].map((e) => `data: ${JSON.stringify(e)}\n\n`).concat("data: [DONE]\n\n"));
  }
  if (req.url === "/v1/messages") {
    if (!body.stream) return void res.end(JSON.stringify({ model: body.model, content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 9, output_tokens: 1, cache_read_input_tokens: 30, cache_creation_input_tokens: 5 } }));
    const ev = (e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
    return sse(res, [ev({ type: "message_start", message: { id: "m1", type: "message", role: "assistant", content: [], model: body.model, usage: { input_tokens: 9, output_tokens: 1 } } }),
      ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }), ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }),
      ev({ type: "content_block_stop", index: 0 }), ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }), ev({ type: "message_stop" })]);
  }
  res.writeHead(404).end();
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;

const started = [];
async function launch(name, mode, extraArgs = [], env = {}) {
  const dir = join(scratch, name); mkdirSync(dir, { recursive: true });
  const log = join(dir, "audit.jsonl");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [cli, "serve", "--mode", mode, "--log", log, "--port", String(port), "--upstream-openai", upstreamUrl, "--upstream-anthropic", upstreamUrl, ...extraArgs],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME, AI_AUDIT_CLIENT_KEY: CLIENT_KEY, AI_AUDIT_ADMIN_KEY: ADMIN_KEY, AI_AUDIT_UPSTREAM_OPENAI_KEY: UPSTREAM_KEY, AI_AUDIT_UPSTREAM_ANTHROPIC_KEY: UPSTREAM_KEY, ...env }, stdio: ["ignore", "ignore", "pipe"] });
  started.push(child);
  let stderr = ""; child.stderr.on("data", (d) => { stderr += d; writeFileSync(join(dir, "serve.log"), stderr); });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (stderr.includes('"event":"listening"')) {
      const health = await fetch(`${url}/healthz`).then((r) => r.status).catch(() => 0);
      const records = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
      if (health === 200) return { name, url, log, dir, records, settled: async (count) => { for (let i = 0; i < 50 && records().length < count; i++) await new Promise((r) => setTimeout(r, 40)); expect(records().length >= count, `${name}: no audit record written`); return records().at(-1); }, cliRun: (...a) => execFileSync(process.execPath, [cli, ...a, "--log", log], { encoding: "utf8" }) };
    }
    if (child.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${name} did not become ready: ${stderr.slice(-400)}`);
}
const post = (base, path, body, headers = {}) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${CLIENT_KEY}`, ...headers }, body: JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, text: await r.text(), headers: Object.fromEntries(r.headers) }));
const chat = (content, extra = {}) => ({ model: "gpt-4o-mini", messages: [{ role: "user", content }], ...extra });
const anthropic = (content, extra = {}) => ({ model: "claude-sonnet-4-5", max_tokens: 64, messages: [{ role: "user", content }], ...extra });

const results = [];
async function scenario(name, fn) {
  if (only.length && !only.some((o) => name.startsWith(o))) return;
  const before = seen.length;
  try {
    const detail = await fn(() => seen.slice(before));
    results.push({ name, status: detail === "skip" ? "skip" : "pass", ...(typeof detail === "object" && { detail }) });
  } catch (e) { results.push({ name, status: "fail", error: String(e?.message ?? e) }); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

const config = join(scratch, "config.json");
writeFileSync(config, JSON.stringify({ aliases: { fast: { model: "gpt-4o-mini-2024-07-18" } } }));
try {
  const redact = await launch("redact", "redact", ["--config", config]);
  const nogo = await launch("nogo", "no-go");
  const advisory = await launch("advisory", "advisory");
  const unsandboxed = await launch("unsandboxed", "redact", ["--unsafe-no-sandbox"]);

  await scenario("keys: wrong client key is 401 and never forwarded", async (sent) => {
    const r = await post(redact.url, "/v1/chat/completions", chat("hi"), { authorization: "Bearer wrong" });
    expect(r.status === 401, `status ${r.status}`); expect(sent().length === 0, "upstream was called");
  });
  await scenario("keys: upstream gets the upstream key, never the client key", async (sent) => {
    const n = redact.records().length + 1; const r = await post(redact.url, "/v1/chat/completions", chat("hi"));
    expect(r.status === 200, `status ${r.status}`); expect(sent()[0].auth === `Bearer ${UPSTREAM_KEY}`, "upstream auth not swapped"); await redact.settled(n);
    expect(!readFileSync(redact.log, "utf8").includes(CLIENT_KEY) && !readFileSync(redact.log, "utf8").includes(UPSTREAM_KEY), "a key reached the log");
  });
  await scenario("redact: AWS key replaced upstream and absent from the log", async (sent) => {
    const n = redact.records().length + 1; const r = await post(redact.url, "/v1/chat/completions", chat(`deploy with ${AWS} please`));
    expect(r.status === 200, `status ${r.status}`); expect(!sent()[0].raw.includes(AWS) && sent()[0].raw.includes("[REDACTED:"), "upstream saw the key");
    const rec = await redact.settled(n); expect(rec.decision.action === "forward-redacted", `action ${rec.decision.action}`);
    expect(!readFileSync(redact.log, "utf8").includes(AWS), "key in log");
    return { findings: rec.decision.findings, findingHeader: r.headers["x-audit-finding-count"] };
  });
  await scenario("no-go: finding is 409 and never forwarded", async (sent) => {
    const n = nogo.records().length + 1; const r = await post(nogo.url, "/v1/chat/completions", chat(`key ${AWS}`));
    expect(r.status === 409, `status ${r.status}`); expect(sent().length === 0, "upstream was called"); expect(!r.text.includes(AWS), "key echoed");
    return { body: JSON.parse(r.text).error.code };
  });
  await scenario("advisory: original forwarded, finding logged", async (sent) => {
    const n = advisory.records().length + 1; const r = await post(advisory.url, "/v1/chat/completions", chat(`key ${AWS}`));
    expect(r.status === 200, `status ${r.status}`); expect(sent()[0].raw.includes(AWS), "advisory changed the request");
    const rec = await advisory.settled(n); expect(rec.decision.findings.length > 0, "finding not logged"); expect(!readFileSync(advisory.log, "utf8").includes(AWS), "key in log");
  });
  await scenario("stream: OpenAI SSE passes through and usage is logged with include_usage", async () => {
    const n = redact.records().length + 1; const r = await post(redact.url, "/v1/chat/completions", chat("stream please", { stream: true, stream_options: { include_usage: true } }));
    expect(r.status === 200 && r.text.includes("[DONE]") && r.text.includes('"Hel"'), "stream not passed through");
    const rec = await redact.settled(n); expect(rec.stream === true && rec.usage?.input === 40, `usage ${JSON.stringify(rec.usage)}`);
    return { usage: rec.usage };
  });
  await scenario("stream: OpenAI SSE without include_usage logs usage as unknown, not zero", async () => {
    const n = redact.records().length + 1; await post(redact.url, "/v1/chat/completions", chat("stream no usage", { stream: true }));
    const rec = await redact.settled(n); expect(rec.usage === undefined || rec.usage === null || rec.usage.input === undefined || rec.usage.input === null, `usage ${JSON.stringify(rec.usage)}`);
  });
  await scenario("stream: Anthropic SSE passes through and usage is logged", async () => {
    const n = redact.records().length + 1; const r = await post(redact.url, "/v1/messages", anthropic("stream please", { stream: true }), { authorization: "", "x-api-key": CLIENT_KEY });
    expect(r.status === 200 && r.text.includes("message_stop"), `status ${r.status}`);
    const rec = await redact.settled(n); expect(rec.provider === "anthropic" && rec.usage?.output === 2, `usage ${JSON.stringify(rec.usage)}`);
    return { usage: rec.usage };
  });
  await scenario("aliases: config alias rewrites the model upstream", async (sent) => {
    const n = redact.records().length + 1; const r = await post(redact.url, "/v1/chat/completions", { ...chat("hi"), model: "fast" });
    expect(r.status === 200, `status ${r.status}`); expect(sent()[0].model === "gpt-4o-mini-2024-07-18", `upstream model ${sent()[0].model}`);
  });
  await scenario("attachments: remote image URL is uninspectable, 422, never forwarded", async (sent) => {
    const n = redact.records().length + 1; const r = await post(redact.url, "/v1/chat/completions", { model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: "https://example.com/a.png" } }] }] });
    expect(r.status === 422, `status ${r.status}`); expect(sent().length === 0, "upstream was called");
  });
  await scenario("attachments: PDF with a key is rebuilt as page images without the key", async (sent) => {
    if (!toolsOk && !process.env.CI) return "skip";
    const { makePdf } = await import(join(repo, "dist/test/helpers.js"));
    const pdf = makePdf(["Quote for bracket", `aws ${AWS}`]).toString("base64");
    const n = redact.records().length + 1; const r = await post(redact.url, "/v1/messages", { model: "claude-sonnet-4-5", max_tokens: 64, messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } }, { type: "text", text: "summarise" }] }] }, { authorization: "", "x-api-key": CLIENT_KEY });
    expect(r.status === 200, `status ${r.status} ${r.text.slice(0, 200)}`); expect(!sent()[0].raw.includes(pdf), "original PDF forwarded");
    const rec = await redact.settled(n); expect(rec.decision.rasterized?.length > 0, "not logged as rasterized");
  });
  await scenario("sandbox: default proxy reports bwrap at startup; --unsafe-no-sandbox is loud and recorded", async () => {
    expect(readFileSync(join(redact.dir, "serve.log"), "utf8").includes('"sandbox":"bwrap"'), "redact proxy is not sandboxed");
    expect(readFileSync(join(unsandboxed.dir, "serve.log"), "utf8").includes("sandbox_disabled_unsafe"), "no startup warning");
    const n = unsandboxed.records().length + 1;
    await post(unsandboxed.url, "/v1/chat/completions", { model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }] }] });
    const rec = await unsandboxed.settled(n); expect(rec.decision.sandbox === "disabled", `decision ${JSON.stringify(rec.decision)}`);
    const m = await fetch(`${unsandboxed.url}/metrics`).then((x) => x.text()); expect(/^ai_audit_sandbox_disabled 1$/m.test(m), "gauge not raised");
  });
  await scenario("context map: multi-turn session is linked and renders", async () => {
    const tools = [{ type: "function", function: { name: "read_file", description: "read", parameters: { type: "object", properties: {} } } }];
    let messages = [{ role: "system", content: "verify session" }, { role: "user", content: "turn one" }];
    await post(redact.url, "/v1/chat/completions", { model: "gpt-4o-mini", tools, messages });
    messages = [...messages, { role: "assistant", content: "ok" }, { role: "user", content: "turn two" }];
    await post(redact.url, "/v1/chat/completions", { model: "gpt-4o-mini", tools, messages });
    const n = redact.records().length + 1; await post(redact.url, "/v1/chat/completions", { model: "gpt-4o-mini", tools, messages });
    const rec = await redact.settled(n); expect(rec.session?.turn === 2, `turn ${rec.session?.turn}`);
    const html = join(evidence, "context-map.html");
    redact.cliRun("context", "--session", rec.session.id, "--output", html);
    const page = readFileSync(html, "utf8"); expect(page.includes("Token timeline") && page.includes("Context arena"), "page incomplete");
    return { session: rec.session.id, turn: rec.session.turn, html };
  });
  await scenario("stats: CLI and admin endpoint report tokens; endpoint needs the admin key", async () => {
    const table = redact.cliRun("stats", "--by", "model"); expect(table.includes("gpt-4o-mini"), "cli stats missing model");
    const denied = await fetch(`${redact.url}/audit/stats?by=model`).then((r) => r.status);
    const ok = await fetch(`${redact.url}/audit/stats?by=model`, { headers: { "x-admin-key": ADMIN_KEY } }).then(async (r) => ({ status: r.status, body: await r.json() }));
    expect(denied === 401 || denied === 403, `unauthenticated ${denied}`); expect(ok.status === 200, `admin ${ok.status}`);
    return { denied, rows: Array.isArray(ok.body) ? ok.body.length : Object.keys(ok.body).length };
  });
  await scenario("metrics: OpenMetrics text with request counters and no content", async () => {
    const r = await fetch(`${redact.url}/metrics`); const text = await r.text();
    expect(r.status === 200 && text.includes("ai_audit_requests_total") && text.trimEnd().endsWith("# EOF"), "not OpenMetrics");
    expect(!text.includes(AWS) && !text.includes(CLIENT_KEY), "content in metrics");
  });
  await scenario("log: chain verifies after the run", async () => {
    const out = redact.cliRun("verify"); return { verify: out.trim().slice(0, 200) };
  });
  await scenario("log: torn log fails closed with 503 and nothing is forwarded", async (sent) => {
    appendFileSync(redact.log, '{"torn":');
    const r = await post(redact.url, "/v1/chat/completions", chat("after the disk broke"));
    expect(r.status === 503 && r.text.includes("audit_log_unavailable"), `status ${r.status}`); expect(sent().length === 0, "forwarded without a log");
    const m = await fetch(`${redact.url}/metrics`).then((x) => x.text()); expect(/ai_audit_log_unavailable_total [1-9]/.test(m), "not counted");
  });
} finally {
  for (const c of started) c.kill("SIGTERM");
  upstream.close();
  writeFileSync(join(evidence, "results.json"), JSON.stringify({ runId, repoHead: execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(), toolsOk, results }, null, 2));
  if (!process.env.VERIFY_PROXY_KEEP_SCRATCH) rmSync(scratch, { recursive: true, force: true });
}
for (const r of results) console.log(`${r.status.padEnd(4)} ${r.name}${r.error ? `: ${r.error}` : ""}`);
const failed = results.filter((r) => r.status === "fail").length;
console.log(`${results.length} scenarios, ${failed} failed, ${results.filter((r) => r.status === "skip").length} skipped; evidence: ${evidence}`);
process.exit(failed ? 1 : 0);
