import type { Api } from "./extract.js";

export const HELD_CODE = "audit_action_held";
const EVENT_END = /\r\n\r\n|\n\n|\r\r/;
const TERMINAL_RESPONSE = new Set(["response.completed", "response.incomplete", "response.failed"]);
const safeName = (name: string) => /^[A-Za-z0-9_.:-]{1,64}$/.test(name) ? name : "tool";

export function heldNotice(tools: string[]) {
  return `[ai-audit] ${HELD_CODE}: held tool call ${[...new Set(tools.map(safeName))].join(", ")}. A destination came from untrusted content, or the tool is not allowed for this key.`;
}

interface SseEvent { raw: string; event?: string; data?: any }

function parseEvent(raw: string): SseEvent {
  const lines = raw.split(/\r\n|\r|\n/), event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
  const payload = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
  let data: any;
  try { data = payload && payload !== "[DONE]" ? JSON.parse(payload) : undefined; } catch { data = undefined; }
  return { raw, ...(event && { event }), ...(data && typeof data === "object" && { data }) };
}

const emit = (e: { event?: string; data: unknown }) => `${e.event ? `event: ${e.event}\n` : ""}data: ${JSON.stringify(e.data)}\n\n`;

function startsHold(api: Api, e: SseEvent) {
  const d = e.data;
  if (!d) return false;
  if (api === "openai-chat") return (d.choices ?? []).some((c: any) => c?.finish_reason || c?.delta?.tool_calls?.length);
  if (api === "openai-responses") return TERMINAL_RESPONSE.has(d.type) || d.type?.startsWith("response.function_call_arguments")
    || ((d.type === "response.output_item.added" || d.type === "response.output_item.done") && d.item?.type === "function_call");
  return (d.type === "content_block_start" && d.content_block?.type === "tool_use") || d.type === "message_delta" || d.type === "message_stop";
}

function chatEvents(held: SseEvent[], notice: string): string {
  const template = held.find((e) => e.data?.choices)?.data ?? {};
  const head = Object.fromEntries(["id", "object", "created", "model", "system_fingerprint"].filter((k) => template[k] !== undefined).map((k) => [k, template[k]]));
  let out = emit({ data: { ...head, choices: [{ index: 0, delta: { role: "assistant", content: notice }, finish_reason: null }] } });
  for (const e of held) {
    if (!e.data?.choices) { out += e.raw; continue; }
    const choices = e.data.choices.map((c: any) => {
      const { tool_calls, ...delta } = c.delta ?? {};
      return { ...c, delta, ...(c.finish_reason && { finish_reason: c.finish_reason === "tool_calls" ? "stop" : c.finish_reason }) };
    }).filter((c: any) => c.finish_reason || Object.keys(c.delta).some((k) => k !== "role" && c.delta[k] !== undefined && c.delta[k] !== null && c.delta[k] !== ""));
    if (choices.length || e.data.usage) out += emit({ event: e.event, data: { ...e.data, choices } });
  }
  return out;
}

function responsesEvents(held: SseEvent[], notice: string, id: string): string {
  const calls = new Set<string>(), named = held.some((e) => e.event);
  for (const e of held) if (e.data?.item?.type === "function_call" && e.data.item.id) calls.add(e.data.item.id);
  const first = held.find((e) => e.data?.item?.type === "function_call" || e.data?.type?.startsWith("response.function_call_arguments"));
  const index = first?.data?.output_index ?? 0;
  const message = (status: string, text: string) => ({ id, type: "message", status, role: "assistant", content: text ? [{ type: "output_text", text, annotations: [] }] : [] });
  const part = (text: string) => ({ type: "output_text", text, annotations: [] });
  const synthetic = [
    { type: "response.output_item.added", output_index: index, item: message("in_progress", "") },
    { type: "response.content_part.added", item_id: id, output_index: index, content_index: 0, part: part("") },
    { type: "response.output_text.delta", item_id: id, output_index: index, content_index: 0, delta: notice },
    { type: "response.output_text.done", item_id: id, output_index: index, content_index: 0, text: notice },
    { type: "response.content_part.done", item_id: id, output_index: index, content_index: 0, part: part(notice) },
    { type: "response.output_item.done", output_index: index, item: message("completed", notice) },
  ];
  const events: { event?: string; data: any; raw?: string }[] = [];
  for (const e of held) {
    const d = e.data;
    if (d === first?.data) synthetic.forEach((s) => events.push({ ...(named && { event: s.type }), data: s }));
    if (d?.item?.type === "function_call" || d?.type?.startsWith("response.function_call_arguments") || (d?.item_id && calls.has(d.item_id))) continue;
    if (d && TERMINAL_RESPONSE.has(d.type) && Array.isArray(d.response?.output)) {
      let placed = false;
      const output = d.response.output.flatMap((item: any) => item?.type !== "function_call" ? [item] : placed ? [] : (placed = true, [message("completed", notice)]));
      events.push({ event: e.event, data: { ...d, response: { ...d.response, output: placed ? output : [...output, message("completed", notice)] } } });
    } else events.push(d ? { event: e.event, data: d } : { raw: e.raw, data: undefined });
  }
  if (!first) synthetic.forEach((s) => events.unshift({ ...(named && { event: s.type }), data: s }));
  const base = held.map((e) => e.data?.sequence_number).find((n) => Number.isInteger(n));
  let sequence = base;
  return events.map((e) => {
    if (e.raw !== undefined) return e.raw;
    if (sequence !== undefined) e.data = { ...e.data, sequence_number: sequence++ };
    return emit(e);
  }).join("");
}

