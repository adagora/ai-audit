import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { AuditLog } from "../src/audit.js";
import { createProxy } from "../src/proxy.js";
import type { Mode } from "../src/scan.js";
export const AWS = "AKIA" + "IOSFODNN7EXAMPLQ";
export const PESEL = "44051401359";
export const AUTH = "Bearer sk-test-SHOULD-NEVER-BE-LOGGED";

type Seen = { path: string; body: Buffer; headers: http.IncomingHttpHeaders };
export async function mockUpstream() {
  const seen: Seen[] = [];
  const srv = http.createServer(async (req, res) => {
    const ch: Buffer[] = []; for await (const c of req) ch.push(c);
    const body = Buffer.concat(ch); seen.push({ path: req.url!, body, headers: req.headers });
    const j = body.length ? JSON.parse(body.toString()) : {};
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/models") return void res.end(JSON.stringify({ data: [{ id: "mock-1" }] }));
    if (req.url!.startsWith("/v1/messages/count_tokens")) return void res.end(JSON.stringify({ input_tokens: 7 }));
    const sse = (evs: unknown[]) => { res.writeHead(200, { "content-type": "text/event-stream" });
      for (const e of evs) res.write(typeof e === "string" ? e : `${(e as any).type?.startsWith("message") || (e as any).type?.startsWith("content_block") ? `event: ${(e as any).type}\n` : ""}data: ${JSON.stringify(e)}\n\n`); res.end(); };
    if (req.url === "/v1/chat/completions") {
      if (!j.stream) return void res.end(JSON.stringify({ model: "mock-1", choices: [{ message: { content: "Hello world", tool_calls: [{ function: { name: "get_price", arguments: '{"part":"x"}' } }] }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 3 } } }));
      return sse([{ model: "mock-1", choices: [{ delta: { content: "Hel" } }] }, { model: "mock-1", choices: [{ delta: { content: "lo " } }] },
        { model: "mock-1", choices: [{ delta: { content: "world, mail me at jan@firma.pl" }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 3 } }, "data: [DONE]\n\n"]);
    }
    if (req.url === "/v1/responses") {
      const resp = { model: "mock-1", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "Hello world" }] }], usage: { input_tokens: 4, output_tokens: 2 } };
      if (!j.stream) return void res.end(JSON.stringify(resp));
      return sse([{ type: "response.output_text.delta", delta: "Hello " }, { type: "response.output_text.delta", delta: "world" }, { type: "response.completed", response: resp }]);
    }
    if (req.url!.startsWith("/v1/messages")) {
      if (!j.stream) return void res.end(JSON.stringify({ model: "claude-mock", content: [{ type: "text", text: "Hello world" }], stop_reason: "end_turn", usage: { input_tokens: 6, output_tokens: 2, cache_read_input_tokens: 4, cache_creation_input_tokens: 1 } }));
      return sse([`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", content: [], model: "claude-mock", stop_reason: null, usage: { input_tokens: 6, output_tokens: 1 } } })}\n\n`,
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello " } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world" } }, { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }, { type: "message_stop" }]);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { seen, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() };
}
export async function startProxy(upstream: string, mode: Mode, extra: Partial<import("../src/proxy.js").ProxyOpts> = {}) {
  const log = new AuditLog(join(mkdtempSync(join(tmpdir(), "proxy-")), "audit.jsonl"));
  const srv = createProxy({ upstreamOpenai: upstream, upstreamAnthropic: upstream, mode, log, quiet: true, ...extra });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return { log, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() };
}


export function makePdf(lines: string[]): Buffer {
  const content = `BT /F1 14 Tf 40 760 Td 18 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf = "%PDF-1.4\n"; const off: number[] = [];
  objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}
