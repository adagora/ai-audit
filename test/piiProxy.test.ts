import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { AuditLog, sha256 } from "../src/audit.js";
import { createProxy } from "../src/proxy.js";
import { PII_TOKEN, piiTokens } from "../src/pii.js";
import { extract, type Api } from "../src/extract.js";

const key = "aia-fake-pii-customer", agent = "aia-fake-pii-agent", scope = randomUUID();
const routes: [Api, string][] = [["openai-chat", "/v1/chat/completions"], ["openai-responses", "/v1/responses"], ["anthropic-messages", "/v1/messages"]];

test("real CLI vault gateway: all three APIs, JSON/SSE, isolation, agent boundary and failures", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "pii-cli-")), vault = join(directory, "vault"), config = join(directory, "gateway.json"), logPath = join(directory, "audit.jsonl");
  const keys = [{ name: "customer", sha256: sha256(key), piiRestore: true, logContent: true }, { name: "agent", sha256: sha256(agent), logContent: true }];
  writeFileSync(config, JSON.stringify({ keys, piiVault: { directory: vault }, actionGate: { tools: { send: { mode: "enforce", arguments: ["$.url"], allow: [] } } } }));
  const seen: { body: any; headers: http.IncomingHttpHeaders }[] = [];
  let responseToken: string | undefined, malformed = false, huge = false, gate = false, incomplete = false;
  const up = http.createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const j = JSON.parse(Buffer.concat(chunks).toString()); seen.push({ body: j, headers: req.headers });
    const token = responseToken ?? piiTokens(JSON.stringify(j))[0] ?? "hello", text = huge ? "x".repeat(33 * 1024 * 1024) : `Contact ${token}`;
    const args = JSON.stringify({ url: gate ? "https://evil.example" : token });
    res.setHeader("content-type", "application/json");
    if (malformed) return void res.end("{bad");
    if (req.url === "/v1/messages/count_tokens") return void res.end(JSON.stringify({ input_tokens: 7 }));
    const api = routes.find((r) => r[1] === req.url)![0];
    const body: any = api === "openai-chat" ? { model: "fake", choices: [{ index: 0, message: { role: "assistant", content: text, tool_calls: [{ id: "call1", type: "function", function: { name: "send", arguments: args } }] }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } }
      : api === "openai-responses" ? { model: "fake", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }, { type: "function_call", name: "send", call_id: "call1", arguments: args }], usage: { input_tokens: 3, output_tokens: 2 } }
        : { model: "fake", content: [{ type: "text", text }, { type: "tool_use", id: "call1", name: "send", input: JSON.parse(args) }], stop_reason: "end_turn", usage: { input_tokens: 3, output_tokens: 2 } };
    if (!j.stream) return void res.end(JSON.stringify(body));
    res.setHeader("content-type", "text/event-stream");
    const send = (d: any) => res.write(`event: ${d.type ?? "message"}\ndata: ${JSON.stringify(d)}\n\n`);
    if (api === "anthropic-messages") {
      send({ type: "message_start", message: { content: [], model: "fake", usage: { input_tokens: 3 } } });
      send({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    }
    for (const char of text) send(api === "openai-chat" ? { model: "fake", choices: [{ index: 0, delta: { content: char } }] }
      : api === "openai-responses" ? { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: char }
        : { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: char } });
    if (incomplete) return void res.end();
    if (api === "openai-chat") {
      send({ model: "fake", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call1", function: { name: "send", arguments: args } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
      res.write("data: [DONE]\n\n");
    } else if (api === "openai-responses") {
      send({ type: "response.output_text.done", output_index: 0, content_index: 0, text });
      send({ type: "response.output_item.done", output_index: 1, item: body.output[1] });
      send({ type: "response.completed", response: body });
    } else {
      send({ type: "content_block_stop", index: 0 });
      send({ type: "content_block_start", index: 1, content_block: { ...body.content[1], input: {} } }); send({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: args } }); send({ type: "content_block_stop", index: 1 });
      send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }); send({ type: "message_stop" });
    }
    res.end();
  });
  await new Promise<void>((r) => up.listen(0, "127.0.0.1", r));
  const upstream = `http://127.0.0.1:${(up.address() as AddressInfo).port}`;
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (/^(AUDITLINE|AI_AUDIT)_/.test(name)) delete env[name];
  env.AUDITLINE_PII_VAULT_KEY = "11".repeat(32); env.AUDITLINE_UPSTREAM_OPENAI_KEY = "sk-FAKE-provider"; env.AUDITLINE_UPSTREAM_ANTHROPIC_KEY = "sk-FAKE-provider";
  const launch = async () => {
    const child = spawn(process.execPath, ["dist/src/cli.js", "serve", "--port", "0", "--config", config, "--log", logPath, "--upstream-openai", upstream, "--upstream-anthropic", upstream], { env, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill(); reject(new Error("proxy startup timed out")); }, 10000);
      child.on("exit", () => { clearTimeout(timer); reject(new Error("proxy exited before readiness: " + stderr)); });
      child.stderr.on("data", (b) => {
        stderr += b;
        for (const line of stderr.split("\n")) { try { const e = JSON.parse(line); if (e.event === "listening") { clearTimeout(timer); resolve(e.url); } } catch {} }
      });
    });
    return { child, url, stderr: () => stderr };
  };
  let proxy: Awaited<ReturnType<typeof launch>>;
  try { proxy = await launch(); } catch (e) { up.close(); throw e; }
  const post = (api: Api, path: string, content: any, stream = false, client = key, conversation: string = scope) => fetch(proxy.url + path, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${client}`, "x-audit-pii-scope": conversation },
    body: JSON.stringify({ model: "fake", stream, ...(api === "openai-responses" ? { input: content } : { messages: [{ role: "user", content }], max_tokens: 100 }) }),
  });
  try {
    for (const [api, path] of routes) for (const stream of [false, true]) await t.test(`${api} ${stream ? "SSE" : "JSON"}: model sees tokens, customer sees PII, tool arguments remain tokens`, async () => {
      const r = await post(api, path, "ada@example.com and +48 601 234 567", stream);
      assert.equal(r.status, 200); const raw = await r.text(), output = extract(api, raw, stream)!;
      assert.equal(output.text, "Contact ada@example.com");
      assert.ok(!JSON.stringify(seen.at(-1)!.body).includes("ada@example.com"));
      assert.ok(!JSON.stringify(seen.at(-1)!.body).includes("601 234 567"));
      assert.match(output.toolCalls[0].args, /\[PII:email:/);
      assert.equal(seen.at(-1)!.headers["x-audit-pii-scope"], undefined);
      assert.equal(seen.at(-1)!.headers.authorization ?? seen.at(-1)!.headers["x-api-key"], api === "anthropic-messages" ? "sk-FAKE-provider" : "Bearer sk-FAKE-provider");
    });
    let token = "";
    await t.test("agent key never receives restored PII; reuse survives restart", async () => {
      const r = await post("openai-chat", routes[0][1], "ada@example.com", false, agent);
      const raw = await r.text(); assert.ok(!raw.includes("ada@example.com")); token = piiTokens(raw)[0]; assert.ok(token);
      for (let i = 0; i < 100; i++) {
        if (new AuditLog(logPath).read().some((row) => row.id === r.headers.get("x-request-id"))) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(new AuditLog(logPath).read().some((row) => row.id === r.headers.get("x-request-id")));
      proxy.child.kill(); await new Promise((r) => proxy.child.once("exit", r)); proxy = await launch();
      const reused = await post("openai-chat", routes[0][1], token, false, agent); assert.equal(reused.status, 200); assert.match(await reused.text(), /\[PII:email:/);
    });
    await t.test("foreign keys, other conversations, unknown tokens and missing scope never reach upstream", async () => {
      const before = seen.length;
      for (const [client, conversation, content] of [[key, scope, token], [agent, randomUUID(), token], [agent, scope, token.replace(/[a-p]{48}/, "a".repeat(48))]] as const) {
        const r = await post("openai-chat", routes[0][1], content, false, client, conversation); assert.equal(r.status, 422); await r.text();
      }
      const r = await post("openai-chat", routes[0][1], "hello", false, key, ""); assert.equal(r.status, 400); await r.text();
      assert.equal(seen.length, before);
    });
    await t.test("model cannot request restoration of a token absent from this request", async () => {
      responseToken = token;
      const r = await post("openai-chat", routes[0][1], "hello"); assert.equal(r.status, 200);
      assert.ok(!(await r.text()).includes("ada@example.com")); responseToken = undefined;
    });
    await t.test("action gate still holds forbidden tool calls before customer delivery", async () => {
      gate = true;
      for (const [api, path] of routes) for (const stream of [false, true]) {
        const r = await post(api, path, "ada@example.com", stream); assert.equal(r.status, 200);
        const raw = await r.text(), out = extract(api, raw, stream)!;
        assert.match(out.text, /audit_action_held/); assert.match(out.text, /ada@example.com/); assert.equal(out.toolCalls.length, 0);
      }
      gate = false;
    });
    await t.test("attachments, audio and provider-held history fail before upstream", async () => {
      const before = seen.length;
      for (const content of [[{ type: "image_url", image_url: { url: "https://example.com/image.png" } }], [{ type: "input_audio", input_audio: { data: "ZmFrZQ==", format: "wav" } }], [{ type: "reasoning", encrypted_content: "ZmFrZQ==" }], [{ type: "item_reference", id: "fake" }], [{ type: "redacted_thinking", data: "ZmFrZQ==" }]]) {
        const r = await post("openai-chat", routes[0][1], content); assert.equal(r.status, 422); await r.text();
      }
      const history = await fetch(proxy.url + "/v1/responses", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-audit-pii-scope": scope }, body: JSON.stringify({ model: "fake", input: "hi", previous_response_id: "resp_fake" }) });
      assert.equal(history.status, 422); await history.text();
      assert.equal(seen.length, before);
    });
    await t.test("malformed and oversized customer responses fail without partial delivery", async () => {
      malformed = true; const r = await post("openai-chat", routes[0][1], "ada@example.com"); assert.equal(r.status, 502); assert.equal((await r.json()).error.code, "audit_pii_delivery_failed"); malformed = false;
      incomplete = true; const partial = await post("openai-chat", routes[0][1], "ada@example.com", true); assert.equal(partial.status, 502); assert.ok(!(await partial.text()).includes("ada@example.com")); incomplete = false;
      huge = true; const large = await post("openai-chat", routes[0][1], "ada@example.com"); assert.equal(large.status, 502); await large.text(); huge = false;
    });
    await t.test("large requests use deadline workers and count_tokens sees only tokens without an audit row", async () => {
      const large = await post("openai-chat", routes[0][1], "x".repeat(300_000) + " ada@example.com", false, agent);
      assert.equal(large.status, 200); await large.text();
      for (let i = 0; i < 100 && !new AuditLog(logPath).read().some((r) => r.id === large.headers.get("x-request-id")); i++) await new Promise((r) => setTimeout(r, 10));
      const before = new AuditLog(logPath).read().length;
      const count = await post("anthropic-messages", "/v1/messages/count_tokens", "ada@example.com");
      assert.equal(count.status, 200); assert.deepEqual(await count.json(), { input_tokens: 7 });
      assert.ok(!JSON.stringify(seen.at(-1)!.body).includes("ada@example.com"));
      assert.equal(new AuditLog(logPath).read().length, before);
      const metrics = await (await fetch(proxy.url + "/metrics")).text();
      assert.match(metrics, /ai_audit_inspections_offloaded_total\{result="ok"\} [1-9]/);
    });
    await t.test("an unwritable audit log still blocks before any upstream call", async () => {
      const saved = readFileSync(logPath, "utf8"), before = seen.length;
      writeFileSync(logPath, saved + "{");
      try {
        const r = await post("openai-chat", routes[0][1], "ada@example.com"); assert.equal(r.status, 503); await r.text(); assert.equal(seen.length, before);
      } finally { writeFileSync(logPath, saved); }
    });
    await t.test("vault-prune uses the real CLI and preserves unexpired mappings", () => {
      const result = spawnSync(process.execPath, ["dist/src/cli.js", "vault-prune", "--config", config], { env, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout), { removed: 0 });
    });
    await t.test("vault unavailable blocks the forward and log contains no original PII or tokens", async () => {
      const files = readdirSync(vault); assert.ok(files.length > 0);
      for (const file of files) assert.ok(!readFileSync(join(vault, file), "utf8").includes("ada@example.com"));
      rmSync(vault, { recursive: true }); writeFileSync(vault, "unavailable");
      const before = seen.length, r = await post("openai-chat", routes[0][1], "ada@example.com"); assert.equal(r.status, 503); await r.text(); assert.equal(seen.length, before);
      await new Promise((r) => setTimeout(r, 30));
      const log = readFileSync(logPath, "utf8");
      assert.ok(!log.includes("ada@example.com") && !log.includes("601 234 567") && !log.includes("[PII:"));
      assert.ok(!proxy.stderr().includes("ada@example.com")); assert.deepEqual(new AuditLog(logPath).verifyChain(), { ok: true });
      assert.equal(new AuditLog(logPath).read().filter((r: any) => r.kind === "llm-call").length, seen.length + 9);
    });
  } finally {
    proxy.child.kill(); up.closeAllConnections(); await new Promise<void>((r) => up.close(() => r()));
  }
});

test("vault startup rejects bypass modes, allowlists, model judges and restoration without a vault", () => {
  const directory = mkdtempSync(join(tmpdir(), "pii-config-")), log = new AuditLog(join(directory, "audit.jsonl"));
  const options = { upstreamOpenai: "http://127.0.0.1", upstreamAnthropic: "http://127.0.0.1", mode: "redact" as const, log, keys: [{ name: "fake", sha256: sha256(key) }], piiVault: { directory: join(directory, "vault"), key: Buffer.alloc(32) } };
  for (const change of [{ mode: "advisory" as const }, { mode: "no-go" as const }, { keys: [] }, { carnet: new Set([sha256("ada@example.com")]) }, { injectionJudge: { model: "fake", task: "test" } }, { piiVault: undefined, keys: [{ name: "fake", sha256: sha256(key), piiRestore: true }] }]) {
    assert.throws(() => createProxy({ ...options, ...change }), /audit_pii_vault_config_invalid/);
  }
});
