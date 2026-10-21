import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../../dist/src/audit.js";
import { createProxy } from "../../dist/src/proxy.js";
import { listSessions, renderSessionHtml } from "../../dist/src/contextView.js";

const output = process.argv[2] ?? "context-flamegraph.html";
const upstream = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const promptTokens = Math.round(Buffer.concat(chunks).length / 3.8);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ model: "mock-1", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: promptTokens, completion_tokens: 20 } }));
}).listen(0, "127.0.0.1");
await new Promise((r) => upstream.once("listening", r));
const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "ctx-example-")), "audit.jsonl"));
const proxy = createProxy({ log, mode: "redact", quiet: true, upstreamOpenai: `http://127.0.0.1:${upstream.address().port}`, upstreamAnthropic: "http://127.0.0.1:1" }).listen(0, "127.0.0.1");
await new Promise((r) => proxy.once("listening", r));
const url = `http://127.0.0.1:${proxy.address().port}/v1/chat/completions`;

const tools = ["search_parts", "get_drawing", "price_machining", "check_stock"].map((name) => ({ type: "function", function: { name, description: `EXAMPLE tool ${name} `.repeat(6), parameters: { type: "object", properties: { id: { type: "string" } } } } }));
const system = { role: "system", content: "EXAMPLE system prompt for a CNC quoting agent. ".repeat(40) };
const call = (messages) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "gpt-example", tools, messages }) }).then((r) => r.text());
const toolTurn = (id, name, size) => [
  { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name, arguments: `{"id":"${id}"}` } }] },
  { role: "tool", tool_call_id: id, content: "EXAMPLE tool output row. ".repeat(size) },
];

let messages = [system, { role: "user", content: "EXAMPLE: quote 40 pcs of bracket X-100 in aluminium." }];
await call(messages);
for (const [id, name, size] of [["t1", "search_parts", 30], ["t2", "get_drawing", 220], ["t3", "price_machining", 60], ["t4", "check_stock", 15]]) {
  messages = [...messages, ...toolTurn(id, name, size)];
  await call(messages);
}
await call(messages);
const beforeEdit = messages.slice(0, 4);
await call([...beforeEdit, ...toolTurn("t2b", "get_drawing", 90)]);
messages = [...messages, { role: "assistant", content: "EXAMPLE quote: 40 pcs, 18.40 PLN each." }, { role: "user", content: "EXAMPLE: and for 400 pcs?" }];
await call(messages);

const records = log.read(), [session] = listSessions(records);
writeFileSync(output, renderSessionHtml(records, session.id));
console.log(JSON.stringify({ session: session.id, requests: session.requests, turns: session.turns, branches: session.branches, output }));
proxy.close(); upstream.close();
