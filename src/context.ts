import type { Api, Usage } from "./extract.js";

export const SEGMENTS = ["system", "tools", "user", "assistant", "toolResults", "attachments", "other"] as const;
export type Segment = (typeof SEGMENTS)[number];
export type SegmentBytes = Record<Segment, number>;
export interface ContextComposition {
  bytes: SegmentBytes;
  totalBytes: number;
  tokens?: Record<Segment, number>;
  tokenBasis: "provider-scaled" | "unknown";
  blocks?: ArenaBlock[];
}

const byteLength = (v: unknown) => v === undefined ? 0 : Buffer.byteLength(typeof v === "string" ? v : JSON.stringify(v), "utf8");
const emptyBytes = (): SegmentBytes => ({ system: 0, tools: 0, user: 0, assistant: 0, toolResults: 0, attachments: 0, other: 0 });
const ATTACHMENT_PART_TYPES = new Set(["image_url", "input_image", "input_file", "input_audio", "file", "image", "document"]);
const TOOL_RESULT_ROLES = new Set(["tool", "function"]);
const SYSTEM_ROLES = new Set(["system", "developer"]);

function roleSegment(role: unknown): Segment {
  if (typeof role !== "string") return "other";
  if (SYSTEM_ROLES.has(role)) return "system";
  if (TOOL_RESULT_ROLES.has(role)) return "toolResults";
  return role === "user" || role === "assistant" ? role : "other";
}

function addContent(acc: SegmentBytes, segment: Segment, content: unknown) {
  if (!Array.isArray(content)) { acc[segment] += byteLength(content); return; }
  for (const part of content) {
    const type = part && typeof part === "object" ? (part as { type?: unknown }).type : undefined;
    if (typeof type === "string" && ATTACHMENT_PART_TYPES.has(type)) acc.attachments += byteLength(part);
    else if (type === "tool_result") addContent(acc, "toolResults", (part as { content?: unknown }).content);
    else if (type === "tool_use" || type === "function_call") acc.assistant += byteLength(part);
    else acc[segment] += byteLength(part);
  }
}

function openaiChat(body: any, acc: SegmentBytes) {
  acc.tools += byteLength(body.tools) + byteLength(body.functions);
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    const segment = roleSegment(m?.role);
    addContent(acc, segment, m?.content);
    if (m?.tool_calls !== undefined) acc.assistant += byteLength(m.tool_calls);
    if (m?.function_call !== undefined) acc.assistant += byteLength(m.function_call);
  }
}

function openaiResponses(body: any, acc: SegmentBytes) {
  acc.tools += byteLength(body.tools);
  acc.system += byteLength(body.instructions);
  if (typeof body.input === "string") { acc.user += byteLength(body.input); return; }
  for (const item of Array.isArray(body.input) ? body.input : []) {
    if (item?.type === "function_call_output") acc.toolResults += byteLength(item.output);
    else if (item?.type === "function_call") acc.assistant += byteLength(item);
    else addContent(acc, roleSegment(item?.role), item?.content);
  }
}

function anthropicMessages(body: any, acc: SegmentBytes) {
  acc.tools += byteLength(body.tools);
  addContent(acc, "system", body.system);
  for (const m of Array.isArray(body.messages) ? body.messages : []) addContent(acc, roleSegment(m?.role), m?.content);
}

export interface ContextBlock { kind: Segment; bytes: number; value: unknown }
export type ArenaBlock = [kind: string, bytes: number, age: number];
export const KIND_CODES: Record<Segment, string> = { system: "s", tools: "t", user: "u", assistant: "a", toolResults: "r", attachments: "f", other: "o" };
export const KIND_BY_CODE = Object.fromEntries(Object.entries(KIND_CODES).map(([k, v]) => [v, k])) as Record<string, Segment>;

