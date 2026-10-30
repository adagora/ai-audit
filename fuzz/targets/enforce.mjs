import { APIS, extract, heldNotice, rewriteResponse, streamGate, fail } from "./common.mjs";

const NOTICE = heldNotice(["send_email"]), ID = "msg_audit_1", TERMINAL = new Set(["response.completed", "response.incomplete", "response.failed"]);
const list = (v) => (Array.isArray(v) ? v : []);
const json = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
const outcome = (run) => { try { return { value: run() }; } catch (e) { return { threw: String(e) }; } };

function clientEvents(stream) {
  const events = [];
  let data = [];
  for (const line of stream.split(/\r\n|\r|\n/)) {
    if (line === "") { if (data.length) events.push(json(data.join("\n"))); data = []; }
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length) events.push(json(data.join("\n")));
  return events.filter((d) => d && typeof d === "object");
}
const EVENT_CALL = {
  "openai-chat": (d) => list(d.choices).some((c) => list(c?.delta?.tool_calls).length > 0),
  "openai-responses": (d) => ((d.type === "response.output_item.added" || d.type === "response.output_item.done") && d.item?.type === "function_call")
    || d.type === "response.function_call_arguments.delta" || d.type === "response.function_call_arguments.done"
    || (TERMINAL.has(d.type) && list(d.response?.output).some((i) => i?.type === "function_call")),
  "anthropic-messages": (d) => d.type === "content_block_start" && d.content_block?.type === "tool_use",
};
const BODY_CALL = {
  "openai-chat": (j) => list(j?.choices).some((c) => list(c?.message?.tool_calls).length > 0),
  "openai-responses": (j) => list(j?.output).some((i) => i?.type === "function_call"),
  "anthropic-messages": (j) => list(j?.content).some((b) => b?.type === "tool_use"),
};
const streamShowsCall = (api, s) => clientEvents(s).some(EVENT_CALL[api]);
const bodyShowsCall = (api, s) => BODY_CALL[api](json(s));

function gated(api, stream, size, notice) {
  const gate = streamGate(api, ID);
  let out = "";
  for (let i = 0; i < stream.length; i += size) out += gate.push(stream.slice(i, i + size));
  return out + gate.finish(notice);
}

function stream(api, text, size) {
  const passed = outcome(() => gated(api, text, size, undefined));
  if (passed.value !== text) fail("a stream without a notice is not delivered byte for byte", { api, size, text, passed });
  const held = outcome(() => gated(api, text, size, NOTICE)), whole = outcome(() => gated(api, text, Math.max(text.length, 1), NOTICE));
  if (held.threw !== undefined) fail("the gate throws on a held stream", { api, size, text, held });
  if (held.value !== whole.value) fail("the held stream depends on how it is split", { api, size, text, held, whole });
  if (streamShowsCall(api, held.value)) fail("a client sees a tool call after the hold", { api, size, text, out: held.value });
  if (streamShowsCall(api, text) && !extract(api, text, true).toolCalls.length) fail("the judge misses a tool call that a client sees", { api, text });
}

function body(api, text) {
  const rewritten = outcome(() => rewriteResponse(api, text, NOTICE, ID));
  if (rewritten.value !== undefined && bodyShowsCall(api, rewritten.value)) fail("a client sees a tool call in the rewritten body", { api, text, out: rewritten.value });
  if (bodyShowsCall(api, text) && rewritten.value !== undefined && !rewritten.value.includes(NOTICE)) fail("the rewritten body has no notice", { api, text, out: rewritten.value });
  if (bodyShowsCall(api, text) && !extract(api, text, false).toolCalls.length) fail("the judge misses a tool call that a client sees", { api, text });
}

export function fuzz(data) {
  if (!data.length) return;
  const api = APIS[data[0] % 3], size = 1 + (data[0] >> 3), text = data.subarray(1).toString("utf8");
  if (data[0] & 4) body(api, text); else stream(api, text, size);
}
