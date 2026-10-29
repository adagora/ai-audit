import type { Api } from "./extract.js";
import { scanText, type Allowlist } from "./scan.js";

export type GateMode = "observe" | "enforce";
export interface GateTool { readonly mode: GateMode; readonly arguments: readonly string[]; readonly allow: readonly string[] }
export interface ActionGate { readonly tools: Readonly<Record<string, GateTool>> }
export interface KeyTools { readonly mode: GateMode; readonly allow: readonly string[] }
export type AtomKind = "host" | "email" | "phone" | "iban" | "finding" | "unparsed";
export type Origin = "user" | "system" | "untrusted" | "none" | "unknown";
export interface AtomResult { path: string; kind: AtomKind; origin?: Origin; source?: string; allowed: boolean; result: "pass" | "hold" }
export interface CallResult { tool: string; index: number; mode: GateMode; result: "pass" | "hold"; toolAllowed?: false; atoms: AtomResult[] }
export interface RequestTexts { user: string[]; system: string[]; untrusted: [string, string][]; providerHistory: boolean }

const ARGUMENT_PATH = /^\$(?:\.[A-Za-z0-9_-]+)*$/;
const DESTINATION_RULES: Readonly<Record<string, AtomKind>> = { "pii-email": "email", "pii-phone": "phone", "pii-iban": "iban" };
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/?#@]*@)?(\[[^\]\s]+\]|[^\s/?#:\]"'<>]+)/gi;
const HOSTNAME = /^(?:[a-z0-9-]+\.)+[a-z]{2,}\.?$/i;
const HOST_CHAR = /[a-z0-9-]/i, HOST_PREFIX_CHAR = /[a-z0-9.-]/i, EMAIL_PREFIX_CHAR = /[a-z0-9._%+-]/i;
const digits = (s: string) => s.replace(/\D/g, "");
const compact = (s: string) => s.replace(/\s/g, "").toUpperCase();
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function validateActionGate(value: unknown): ActionGate {
  const invalid = () => new Error("audit_action_gate_invalid");
  if (!record(value) || Object.keys(value).some((k) => k !== "tools") || !record(value.tools) || !Object.keys(value.tools).length) throw invalid();
  const tools: Record<string, GateTool> = {};
  for (const name of Object.keys(value.tools).sort()) {
    const t = value.tools[name];
    if (!name || !record(t) || Object.keys(t).some((k) => !["mode", "arguments", "allow"].includes(k)) || (t.mode !== "observe" && t.mode !== "enforce")
      || !Array.isArray(t.arguments) || !t.arguments.length || t.arguments.some((p) => typeof p !== "string" || !ARGUMENT_PATH.test(p))
      || (t.allow !== undefined && (!Array.isArray(t.allow) || t.allow.some((e) => typeof e !== "string" || !e.trim() || e.length > 256)))) throw invalid();
    tools[name] = Object.freeze({ mode: t.mode, arguments: Object.freeze([...t.arguments as string[]]), allow: Object.freeze(((t.allow ?? []) as string[]).map((e) => e.trim().toLowerCase())) });
  }
  return Object.freeze({ tools: Object.freeze(tools) });
}

export function validateKeyTools(value: unknown): KeyTools {
  if (!record(value) || Object.keys(value).some((k) => k !== "mode" && k !== "allow") || (value.mode !== "observe" && value.mode !== "enforce")
    || !Array.isArray(value.allow) || !value.allow.length || value.allow.some((e) => typeof e !== "string" || !e.trim() || e.length > 128 || e.trim() === "*")) throw new Error("audit_key_tools_invalid");
  return Object.freeze({ mode: value.mode, allow: Object.freeze((value.allow as string[]).map((e) => e.trim())) });
}

export const enforces = (gate?: ActionGate, tools?: KeyTools) => tools?.mode === "enforce" || Object.values(gate?.tools ?? {}).some((t) => t.mode === "enforce");

const toolAllowed = (tools: KeyTools, name: string) => tools.allow.some((e) => e.endsWith("*") ? name.startsWith(e.slice(0, -1)) : e === name);

function strings(v: unknown, path: string, out: [string, string][], skipPayloads: boolean): [string, string][] {
  if (typeof v === "string") { if (!skipPayloads || !v.startsWith("data:")) out.push([v, path]); }
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out, skipPayloads));
  else if (record(v)) for (const [k, x] of Object.entries(v)) if (!skipPayloads || (k !== "data" && k !== "file_data")) strings(x, `${path}.${k}`, out, skipPayloads);
  return out;
}

export function requestTexts(api: Api, body: any): RequestTexts {
  const t: RequestTexts = { user: [], system: [], untrusted: [], providerHistory: false };
  const trusted = (into: "user" | "system", v: unknown, path: string) => strings(v, path, [], true).forEach(([s]) => t[into].push(s));
  const untrusted = (v: unknown, path: string) => strings(v, path, t.untrusted, true);
  if (body?.tools !== undefined) untrusted(body.tools, "$.tools");
  const roles = (items: unknown, base: string, userBlocks: boolean) => Array.isArray(items) && items.forEach((m: any, i: number) => {
    const path = `${base}[${i}]`, message = m?.type === undefined || m?.type === "message";
    if (message && (m?.role === "system" || m?.role === "developer")) trusted("system", m.content, `${path}.content`);
    else if (message && m?.role === "user" && userBlocks && Array.isArray(m.content)) m.content.forEach((b: any, j: number) =>
      b?.type === "text" ? trusted("user", b.text, `${path}.content[${j}].text`) : untrusted(b, `${path}.content[${j}]`));
    else if (message && m?.role === "user") trusted("user", m.content, `${path}.content`);
    else untrusted(m, path);
  });
  if (api === "openai-responses") {
    t.providerHistory = body?.previous_response_id !== undefined || body?.conversation !== undefined;
    if (body?.instructions !== undefined) trusted("system", body.instructions, "$.instructions");
    if (typeof body?.input === "string") t.user.push(body.input);
    else roles(body?.input, "$.input", false);
  } else {
    if (api === "anthropic-messages" && body?.system !== undefined) trusted("system", body.system, "$.system");
    roles(body?.messages, "$.messages", api === "anthropic-messages");
  }
  return t;
}

