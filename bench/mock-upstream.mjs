import http from "node:http";
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 0);
const OA = JSON.stringify({ id: "m", object: "chat.completion", model: "mock-1", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 1, total_tokens: 51 } });
const AN = JSON.stringify({ id: "m", type: "message", role: "assistant", model: "mock-1", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 50, output_tokens: 1 } });
const srv = http.createServer(async (req, res) => {
  for await (const _ of req);
  const body = req.url.startsWith("/v1/messages") ? AN : OA;
  const send = () => { res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) }); res.end(body); };
  DELAY ? setTimeout(send, DELAY) : send();
});
srv.keepAliveTimeout = 60_000;
srv.listen(0, "127.0.0.1", () => process.send?.({ port: srv.address().port }));
