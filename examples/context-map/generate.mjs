import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../../dist/src/audit.js";
import { createProxy } from "../../dist/src/proxy.js";
import { listSessions, renderSessionHtml } from "../../dist/src/contextView.js";

const output = process.argv[2] ?? "context-map.html";
const BYTES_PER_TOKEN = 3.8, seenPrompts = [];
const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
const upstream = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString());
  const prompt = JSON.stringify({ tools: body.tools, system: body.system, messages: body.messages });
  const total = Math.round(prompt.length / BYTES_PER_TOKEN);
  const cachedChars = Math.max(0, ...seenPrompts.map((p) => commonPrefix(p, prompt)));
  seenPrompts.push(prompt);
  const read = cachedChars >= 1024 * BYTES_PER_TOKEN ? Math.round(cachedChars / BYTES_PER_TOKEN) : 0;
  const tail = Math.min(total - read, 60), write = Math.max(0, total - read - tail);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ model: "claude-example", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn",
    usage: { input_tokens: tail, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: 180 + (body.messages.length * 37) % 400 } }));
}).listen(0, "127.0.0.1");
await new Promise((r) => upstream.once("listening", r));
const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "ctx-example-")), "audit.jsonl"));
const proxy = createProxy({ log, mode: "redact", quiet: true, upstreamOpenai: "http://127.0.0.1:1", upstreamAnthropic: `http://127.0.0.1:${upstream.address().port}` }).listen(0, "127.0.0.1");
await new Promise((r) => proxy.once("listening", r));
const url = `http://127.0.0.1:${proxy.address().port}/v1/messages`;

const tool = (name, size) => ({ name, description: `EXAMPLE ${name}: `.padEnd(size, "lorem ipsum "), input_schema: { type: "object", properties: { id: { type: "string" } } } });
const baseTools = [tool("search_parts", 900), tool("get_drawing", 1100), tool("price_machining", 1300), tool("check_stock", 700), tool("read_file", 1500), tool("run_cam_sim", 1800)];
const skillTool = tool("skill_iso2768_tolerances", 5200);
const system = "EXAMPLE system prompt for a CNC quoting agent. ".repeat(160);
const call = (tools, messages) => fetch(url, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "claude-example", max_tokens: 1024, system, tools, messages }) }).then((r) => r.text());
const toolRound = (id, name, size) => [
  { role: "assistant", content: [{ type: "tool_use", id, name, input: { id } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "EXAMPLE result row. ".repeat(size) }] },
];

let tools = baseTools, messages = [{ role: "user", content: "EXAMPLE: quote 40 pcs of bracket X-100, 6061 aluminium, anodised." }];
await call(tools, messages);
for (const [id, name, size] of [["t1", "search_parts", 120], ["t2", "get_drawing", 900], ["t3", "price_machining", 260]]) {
  messages = [...messages, ...toolRound(id, name, size)]; await call(tools, messages);
}
tools = [...baseTools.slice(0, 2), skillTool, ...baseTools.slice(2)];
messages = [...messages, ...toolRound("t4", "skill_iso2768_tolerances", 150)]; await call(tools, messages);
messages = [...messages, ...toolRound("t5", "run_cam_sim", 700)]; await call(tools, messages);
await call(tools, messages);
await call(tools, [...messages.slice(0, -2), ...toolRound("t5b", "check_stock", 90)]);
for (const [id, name, size] of [["t6", "check_stock", 80], ["t7", "price_machining", 300]]) {
  messages = [...messages, ...toolRound(id, name, size)]; await call(tools, messages);
}
messages = [...messages, { role: "assistant", content: "EXAMPLE quote: 40 pcs at 18.40 PLN each." }, { role: "user", content: "EXAMPLE: and for 400 pcs?" }];
await call(tools, messages);

const records = log.read(), [session] = listSessions(records);
writeFileSync(output, renderSessionHtml(records, session.id));
console.log(JSON.stringify({ session: session.id, requests: session.requests, turns: session.turns, branches: session.branches, output }));
proxy.close(); upstream.close();