function pushParts(out: ContextBlock[], segment: Segment, content: unknown) {
  if (content === undefined || content === null) return;
  if (!Array.isArray(content)) { out.push({ kind: segment, bytes: byteLength(content), value: content }); return; }
  for (const part of content) {
    const type = part && typeof part === "object" ? (part as { type?: unknown }).type : undefined;
    if (typeof type === "string" && ATTACHMENT_PART_TYPES.has(type)) out.push({ kind: "attachments", bytes: byteLength(part), value: part });
    else if (type === "tool_result") pushParts(out, "toolResults", (part as { content?: unknown }).content);
    else if (type === "tool_use" || type === "function_call") out.push({ kind: "assistant", bytes: byteLength(part), value: part });
    else out.push({ kind: segment, bytes: byteLength(part), value: part });
  }
}

export function contextBlocks(api: Api, body: any): ContextBlock[] {
  const out: ContextBlock[] = [];
  if (!body || typeof body !== "object") return out;
  const tools = api === "openai-chat" ? [body.tools, body.functions].filter((t) => t !== undefined) : body.tools !== undefined ? [body.tools] : [];
  for (const t of tools) for (const def of Array.isArray(t) ? t : [t]) out.push({ kind: "tools", bytes: byteLength(def), value: def });
  if (api === "anthropic-messages") pushParts(out, "system", body.system);
  if (api === "openai-responses") {
    pushParts(out, "system", body.instructions);
    if (typeof body.input === "string") out.push({ kind: "user", bytes: byteLength(body.input), value: body.input });
    for (const item of Array.isArray(body.input) ? body.input : []) {
      if (item?.type === "function_call_output") out.push({ kind: "toolResults", bytes: byteLength(item.output), value: item });
      else if (item?.type === "function_call") out.push({ kind: "assistant", bytes: byteLength(item), value: item });
      else pushParts(out, roleSegment(item?.role), item?.content);
    }
    return out;
  }
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    pushParts(out, roleSegment(m?.role), m?.content);
    if (m?.tool_calls !== undefined) out.push({ kind: "assistant", bytes: byteLength(m.tool_calls), value: m.tool_calls });
    if (m?.function_call !== undefined) out.push({ kind: "assistant", bytes: byteLength(m.function_call), value: m.function_call });
  }
  return out;
}

export function composeContext(api: Api, body: unknown, rawBytes: number): ContextComposition {
  const bytes = emptyBytes();
  if (body && typeof body === "object") {
    if (api === "openai-chat") openaiChat(body, bytes);
    else if (api === "openai-responses") openaiResponses(body, bytes);
    else anthropicMessages(body, bytes);
  }
  const attributed = SEGMENTS.reduce((a, s) => a + bytes[s], 0);
  bytes.other += Math.max(0, rawBytes - attributed);
  return { bytes, totalBytes: SEGMENTS.reduce((a, s) => a + bytes[s], 0), tokenBasis: "unknown" };
}

export function promptTokens(api: Api, usage: Usage | undefined): number | undefined {
  if (usage?.input == null) return undefined;
  return api === "anthropic-messages" ? usage.input + (usage.cached ?? 0) + (usage.cacheWrite ?? 0) : usage.input;
}

export function scaleToProvider(c: ContextComposition, providerPromptTokens: number | undefined): ContextComposition {
  if (providerPromptTokens == null || c.bytes.attachments > 0) return c;
  const scaled = SEGMENTS.filter((s) => s !== "other");
  const textBytes = scaled.reduce((a, s) => a + c.bytes[s], 0);
  if (textBytes === 0) return c;
  const tokens = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<Segment, number>;
  const shares = scaled.map((s) => ({ s, exact: (providerPromptTokens * c.bytes[s]) / textBytes }));
  shares.forEach(({ s, exact }) => (tokens[s] = Math.floor(exact)));
  let remainder = providerPromptTokens - SEGMENTS.reduce((a, s) => a + tokens[s], 0);
  for (const { s } of [...shares].sort((a, b) => (b.exact % 1) - (a.exact % 1))) { if (remainder-- <= 0) break; tokens[s]++; }
  return { ...c, tokens, tokenBasis: "provider-scaled" };
}
