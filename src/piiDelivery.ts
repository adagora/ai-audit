import type { Api } from "./extract.js";

const list = (v: unknown): any[] => Array.isArray(v) ? v : [];
type Part = { value: string; set: (value: string) => void };
const field = (object: any, name: string): Part[] => typeof object?.[name] === "string" ? [{ value: object[name], set: (s) => { object[name] = s; } }] : [];
const message = (api: Api, j: any): Part[] => {
  if (api === "openai-chat") return list(j?.choices).flatMap((c) => field(c?.message, "content"));
  if (api === "anthropic-messages") return list(j?.content).filter((p) => p?.type === "text").flatMap((p) => field(p, "text"));
  return list(j?.output).filter((p) => p?.type === "message").flatMap((p) => list(p.content).filter((c) => c?.type === "output_text").flatMap((c) => field(c, "text")));
};

export function restorePiiResponse(api: Api, raw: string, sse: boolean, restore: (s: string) => string): string {
  if (!sse) {
    const body = JSON.parse(raw);
    for (const part of message(api, body)) part.set(restore(part.value));
    return JSON.stringify(body);
  }
  const groups = new Map<string, Part[]>();
  const add = (key: string, parts: Part[]) => groups.set(key, [...(groups.get(key) ?? []), ...parts]);
  let terminal = false;
  const events = raw.replace(/\r\n?/g, "\n").split("\n\n").filter((s) => s.trim()).map((event) => {
    const lines = event.split(/\r?\n/), payload = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
    const head = lines.filter((l) => !l.startsWith("data:")).join("\n");
    if (!payload) return { raw: event + "\n\n" };
    if (payload === "[DONE]") { terminal ||= api === "openai-chat"; return { raw: event + "\n\n" }; }
    const j = JSON.parse(payload);
    if (api === "openai-chat") for (const c of list(j.choices)) add(`chat:${c.index ?? 0}`, field(c?.delta, "content"));
    if (api === "anthropic-messages") {
      if (j.type === "content_block_start" && j.content_block?.type === "text") add(`block:${j.index}`, field(j.content_block, "text"));
      if (j.type === "content_block_delta" && j.delta?.type === "text_delta") add(`block:${j.index}`, field(j.delta, "text"));
      terminal ||= j.type === "message_stop";
    }
    if (api === "openai-responses") {
      if (j.type === "response.output_text.delta") add(`response:${j.output_index ?? 0}:${j.content_index ?? 0}`, field(j, "delta"));
      if (j.type === "response.output_text.done") for (const p of field(j, "text")) p.set(restore(p.value));
      if (["response.content_part.added", "response.content_part.done"].includes(j.type) && j.part?.type === "output_text") for (const p of field(j.part, "text")) p.set(restore(p.value));
      if (["response.output_item.added", "response.output_item.done"].includes(j.type)) for (const p of message(api, { output: [j.item] })) p.set(restore(p.value));
      if (["response.completed", "response.incomplete", "response.failed"].includes(j.type)) {
        terminal = true;
        for (const p of message(api, j.response)) p.set(restore(p.value));
      }
    }
    return { head, j };
  });
  if (!terminal) throw new Error("audit_pii_delivery_failed");
  for (const parts of groups.values()) {
    if (!parts.length) continue;
    const joined = parts.map((p) => p.value).join(""), restored = restore(joined);
    if (restored === joined) continue;
    parts[0].set(restored);
    for (const part of parts.slice(1)) part.set("");
  }
  return events.map((e) => e.raw ?? `${e.head ? e.head + "\n" : ""}data: ${JSON.stringify(e.j)}\n\n`).join("");
}

export async function readPiiResponse(up: Response, maxBytes: number): Promise<string> {
  const dec = new TextDecoder("utf-8", { fatal: true });
  let text = "", bytes = 0;
  if (up.body) for await (const chunk of up.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new Error("audit_pii_delivery_failed");
    text += dec.decode(chunk, { stream: true });
  }
  return text + dec.decode();
}
