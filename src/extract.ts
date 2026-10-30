export type Api = "openai-chat" | "openai-responses" | "anthropic-messages";
export interface Usage { input?: number; output?: number; cached?: number; cacheWrite?: number }
const au = (u: any): Usage => ({ input: u?.input_tokens, output: u?.output_tokens, cached: u?.cache_read_input_tokens, cacheWrite: u?.cache_creation_input_tokens });
export interface Out { model?: string; text: string; toolCalls: { name: string; args: string }[]; usage?: Usage; stop?: string }

function sseData(raw: string): any[] {
  const events: any[] = [];
  let data: string[] = [];
  const dispatch = () => {
    const d = data.join("\n").trim(); data = [];
    if (!d || d === "[DONE]") return;
    try { const e = JSON.parse(d); if (e && typeof e === "object" && !Array.isArray(e)) events.push(e); } catch { }
  };
  for (const line of raw.split(/\r\n|\r|\n/)) { if (line === "") dispatch(); else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, "")); }
  dispatch();
  return events;
}
const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v) ?? "");
export const tokenCount = (n: unknown) => (Number.isSafeInteger(n) && (n as number) >= 0 ? (n as number) : undefined);

export function extract(api: Api, body: string, sse: boolean): Out {
  const o: Out = { text: "", toolCalls: [] };
  try {
    if (api === "openai-chat") {
      const tc: Record<string, { name: string; args: string }> = Object.create(null);
      for (const e of sse ? sseData(body) : [JSON.parse(body)]) {
        o.model ??= e.model; if (e.usage) o.usage = { input: e.usage.prompt_tokens, output: e.usage.completion_tokens, cached: e.usage.prompt_tokens_details?.cached_tokens };
        (Array.isArray(e.choices) ? e.choices : []).forEach((c: any, n: number) => { const m = c?.delta ?? c?.message ?? {};
          (Array.isArray(m.tool_calls) ? m.tool_calls : []).forEach((t: any, i: number) => { const k = `${c.index ?? n}:${t?.index ?? i}`; tc[k] ??= { name: "", args: "" };
            tc[k].name += t?.function?.name ?? ""; tc[k].args += t?.function?.arguments ?? ""; }); });
        const c = e.choices?.[0]; if (!c) continue; const m = c.delta ?? c.message ?? {};
        if (typeof m.content === "string") o.text += m.content;
        if (c.finish_reason) o.stop = c.finish_reason;
      }
      o.toolCalls = Object.values(tc);
    } else if (api === "openai-responses") {
      const final: any = sse ? undefined : JSON.parse(body);
      let last = final;
      const calls = new Map<string, { name: unknown; args: unknown }>(), outputOf = (r: any): any[] => (Array.isArray(r?.output) ? r.output : []);
      const call = (id: unknown) => { const k = String(id); if (!calls.has(k)) calls.set(k, { name: "", args: "" }); return calls.get(k)!; };
      const item = (i: any, at: unknown) => { const c = call(i.id ?? `#${at}`); c.name = i.name ?? c.name; if (i.arguments != null && i.arguments !== "") c.args = i.arguments; };
      const itemsOf = (r: any) => outputOf(r).forEach((i, n) => i?.type === "function_call" && item(i, n));
      if (sse) {
        for (const e of sseData(body)) {
          if (e.type === "response.output_text.delta") o.text += e.delta;
          if (e.type === "response.completed" || e.type === "response.incomplete" || e.type === "response.failed") { last = e.response; itemsOf(last); }
          if ((e.type === "response.output_item.added" || e.type === "response.output_item.done") && e.item?.type === "function_call") item(e.item, e.output_index);
          if (e.type === "response.function_call_arguments.delta") { const c = call(e.item_id); c.args = text(c.args) + (e.delta ?? ""); }
          if (e.type === "response.function_call_arguments.done" && typeof e.arguments === "string") call(e.item_id).args = e.arguments;
        }
      } else itemsOf(final);
      if (last) {
        o.model = last.model; o.stop = last.status;
        if (last.usage) o.usage = { input: last.usage.input_tokens, output: last.usage.output_tokens, cached: last.usage.input_tokens_details?.cached_tokens };
        if (!sse) o.text = outputOf(last).flatMap((i: any) => i?.type === "message" && Array.isArray(i.content) ? i.content.filter((c: any) => c?.type === "output_text").map((c: any) => c.text) : []).join("");
      }
      o.toolCalls = [...calls.values()].map((c) => ({ name: text(c.name), args: text(c.args) }));
    } else {
      type Block = { type: string; name?: string; text: string };
      const blocks: Block[] = [], open: Record<string, Block> = Object.create(null);
      if (sse) for (const e of sseData(body)) {
        if (e.type === "message_start") { o.model = e.message?.model; o.usage = { ...au(e.message?.usage), output: undefined }; }
        if (e.type === "content_block_start") blocks.push(open[e.index] = { type: e.content_block?.type, name: e.content_block?.name, text: e.content_block?.text ?? "" });
        if (e.type === "content_block_delta" && open[e.index]) open[e.index].text += e.delta?.text ?? e.delta?.partial_json ?? "";
        if (e.type === "message_delta") { o.stop = e.delta?.stop_reason; if (e.usage?.output_tokens != null) o.usage = { ...o.usage, output: e.usage.output_tokens }; }
      } else {
        const m = JSON.parse(body); o.model = m.model; o.stop = m.stop_reason; o.usage = au(m.usage);
        (Array.isArray(m.content) ? m.content : []).forEach((c: any) => blocks.push({ type: c?.type, name: c?.name, text: c?.type === "text" ? c.text : JSON.stringify(c?.input ?? {}) }));
      }
      for (const b of blocks) b.type === "text" ? (o.text += b.text) : b.type === "tool_use" && o.toolCalls.push({ name: b.name!, args: b.text });
    }
  } catch { }
  o.toolCalls = o.toolCalls.map((t) => ({ name: text(t.name), args: text(t.args) }));
  for (const k of ["model", "stop"] as const) if (k in o && typeof o[k] !== "string") o[k] = undefined;
  if (o.usage) o.usage = Object.fromEntries(Object.entries(o.usage).map(([k, n]) => [k, tokenCount(n)]));
  return o;
}
