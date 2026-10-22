import { canon, sha256 } from "./audit.js";
import { texts } from "./injection.js";
import type { Api } from "./extract.js";

export interface QuinelingEvent { where: "call" | "result"; op: string; path: string; sourceHash?: string; intentHash?: string; status?: string; error?: { code: string; path?: string } }
export const QUINELING_OPS: ReadonlySet<string> = new Set(["describe", "compile", "inspect", "verify", "recover", "frame", "run", "reproduce",
  "parse", "create", "annotate", "lineage", "offspring_preview", "offspring_frame", "offspring_admit", "world_create", "world_inspect", "world_command"]);
const TOOL = /(?:^|_)quineling_(?:v1_)?([a-z_]+)$/;
const SOURCE_HASH = /^ql_[0-9a-f]{64}$/, CODE = /^[a-z][a-z0-9-]{0,63}$/, QDL_PATH = /^\$[\w.[\]-]{0,255}$/;
const keep = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : undefined);

export function quinelingOp(name: unknown): string | undefined {
  const m = typeof name === "string" ? TOOL.exec(name) : null;
  return m ? (QUINELING_OPS.has(m[1]) ? m[1] : "other") : undefined;
}

function resultEvent(op: string | undefined, text: string, path: string): QuinelingEvent | undefined {
  if (!op && !text.includes('"qdl-run"') && !text.includes('"qdl-program"')) return undefined;
  let j: any;
  try { j = JSON.parse(text); } catch {
    if (!op) return undefined;
    const mcp = /^MCP error (-?\d{1,6})\b/.exec(text.trimStart());
    return { where: "result", op, path, error: { code: mcp ? `mcp${mcp[1]}` : "unreadable" } };
  }
  const r = j?.result, base: QuinelingEvent = { where: "result", op: op ?? "other", path };
  if (r?.result?.format === "qdl-run") {
    const sourceHash = keep(r.result.sourceHash, SOURCE_HASH), status = keep(r.result.status, CODE);
    return { ...base, ...(sourceHash && { sourceHash }), ...(status && { status }) };
  }
  if (r?.payload?.format === "qdl-program") { const sourceHash = keep(r.id, SOURCE_HASH); return { ...base, ...(sourceHash && { sourceHash }) }; }
  if (!op) return undefined;
  if (j?.error && typeof j.error === "object") {
    const errorPath = keep(j.error.path, QDL_PATH);
    return { ...base, error: { code: keep(j.error.code, CODE) ?? "unreadable", ...(errorPath && { path: errorPath }) } };
  }
  return base;
}

export function quinelingResults(api: Api, body: any): QuinelingEvent[] {
  const out: QuinelingEvent[] = [];
  const scan = (op: string | undefined, content: unknown, path: string) => texts(content, path).forEach(([t, p]) => { const e = resultEvent(op, t, p); if (e) out.push(e); });
  if (api === "openai-responses") {
    const items: any[] = Array.isArray(body?.input) ? body.input : [];
    const names = new Map(items.filter((x) => x?.type === "function_call").map((x) => [x.call_id, x.name]));
    let start = items.length;
    while (start > 0 && (items[start - 1]?.type === "function_call_output" || items[start - 1]?.type === "function_call")) start--;
    for (let i = start; i < items.length; i++) if (items[i].type === "function_call_output") scan(quinelingOp(names.get(items[i].call_id)), items[i].output, `$.input[${i}].output`);
    return out;
  }
  const msgs: any[] = Array.isArray(body?.messages) ? body.messages : [];
  let last = msgs.length - 1;
  while (last >= 0 && msgs[last]?.role !== "assistant") last--;
  const calls: [unknown, unknown][] = last < 0 ? [] : api === "openai-chat"
    ? (Array.isArray(msgs[last].tool_calls) ? msgs[last].tool_calls : []).map((c: any) => [c?.id, c?.function?.name])
    : (Array.isArray(msgs[last].content) ? msgs[last].content : []).filter((b: any) => b?.type === "tool_use").map((b: any) => [b.id, b.name]);
  const names = new Map(calls);
  for (let i = last + 1; i < msgs.length; i++) {
    const m = msgs[i];
    if (api === "openai-chat") { if (m?.role === "tool" || m?.role === "function") scan(quinelingOp(names.get(m.tool_call_id) ?? m.name), m.content, `$.messages[${i}].content`); }
    else if (Array.isArray(m?.content)) m.content.forEach((b: any, j: number) => { if (b?.type === "tool_result") scan(quinelingOp(names.get(b.tool_use_id)), b.content, `$.messages[${i}].content[${j}].content`); });
  }
  return out;
}

export function quinelingCalls(toolCalls: { name: string; args: string }[]): QuinelingEvent[] {
  return toolCalls.flatMap((t, i) => {
    const op = quinelingOp(t.name);
    if (!op) return [];
    let args: any;
    try { args = JSON.parse(t.args); } catch { }
    const intentHash = args?.intent && typeof args.intent === "object" ? sha256(canon(args.intent)) : undefined;
    const sourceHash = keep(args?.artifactId, SOURCE_HASH);
    return [{ where: "call" as const, op, path: `$.toolCalls[${i}]`, ...(intentHash && { intentHash }), ...(sourceHash && { sourceHash }) }];
  });
}