function anthropicEvents(held: SseEvent[], notice: string): string {
  const blocks = new Set<number>();
  for (const e of held) if (e.data?.type === "content_block_start" && e.data.content_block?.type === "tool_use") blocks.add(e.data.index);
  const index = Math.min(...blocks);
  let out = "", placed = false;
  for (const e of held) {
    const d = e.data;
    if (d && ["content_block_start", "content_block_delta", "content_block_stop"].includes(d.type) && blocks.has(d.index)) {
      if (!placed && d.type === "content_block_start") {
        placed = true;
        out += emit({ event: "content_block_start", data: { type: "content_block_start", index, content_block: { type: "text", text: "" } } })
          + emit({ event: "content_block_delta", data: { type: "content_block_delta", index, delta: { type: "text_delta", text: notice } } })
          + emit({ event: "content_block_stop", data: { type: "content_block_stop", index } });
      }
      continue;
    }
    out += d?.type === "message_delta" && d.delta?.stop_reason === "tool_use" ? emit({ event: e.event, data: { ...d, delta: { ...d.delta, stop_reason: "end_turn" } } }) : e.raw;
  }
  return out;
}

export function streamGate(api: Api, messageId: string) {
  let pending = "", holding = false, textBefore = false;
  const held: SseEvent[] = [];
  return {
    push(text: string): string {
      pending += text;
      let now = "";
      for (let m = EVENT_END.exec(pending); m; m = EVENT_END.exec(pending)) {
        const event = parseEvent(pending.slice(0, m.index + m[0].length));
        pending = pending.slice(m.index + m[0].length);
        holding ||= startsHold(api, event);
        if (holding) held.push(event); else { now += event.raw; textBefore ||= (event.data?.choices ?? []).some((c: any) => c?.delta?.content); }
      }
      return now;
    },
    finish(notice: string | undefined): string {
      let tail = "";
      if (pending) {
        const event = parseEvent(pending);
        pending = "";
        holding ||= startsHold(api, event);
        if (holding) held.push(event); else tail = event.raw;
      }
      if (!notice) return held.map((e) => e.raw).join("") + tail;
      return (api === "openai-chat" ? chatEvents(held, textBefore ? `\n\n${notice}` : notice) : api === "openai-responses" ? responsesEvents(held, notice, messageId) : anthropicEvents(held, notice)) + tail;
    },
  };
}

export function rewriteResponse(api: Api, body: string, notice: string, messageId: string): string {
  const j = JSON.parse(body);
  if (api === "openai-chat") {
    for (const c of j.choices ?? []) if (c?.message?.tool_calls) {
      const { tool_calls, ...message } = c.message;
      c.message = { ...message, content: typeof message.content === "string" && message.content ? `${message.content}\n\n${notice}` : notice };
      if (c.finish_reason === "tool_calls") c.finish_reason = "stop";
    }
  } else if (api === "openai-responses") {
    let placed = false;
    const text = { id: messageId, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: notice, annotations: [] }] };
    j.output = (j.output ?? []).flatMap((item: any) => item?.type !== "function_call" ? [item] : placed ? [] : (placed = true, [text]));
    if (!placed) j.output.push(text);
  } else {
    let placed = false;
    j.content = (j.content ?? []).flatMap((block: any) => block?.type !== "tool_use" ? [block] : placed ? [] : (placed = true, [{ type: "text", text: notice }]));
    if (!placed) j.content.push({ type: "text", text: notice });
    if (j.stop_reason === "tool_use") j.stop_reason = "end_turn";
  }
  return JSON.stringify(j);
}
