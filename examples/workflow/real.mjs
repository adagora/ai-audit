import http from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { contextPreview } from "./context.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const page = readFileSync(new URL("./index.html", import.meta.url));
const stylesheet = readFileSync(new URL("./ui.css", import.meta.url));
const clientScript = readFileSync(new URL("./ui.js", import.meta.url));
let upstreamKey = process.env.AI_AUDIT_UPSTREAM_OPENAI_KEY;
if (!upstreamKey) throw new Error("AI_AUDIT_UPSTREAM_OPENAI_KEY is required");
const port = Number(process.env.WORKFLOW_REAL_PROXY_PORT ?? 8792);
const pagePort = Number(process.env.WORKFLOW_REAL_PAGE_PORT ?? 8791);
for (const value of [port, pagePort]) if (!Number.isSafeInteger(value) || value < 1 || value > 65535) throw new Error("invalid port");
if (port === pagePort) throw new Error("page and proxy ports must differ");
const virtualKey = `aia-${randomBytes(24).toString("base64url")}`;
const upstreamUrl = process.env.WORKFLOW_REAL_TEST_UPSTREAM;
if (upstreamUrl && !/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(upstreamUrl)) throw new Error("WORKFLOW_REAL_TEST_UPSTREAM must be a loopback URL");
const logDirectory = join(root, "live");
if (!upstreamUrl) {
  if (existsSync(logDirectory) && !lstatSync(logDirectory).isDirectory()) throw new Error("live must be a directory");
  mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
}
const logPath = join(upstreamUrl ? mkdtempSync(join(tmpdir(), "ai-audit-real-smoke-")) : logDirectory, "workflow-real.jsonl");
const base = `http://127.0.0.1:${port}`;
const cli = join(root, "dist/src/cli.js");
const proxy = spawn(process.execPath, [cli, "serve", "--mode", "redact", "--host", "127.0.0.1", "--port", String(port), "--log", logPath, ...(upstreamUrl ? ["--upstream-openai", upstreamUrl] : [])], {
  cwd: root,
  env: { ...process.env, AI_AUDIT_CLIENT_KEY: virtualKey, AI_AUDIT_UPSTREAM_OPENAI_KEY: upstreamKey, AI_AUDIT_CLIENT_LOG_CONTENT: "0" },
  stdio: ["ignore", "ignore", "pipe"],
});
delete process.env.AI_AUDIT_UPSTREAM_OPENAI_KEY;
upstreamKey = undefined;
let proxyError = "";
proxy.stderr.on("data", (chunk) => { proxyError = (proxyError + chunk).slice(-2000); });
for (let i = 0; i < 80; i++) {
  if (proxy.exitCode !== null) throw new Error(`proxy exited: ${proxyError}`);
  try { if ((await fetch(base + "/healthz")).ok) break; } catch {}
  if (i === 79) throw new Error(`proxy did not start: ${proxyError}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };
const history = [];
const recentRequests = [];
let sent = 0;
const readBody = async (req) => {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 16384) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};
const textFrom = (body, api) => {
  if (api === "chat") return body.choices?.[0]?.message?.content ?? "";
  return body.output_text ?? body.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text).join("\n") ?? "";
};
const streamResult = (raw, api) => {
  let text = "", events = 0, usage;
  for (const frame of raw.split(/\r?\n\r?\n/)) {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    if (!data || data === "[DONE]") continue;
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    events++;
    if (api === "chat") {
      text += event.choices?.map((choice) => choice.delta?.content ?? "").join("") ?? "";
      usage = event.usage ?? usage;
    } else {
      if (event.type === "response.output_text.delta") text += event.delta ?? "";
      if (event.type === "response.completed") { text ||= textFrom(event.response ?? {}, api); usage = event.response?.usage ?? usage; }
    }
  }
  return { text, events, usage };
};
const app = http.createServer(async (req, res) => {
  try {
    const host = `127.0.0.1:${pagePort}`;
    if (req.headers.host !== host) return json(res, 403, { error: "invalid host" });
    if (req.method === "POST" && req.headers.origin && req.headers.origin !== `http://${host}`) return json(res, 403, { error: "invalid origin" });
    if (req.method === "GET" && req.url === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(page); }
    if (req.method === "GET" && req.url === "/ui.css") { res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" }); return res.end(stylesheet); }
    if (req.method === "GET" && req.url === "/ui.js") { res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" }); return res.end(clientScript); }
    if (req.method === "GET" && req.url === "/api/state") return json(res, 200, { mode: "real", logPath, sent, turns: history.length / 2, model: process.env.AI_AUDIT_WORKFLOW_MODEL ?? "" });
    if (req.method === "GET" && req.url === "/api/history") return json(res, 200, { records: recentRequests.slice(-50).reverse(), basis: "page-held request summaries; the real audit log is not read" });
    if (req.method === "GET" && req.url === "/api/telemetry") {
      const [health, ready, metrics] = await Promise.all([
        fetch(base + "/healthz").then((response) => response.status),
        fetch(base + "/readyz").then((response) => response.status),
        fetch(base + "/metrics").then((response) => response.text()),
      ]);
      return json(res, 200, { health, ready, metrics: metrics.split("\n").filter((line) => /^ai_audit_(?:requests|upstream_responses|injection_signals|quineling_events|unknown_usage|log_unavailable|sandbox_unavailable)_total/.test(line)).slice(0, 60), basis: "proxy OpenMetrics; no prompt text or session ids" });
    }
    if (req.method === "GET" && req.url === "/api/models") {
      const response = await fetch(base + "/v1/models", { headers: { authorization: `Bearer ${virtualKey}` } });
      const data = await response.json();
      return json(res, response.status, { models: Array.isArray(data.data) ? data.data.map((item) => item.id).filter((id) => typeof id === "string").sort() : [], error: data.error });
    }
    if (req.method === "POST" && req.url === "/api/reset") { history.length = 0; return json(res, 200, { turns: 0 }); }
    if (req.method === "POST" && req.url === "/api/run") {
      const input = await readBody(req);
      if (input?.scenario !== "custom" || !["chat", "responses"].includes(input.api) || typeof input.text !== "string" || !input.text.trim() || input.text.length > 4000 || typeof input.model !== "string" || !/^[A-Za-z0-9._:-]{2,128}$/.test(input.model)) return json(res, 400, { error: "choose a valid model and prompt" });
      const api = input.api;
      const path = api === "chat" ? "/v1/chat/completions" : "/v1/responses";
      const conversation = [...history, { role: "user", content: input.text }];
      const stream = input.stream === true;
      const body = api === "chat" ? { model: input.model, messages: [{ role: "system", content: "You are helping test a local AI proxy." }, ...conversation], stream, ...(stream && { stream_options: { include_usage: true } }) } : { model: input.model, instructions: "You are helping test a local AI proxy.", input: conversation, stream };
      const contextView = contextPreview(api === "chat" ? "openai-chat" : "openai-responses", body, undefined);
      const startedAt = Date.now();
      const response = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${virtualKey}`, "x-audit-system-id": "workflow-real", "x-audit-use-case": "manual-integration-test" }, body: JSON.stringify(body) });
      const raw = await response.text();
      sent++;
      let parsed;
      if (stream && response.ok && response.headers.get("content-type")?.includes("text/event-stream")) parsed = streamResult(raw, api);
      else try { parsed = JSON.parse(raw); } catch { parsed = { text: raw.slice(0, 20000) }; }
      if (response.ok) {
        const answer = stream && typeof parsed.text === "string" ? parsed.text : textFrom(parsed, api);
        history.push({ role: "user", content: input.text }, { role: "assistant", content: typeof answer === "string" ? answer : JSON.stringify(answer) });
      }
      const requestId = response.headers.get("x-request-id");
      const result = { mode: "real", endpoint: path, status: response.status, requestId, findingCount: response.headers.get("x-audit-finding-count"), signalCount: response.headers.get("x-audit-signal-count"), stream, response: parsed, turns: history.length / 2, durationMs: Date.now() - startedAt, contextView };
      recentRequests.push({ requestId, status: response.status, endpoint: path, model: input.model, stream, turn: history.length / 2, durationMs: result.durationMs, contextBytes: contextView.composition.totalBytes, findingCount: result.findingCount, signalCount: result.signalCount });
      if (recentRequests.length > 100) recentRequests.shift();
      return json(res, 200, result);
    }
    return json(res, 404, { error: "not found" });
  } catch (error) { return json(res, 500, { error: error.message }); }
});
try { await new Promise((resolve, reject) => { app.once("error", reject); app.listen(pagePort, "127.0.0.1", resolve); }); }
catch (error) { proxy.kill("SIGTERM"); throw error; }
process.stdout.write(`Real workflow page: http://127.0.0.1:${pagePort}\nProxy for UniiChat: ${base}/v1\nUniiChat virtual key: ${virtualKey}\nAudit log: ${logPath}\n`);
const stop = () => { app.close(); proxy.kill("SIGTERM"); };
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
proxy.once("exit", () => app.close());
