import http from "node:http";

const usage = { prompt_tokens: 50, completion_tokens: 1, total_tokens: 51 };
const chat = (withUsage) => JSON.stringify({ id: "m", object: "chat.completion", model: "mock-1",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], ...(withUsage && { usage }) });
const messages = (withUsage) => JSON.stringify({ id: "m", type: "message", role: "assistant", model: "mock-1",
  content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", ...(withUsage && { usage: { input_tokens: 50, output_tokens: 1 } }) });

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  let model = ""; try { model = JSON.parse(Buffer.concat(chunks).toString()).model ?? ""; } catch {}
  if (model === "fail-5xx") { res.writeHead(503, { "content-type": "application/json" }); return void res.end('{"error":"mock outage"}'); }
  const withUsage = model !== "no-usage";
  const body = req.url.startsWith("/v1/messages") ? messages(withUsage) : chat(withUsage);
  res.writeHead(200, { "content-type": "application/json" }); res.end(body);
}).listen(9000, "0.0.0.0");
