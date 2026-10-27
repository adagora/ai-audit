import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { AuditLog } from "../../dist/src/audit.js";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const freePort = async () => { const server = http.createServer(); await listen(server); const port = server.address().port; await new Promise((resolve) => server.close(resolve)); return port; };
const seen = [];
const upstream = http.createServer(async (req, res) => {
  if (req.url === "/v1/models") return void res.end(JSON.stringify({ data: [{ id: "mock-workflow-model" }] }));
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  seen.push({ path: req.url, body, authorization: req.headers.authorization });
  res.setHeader("content-type", "application/json");
  if (req.url === "/v1/responses") {
    if (body.stream) {
      res.setHeader("content-type", "text/event-stream");
      res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: "Mock answer" })}\n\n`);
      res.write(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { model: body.model, usage: { input_tokens: 10, output_tokens: 2 } } })}\n\n`);
      return void res.end("data: [DONE]\n\n");
    }
    return void res.end(JSON.stringify({ id: "resp_smoke", model: body.model, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Mock answer" }] }], usage: { input_tokens: 10, output_tokens: 2 } }));
  }
  res.end(JSON.stringify({ model: body.model, choices: [{ message: { role: "assistant", content: "Mock answer" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));
});
await listen(upstream);
const proxyPort = await freePort();
const pagePort = await freePort();
const child = spawn(process.execPath, [new URL("./real.mjs", import.meta.url).pathname], {
  env: { ...process.env, AI_AUDIT_UPSTREAM_OPENAI_KEY: "sk-fake-smoke-only", WORKFLOW_REAL_TEST_UPSTREAM: `http://127.0.0.1:${upstream.address().port}`, WORKFLOW_REAL_PROXY_PORT: String(proxyPort), WORKFLOW_REAL_PAGE_PORT: String(pagePort) },
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "", stderr = "";
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });
try {
  const base = `http://127.0.0.1:${pagePort}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`real page exited: ${stderr}`);
    try { ready = (await fetch(base + "/api/state")).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `real page did not start: ${stderr}`);
  const state = await fetch(base + "/api/state").then((response) => response.json());
  assert.equal(state.mode, "real");
  assert.equal(JSON.stringify(state).includes("sk-fake-smoke-only"), false);
  const models = await fetch(base + "/api/models").then((response) => response.json());
  assert.deepEqual(models.models, ["mock-workflow-model"]);
  const send = (api, text, stream = false) => fetch(base + "/api/run", { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ scenario: "custom", api, text, model: "mock-workflow-model", stream }) }).then((response) => response.json());
  const first = await send("chat", "First turn");
  const second = await send("chat", "Second turn");
  const third = await send("responses", "Third turn", true);
  assert.deepEqual([first.status, second.status, third.status], [200, 200, 200]);
  assert.deepEqual([first.turns, second.turns, third.turns], [1, 2, 3]);
  assert.equal(seen[1].body.messages.length, 4);
  assert.equal(seen[2].body.input.length, 5);
  assert.equal(third.response.text, "Mock answer");
  assert.equal(third.response.events, 2);
  assert.equal(third.contextView.original.at(-1).content, "Third turn");
  assert.equal(third.contextView.forwardedBasis, "scanner-derived");
  const history = await fetch(base + "/api/history").then((response) => response.json());
  assert.equal(history.records.length, 3);
  assert.equal(JSON.stringify(history).includes("Third turn"), false);
  assert.ok(seen.every((request) => request.authorization === "Bearer sk-fake-smoke-only"));
  const log = new AuditLog(state.logPath);
  assert.deepEqual(log.verifyChain(), { ok: true });
  assert.equal(log.read().filter((record) => record.kind === "llm-call").length, 3);
  assert.equal(await fetch(base + "/api/reset", { method: "POST", headers: { origin: base } }).then((response) => response.status), 200);
  assert.equal((await fetch(base + "/api/state").then((response) => response.json())).turns, 0);
  assert.ok(stdout.includes("UniiChat virtual key: aia-"));
  process.stdout.write("Real workflow page smoke: 3 requests, linked turns, key swap, verified chain\n");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => upstream.close(resolve));
}
