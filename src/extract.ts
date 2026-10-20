// Pull the audit-relevant bits (text, tool calls, usage, model) out of provider responses, JSON or SSE.
export type Api = "openai-chat" | "openai-responses" | "anthropic-messages";
export interface Usage { input?: number; output?: number; cached?: number; cacheWrite?: number }
const au = (u: any): Usage => ({ input: u?.input_tokens, output: u?.output_tokens, cached: u?.cache_read_input_tokens, cacheWrite: u?.cache_creation_input_tokens });
export interface Out { model?: string; text: string; toolCalls: { name: string; args: string }[]; usage?: Usage; stop?: string }

const sseData = (raw: string) => raw.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim())
  .filter((d) => d && d !== "[DONE]").flatMap((d) => { try { return [JSON.parse(d)]; } catch { return []; } });

export function extract(api: Api, body: string, sse: boolean): Out {
  const o: Out = { text: "", toolCalls: [] };
  try {
    if (api === "openai-chat") {
      const tc: Record<number, { name: string; args: string }> = {};
      for (const e of sse ? sseData(body) : [JSON.parse(body)]) {
        o.model ??= e.model; if (e.usage) o.usage = { input: e.usage.prompt_tokens, output: e.usage.completion_tokens, cached: e.usage.prompt_tokens_details?.cached_tokens };
        const c = e.choices?.[0]; if (!c) continue; const m = c.delta ?? c.message ?? {};
        if (typeof m.content === "string") o.text += m.content;
        (m.tool_calls ?? []).forEach((t: any, i: number) => { const k = t.index ?? i; tc[k] ??= { name: "", args: "" };
          tc[k].name += t.function?.name ?? ""; tc[k].args += t.function?.arguments ?? ""; });
        if (c.finish_reason) o.stop = c.finish_reason;
      }
      o.toolCalls = Object.values(tc);
    } else if (api === "openai-responses") {
      let final: any = sse ? undefined : JSON.parse(body);
      if (sse) for (const e of sseData(body)) {
        if (e.type === "response.output_text.delta") o.text += e.delta;
        if (e.type === "response.completed" || e.type === "response.incomplete" || e.type === "response.failed") final = e.response;
      }
      if (final) {
        o.model = final.model; o.stop = final.status;
        if (final.usage) o.usage = { input: final.usage.input_tokens, output: final.usage.output_tokens, cached: final.usage.input_tokens_details?.cached_tokens };
        const items = final.output ?? [];
        if (!sse) o.text = items.flatMap((i: any) => i.type === "message" ? i.content.filter((c: any) => c.type === "output_text").map((c: any) => c.text) : []).join("");
        o.toolCalls = items.filter((i: any) => i.type === "function_call").map((i: any) => ({ name: i.name, args: i.arguments ?? "" }));
      }
    } else {
      const blocks: Record<number, { type: string; name?: string; text: string }> = {};
      if (sse) for (const e of sseData(body)) {
        if (e.type === "message_start") { o.model = e.message.model; o.usage = au(e.message.usage); }
        if (e.type === "content_block_start") blocks[e.index] = { type: e.content_block.type, name: e.content_block.name, text: e.content_block.text ?? "" };
        if (e.type === "content_block_delta") blocks[e.index].text += e.delta.text ?? e.delta.partial_json ?? "";
        if (e.type === "message_delta") { o.stop = e.delta?.stop_reason; if (e.usage?.output_tokens != null) o.usage = { ...o.usage, output: e.usage.output_tokens }; }
      } else {
        const m = JSON.parse(body); o.model = m.model; o.stop = m.stop_reason; o.usage = au(m.usage);
        (m.content ?? []).forEach((c: any, i: number) => (blocks[i] = { type: c.type, name: c.name, text: c.type === "text" ? c.text : JSON.stringify(c.input ?? {}) }));
      }
      for (const b of Object.values(blocks)) b.type === "text" ? (o.text += b.text) : b.type === "tool_use" && o.toolCalls.push({ name: b.name!, args: b.text });
    }
  } catch { /* unparseable upstream body: log what we have, never fail the response */ }
  return o;
}