function atomsIn(value: string, carnet?: Allowlist): [AtomKind, string][] {
  const atoms = new Map<string, [AtomKind, string]>();
  const add = (kind: AtomKind, atom: string) => atoms.set(`${kind}\0${atom}`, [kind, atom]);
  for (const span of scanText(value, carnet)) {
    const kind = DESTINATION_RULES[span.rule] ?? "finding";
    add(kind, kind === "email" ? span.value.toLowerCase() : span.value);
  }
  for (const m of value.matchAll(URL_HOST)) add("host", m[1].toLowerCase().replace(/\.$/, ""));
  if (HOSTNAME.test(value.trim())) add("host", value.trim().toLowerCase().replace(/\.$/, ""));
  return [...atoms.values()];
}

function mentions(text: string, kind: AtomKind, atom: string) {
  if (kind === "phone") return digits(text).includes(digits(atom));
  if (kind === "iban") return compact(text).includes(compact(atom));
  if (kind === "finding") return text.includes(atom);
  const hay = text.toLowerCase(), prefix = kind === "email" ? EMAIL_PREFIX_CHAR : HOST_PREFIX_CHAR;
  for (let i = hay.indexOf(atom); i !== -1; i = hay.indexOf(atom, i + 1)) {
    const before = hay[i - 1] ?? "", after = hay[i + atom.length] ?? "", next = hay[i + atom.length + 1] ?? "";
    if (!prefix.test(before) && !HOST_CHAR.test(after) && !(after === "." && HOST_CHAR.test(next))) return true;
  }
  return false;
}

function originOf(kind: AtomKind, atom: string, texts: RequestTexts): { origin: Origin; source?: string } {
  if (texts.user.some((s) => mentions(s, kind, atom))) return { origin: "user" };
  if (texts.system.some((s) => mentions(s, kind, atom))) return { origin: "system" };
  const hit = texts.untrusted.find(([s]) => mentions(s, kind, atom));
  return hit ? { origin: "untrusted", source: hit[1] } : { origin: texts.providerHistory ? "unknown" : "none" };
}

function allowed(kind: AtomKind, atom: string, allow: readonly string[]) {
  if (kind === "host") return allow.some((e) => e === atom || (e.startsWith("*.") && atom.endsWith(e.slice(1))));
  if (kind === "email") return allow.some((e) => e === atom || (e.startsWith("@") && atom.endsWith(e)));
  if (kind === "phone") return allow.some((e) => digits(e).length >= 7 && digits(e) === digits(atom));
  if (kind === "iban") return allow.some((e) => compact(e) === compact(atom));
  return false;
}

function destinationAtoms(tool: GateTool, rawArgs: string, texts: () => RequestTexts, carnet?: Allowlist): AtomResult[] {
  let args: unknown;
  try { args = rawArgs.trim() ? JSON.parse(rawArgs) : {}; } catch { args = undefined; }
  if (!record(args)) return [{ path: "$", kind: "unparsed", allowed: false, result: "hold" }];
  const atoms: AtomResult[] = [];
  for (const argument of tool.arguments) {
    const value = argument.split(".").slice(1).reduce<unknown>((v, key) => record(v) && Object.hasOwn(v, key) ? v[key] : undefined, args);
    for (const [text, path] of strings(value, argument, [], false)) for (const [kind, atom] of atomsIn(text, carnet)) {
      const isAllowed = allowed(kind, atom, tool.allow), { origin, source } = originOf(kind, atom, texts());
      atoms.push({ path, kind, origin, ...(source && { source }), allowed: isAllowed, result: kind !== "finding" && (isAllowed || origin === "user") ? "pass" : "hold" });
    }
  }
  return atoms;
}

export function checkActions(gate: ActionGate | undefined, keyTools: KeyTools | undefined, calls: { name: string; args: string }[], texts: () => RequestTexts, carnet?: Allowlist): CallResult[] {
  let seen: RequestTexts | undefined;
  const results: CallResult[] = [];
  calls.forEach((call, index) => {
    const tool = gate && Object.hasOwn(gate.tools, call.name) ? gate.tools[call.name] : undefined;
    const outsideKey = !!keyTools && !toolAllowed(keyTools, call.name);
    if (!tool && !outsideKey) return;
    const mode: GateMode = tool?.mode === "enforce" || (outsideKey && keyTools!.mode === "enforce") ? "enforce" : "observe";
    const atoms = tool ? destinationAtoms(tool, call.args, () => seen ??= texts(), carnet) : [];
    results.push({ tool: call.name, index, mode, result: outsideKey || atoms.some((a) => a.result === "hold") ? "hold" : "pass", ...(outsideKey && { toolAllowed: false as const }), atoms });
  });
  return results;
}
