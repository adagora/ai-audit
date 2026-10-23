import { createHash } from "node:crypto";
import BendParts from "./bend/parts.mjs";
import BendSpans from "./bend/spans.mjs";
import { bendList, bendListOf, fromBendList, type BendList } from "./context.js";

export type Mode = "redact" | "no-go" | "advisory";
export type Allowlist = Pick<ReadonlySet<string>, "has">;
interface Rule { readonly id: string; readonly re: RegExp; readonly group?: number; readonly keywords?: readonly string[]; readonly valid?: (m: string) => boolean; readonly field?: RegExp }
export const SCANNER_VERSION = "5";
const KEY_END = String.raw`(?![\w-])`, JWT_END = String.raw`(?![\w\/\\=-])`;

const pesel = (s: string) => {
  const d = [...s].map(Number), w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  return (10 - (w.reduce((a, x, i) => a + x * d[i], 0) % 10)) % 10 === d[10];
};
const IBAN_LENGTHS: Readonly<Record<string, number>> = Object.freeze({ AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27,
  HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, UA: 29 });
const mod97 = (iban: string) => {
  const s = iban.replace(/ /g, ""), r = s.slice(4) + s.slice(0, 4);
  if (s.length < 15 || s.length > 34 || s.length !== (IBAN_LENGTHS[s.slice(0, 2)] ?? s.length)) return false;
  const digits = [...r].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  let m = 0; for (const ch of digits) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
};
const NAME_PREFIX = String.raw`(?:(?=[A-Za-z])(?<!(?:^|[^A-Za-z0-9_])[A-Za-z][\w.-]*?)[A-Za-z][\w.-]*?)?`;
const NAMED = String.raw`(?:pass(?:word|wd|phrase)|secret|private[_.-]?key|api[_.-]?key|access[_.-]?key|(?<!(?:page|next|cursor|continuation|sync)[_.-]?)token)`;
const literal = (v: string) => v.length >= 6 && !/\s/.test(v) && !/^[$<{]|[([]/.test(v) && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(v);
const DB_SCHEME = String.raw`\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|mssql|sqlserver|cockroachdb):\/\/`;
const databaseCredentials = (uri: string) => {
  const authority = uri.slice(uri.indexOf("://") + 3).split(/[/?#]/, 1)[0];
  const at = authority.lastIndexOf("@");
  if (at >= 0 && authority.slice(0, at).replace(/\[REDACTED:[\w-]+\]/g, "").includes(":")) return true;
  const query = uri.indexOf("?");
  if (query < 0) return false;
  return uri.slice(query + 1).split("#", 1)[0].split("&")
    .some((pair) => pair.includes("=") && [...new URLSearchParams(pair)].some(([key, value]) => /^(?:password|passwd|pwd)$/i.test(key) && value.length > 0));
};

const definitions: Rule[] = [
  { id: "aws-access-token", re: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/g, group: 1, keywords: ["a3t", "akia", "asia", "abia", "acca"] },
  { id: "aws-secret-access-key", re: /(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}[\s"',:;|/=]{1,4}([A-Za-z0-9/+]{40})(?![A-Za-z0-9/+=])/g, group: 1, keywords: ["a3t", "akia", "asia", "abia", "acca"] },
  { id: "aws-secret-access-key", re: /(?<![A-Za-z0-9])(?:aws[_.-]?)?secret[_.-]?access[_.-]?key\b[\\"'\s]*[:=][\\"'\s]*((?:[A-Za-z0-9/+=]|%2[FB]|%3D){40})(?![A-Za-z0-9/+=]|%[0-9A-F]{2})/gi, group: 1, field: /^(?:aws[_.-]?)?secret[_.-]?access[_.-]?key$/i },
  { id: "aws-session-token", re: /(?<![A-Za-z0-9])(?:aws[_.-]?)?session[_.-]?token\b[\\"'\s]*[:=][\\"'\s]*((?:[A-Za-z0-9/+=]|%2[FB]|%3D){16,})(?![A-Za-z0-9/+=]|%[0-9A-F]{2})/gi, group: 1, field: /^(?:aws[_.-]?)?session[_.-]?token$/i },
  { id: "presigned-url-credential", re: /[?&]X-Amz-Security-Token=([A-Za-z0-9%+/=_.~-]{16,})/gi, group: 1, keywords: ["x-amz-security-token"] },
  { id: "presigned-url-credential", re: /[?&]X-(?:Amz|Goog)-Signature=([0-9a-f]{16,})/gi, group: 1, keywords: ["x-amz-signature", "x-goog-signature"] },
  { id: "database-credentials", re: new RegExp(String.raw`${DB_SCHEME}(?:(?!${DB_SCHEME})[^\s<>"'\x60])+`, "gi"), valid: databaseCredentials },
  { id: "database-credentials", re: /(?<![\w.-])[\w.-]+:[^\s@/"'`;[\]]{1,256}@(?:tcp|unix)\([^)\s]{0,260}\)/g, keywords: ["@tcp(", "@unix("] },
  { id: "database-password", re: /(?<![A-Za-z0-9])(?:PGPASSWORD|MYSQL_PWD|(?:db|database)[_.-]?password)\b[\\"'\s]*[:=]\s*(["'])((?:\\.|(?!\1)[^\\\r\n])+)\1/gi, group: 2 },
  { id: "database-password", re: /(?<![A-Za-z0-9])(?:PGPASSWORD|MYSQL_PWD|(?:db|database)[_.-]?password)\b[\\"'\s]*[:=]\s*([^\s\\"'`;]+)/gi, group: 1, field: /^(?:PGPASSWORD|MYSQL_PWD|(?:db|database)[_.-]?password)$/i },
  { id: "credential-client-secret", re: /(?<![A-Za-z0-9])client[_.-]?secret\b[\\"'\s]*[:=][\\"'\s]*([A-Za-z0-9_./+~=-]{8,})/gi, group: 1, field: /^client[_.-]?secret$/i },
  { id: "credential-refresh-token", re: /(?<![A-Za-z0-9])refresh[_.-]?token\b[\\"'\s]*[:=][\\"'\s]*([A-Za-z0-9_./+~=-]{8,})/gi, group: 1, field: /^refresh[_.-]?token$/i },
  { id: "azure-ad-client-secret", re: /(?<![a-zA-Z0-9_~.-])([a-zA-Z0-9_~.]{3}\dQ~[a-zA-Z0-9_~.-]{31,34})(?![a-zA-Z0-9_~-])/g, group: 1, keywords: ["q~"] },
  { id: "github-pat", re: /ghp_[0-9a-zA-Z]{36}/g, keywords: ["ghp_"] },
  { id: "github-fine-grained-pat", re: /github_pat_\w{82}/g, keywords: ["github_pat_"] },
  { id: "github-app-token", re: /(?:ghu|ghs)_[0-9a-zA-Z]{36}/g, keywords: ["ghu_", "ghs_"] },
  { id: "github-oauth", re: /gho_[0-9a-zA-Z]{36}/g, keywords: ["gho_"] },
  { id: "github-refresh-token", re: /ghr_[0-9a-zA-Z]{36}/g, keywords: ["ghr_"] },
  { id: "openai-api-key", re: new RegExp(String.raw`\b(sk-(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})\b|sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20})${KEY_END}`, "g"), group: 1, keywords: ["t3blbkfj"] },
  { id: "anthropic-api-key", re: new RegExp(String.raw`\b(sk-ant-api03-[a-zA-Z0-9_\-]{93}AA)${KEY_END}`, "g"), group: 1, keywords: ["sk-ant-api03"] },
  { id: "anthropic-admin-api-key", re: new RegExp(String.raw`\b(sk-ant-admin01-[a-zA-Z0-9_\-]{93}AA)${KEY_END}`, "g"), group: 1, keywords: ["sk-ant-admin01"] },
  { id: "openrouter-api-key", re: new RegExp(String.raw`\b(sk-or-v1-[a-fA-F0-9]{64})${KEY_END}`, "g"), group: 1, keywords: ["sk-or-v1-"] },
  { id: "xai-api-key", re: new RegExp(String.raw`\b(xai-[A-Za-z0-9]{40,})${KEY_END}`, "g"), group: 1, keywords: ["xai-"] },
  { id: "gcp-api-key", re: new RegExp(String.raw`\b(AIza[\w-]{35})${KEY_END}`, "g"), group: 1, keywords: ["aiza"] },
  { id: "stripe-access-token", re: new RegExp(String.raw`\b((?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99})${KEY_END}`, "g"), group: 1, keywords: ["sk_test", "sk_live", "sk_prod", "rk_test", "rk_live", "rk_prod"] },
  { id: "private-key", re: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\s\S-]{64,}?KEY(?: BLOCK)?-----/gi, keywords: ["-----begin"], field: /^private[_.-]?key(?:[_.-]?data)?$/i },
  { id: "jwt", re: new RegExp(String.raw`\b(ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9\/\\_-]{17,}\.(?:[a-zA-Z0-9\/\\_-]{10,}={0,2})?)${JWT_END}`, "g"), group: 1, keywords: ["ey"] },
  { id: "slack-bot-token", re: /xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g, keywords: ["xoxb"] },
  { id: "slack-user-token", re: /xox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}/g, keywords: ["xoxp-", "xoxe-"] },
  { id: "slack-webhook-url", re: /(?:https?:\/\/)?hooks.slack.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g, keywords: ["hooks.slack.com"] },
  { id: "pii-email", re: /(?:(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+|[A-Za-z0-9._%+-]{1,64})@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, keywords: ["@"] },
  { id: "pii-iban", re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g, valid: mod97 },
  { id: "pii-iban", re: /(?<![\w-])\d{2}(?: ?\d{4}){6}(?![\w-])/g, valid: (m) => mod97("PL" + m.replace(/ /g, "")) },
  { id: "pii-pesel", re: /(?<!\d)\d{11}(?!\d)/g, valid: pesel },
  { id: "pii-phone", re: /(?<![\w+.])(?:\+|00)\d{2,3}[ -]?\d{2,4}(?:[ -]?\d{2,4}){2,3}(?![\w])/g },
  { id: "pii-phone", re: /(?<![\w.,-])\d{3}[ -]\d{3}[ -]\d{3}(?![\w.,-])/g },
  { id: "named-credential", re: new RegExp(String.raw`(?<![A-Za-z0-9_])${NAME_PREFIX}${NAMED}["']?\s*[:=]\s*(["'])((?:(?!\1)[^\\\r\n]){6,})\1`, "gi"), group: 2, valid: literal, field: new RegExp(String.raw`${NAMED}$`, "i") },
  { id: "named-credential", re: new RegExp(String.raw`(?<![A-Za-z0-9_])${NAME_PREFIX}${NAMED}["']?\s*[:=]\s*([^\s"'\x60;,&<>]{8,})`, "gi"), group: 1, valid: (v) => literal(v) && /\d/.test(v) },
];
export const RULES: readonly Rule[] = Object.freeze(definitions.map((r) => Object.freeze({ ...r,
  re: Object.freeze(r.re), field: r.field && Object.freeze(r.field), keywords: r.keywords && Object.freeze([...r.keywords]) })));

export const RULES_DIGEST = createHash("sha256").update(JSON.stringify({
  version: SCANNER_VERSION, validators: [pesel.toString(), mod97.toString(), literal.toString()], ibanLengths: IBAN_LENGTHS,
  rules: RULES.map((r) => ({ id: r.id, source: r.re.source, flags: r.re.flags, group: r.group,
    keywords: r.keywords, valid: r.valid?.toString(), field: r.field && [r.field.source, r.field.flags] })),
})).digest("hex");

export interface Finding { rule: string; path: string; inKey?: boolean; unredactable?: boolean }
export interface Span { start: number; end: number; matchStart: number; matchEnd: number; rule: string; value: string }

const allowed = (value: string, carnet?: Allowlist) => carnet?.has(createHash("sha256").update(value).digest("hex")) === true;
const validBeforeSpace = (r: Rule, text: string, start: number, end: number) => {
  const match = text.slice(start, end);
  if (match.lastIndexOf(" ") <= 0) return undefined;
  const whole = new RegExp(`^(?:${r.re.source})$`, r.re.flags.replace("g", ""));
  for (let cut = match.lastIndexOf(" "); cut > 0; cut = match.lastIndexOf(" ", cut - 1))
    if (whole.test(match.slice(0, cut)) && r.valid!(match.slice(0, cut))) return start + cut;
  return undefined;
};
export function scanText(text: string, carnet?: Allowlist): Span[] {
  const lower = text.toLowerCase(), spans: Span[] = [];
  for (const r of RULES) {
    if (r.keywords && !r.keywords.some((k) => lower.includes(k))) continue;
    const re = new RegExp(r.re.source, r.re.flags.includes("d") ? r.re.flags : r.re.flags + "d");
    for (let m = re.exec(text); m; m = re.exec(text)) {
      let [s, e] = m.indices![r.group ?? 0]!, [matchStart, matchEnd] = m.indices![0]!;
      if (/^\[REDACTED:[\w-]+\]$/.test(text.slice(s, e))) continue;
      if (r.valid && !r.valid(text.slice(s, e))) {
        const cut = r.group === undefined ? validBeforeSpace(r, text, matchStart, matchEnd) : undefined;
        if (cut === undefined) continue;
        e = matchEnd = re.lastIndex = cut;
      }
      const value = text.slice(s, e);
      if (allowed(value, carnet)) continue;
      spans.push({ start: s, end: e, matchStart, matchEnd, rule: r.id, value });
    }
  }
  if (lower.includes("ey")) for (const m of text.matchAll(/(?<![\w\-\/\\.=])(?=([\w\-\/\\.=]*))\1(?<=ey[\w\-\/\\.=]*)(?:\s+[\w\-\/\\.=]{8,}(?![\w\-\/\\.=]))+/g)) {
    const at: number[] = []; let joined = "";
    [...m[0]].forEach((c, i) => { if (!/\s/.test(c)) { at.push(m.index! + i); joined += c; } });
    for (const j of joined.matchAll(/(?<![a-zA-Z0-9])(?=[a-zA-Z0-9]*\.)(?=([a-zA-Z0-9]*?)ey[a-zA-Z0-9]{17,}\.)\1(ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9\/\\_-]{17,}\.(?:[a-zA-Z0-9\/\\_-]{10,}={0,2})?)/g)) {
      const from = j.index! + j[1].length, start = at[from], end = at[from + j[2].length - 1] + 1;
      if (!allowed(j[2], carnet)) spans.push({ start, end, matchStart: start, matchEnd: end, rule: "jwt", value: j[2] });
    }
  }
  return mergeSpans(text, spans);
}

type BendGroup = { start: number; end: number; ms: number; me: number; first: number; grown: boolean };

export function mergeSpans(text: string, spans: Span[]): Span[] {
  if (spans.length < 2) return spans.map((s) => ({ start: s.start, end: s.end, matchStart: s.matchStart, matchEnd: s.matchEnd, rule: s.rule, value: s.value }));
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const groups = fromBendList(BendSpans.merge(bendListOf(sorted, (s, id) => ({ $: "Raw", start: s.start, end: s.end, ms: s.matchStart, me: s.matchEnd, id }))) as BendList<BendGroup>);
  return groups.map((g) => {
    const first = sorted[g.first];
    return { start: g.start, end: g.end, matchStart: g.ms, matchEnd: g.me, rule: first.rule, value: g.grown ? text.slice(g.start, g.end) : first.value };
  });
}

export const redactText = (text: string, spans: Span[]) =>
  spans.map((s, i) => `${text.slice(i ? spans[i - 1].end : 0, s.start)}[REDACTED:${s.rule}]`).join("") + text.slice(spans.at(-1)?.end ?? 0);

const MASKING_PASSES = 4;
const isPayload = (s: string) => /^data:[\w.+-]+\/[\w.+-]+(?:;[^,]*)?;base64,/.test(s);
const outsideStrings = (json: string) => json.replace(/"(?:[^"\\]|\\.)*"/g, (s) => `"${" ".repeat(s.length - 2)}"`);
function maskOnce(v: string, carnet: Allowlist | undefined, path: string, findings: Finding[]): string {
  if (/^\s*[\[{]/.test(v)) {
    let parsed: unknown;
    try { parsed = JSON.parse(v); } catch { }
    if (parsed && typeof parsed === "object") {
      if (hasDuplicateKeys(v)) {
        findings.push({ rule: "ambiguous-json", path, unredactable: true });
        return v;
      }
      const nested = inspect(parsed, carnet, `${path}#json`), json = nested.findings.length ? JSON.stringify(nested.value) : v;
      const spans = scanText(outsideStrings(json), carnet);
      findings.push(...nested.findings); spans.forEach((s) => findings.push({ rule: s.rule, path }));
      return spans.length ? redactText(json, spans) : json;
    }
  }
  const spans = scanText(v, carnet); spans.forEach((s) => findings.push({ rule: s.rule, path }));
  return spans.length ? redactText(v, spans) : v;
}

export function inspect(v: unknown, carnet?: Allowlist, path = "$", findings: Finding[] = [], payload = false): { value: unknown; findings: Finding[] } {
  if (typeof v === "string") {
    if (payload || isPayload(v)) return { value: v, findings };
    let value = v;
    for (let pass = 0; ; pass++) {
      const found: Finding[] = [], masked = maskOnce(value, carnet, path, found);
      findings.push(...found.map((f) => (pass < MASKING_PASSES ? f : { ...f, unredactable: true })));
      if (!found.length) return { value, findings };
      value = masked;
      if (pass === MASKING_PASSES || found.some((f) => f.inKey || f.unredactable)) return { value, findings };
    }
  }
  if (Array.isArray(v)) return { value: joinParts(v, carnet, path, findings).map((x, i) => inspect(x, carnet, `${path}[${i}]`, findings).value), findings };
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const keySpans = scanText(k, carnet), nextPath = `${path}.${keySpans.length ? "<key>" : k}`;
      keySpans.forEach((s) => findings.push({ rule: s.rule, path: `${path}.<key>`, inKey: true }));
      const binary = k === "data" && (v as any).type === "base64";
      const field = typeof x === "string" && x.length && !binary && !isPayload(x) && !/^\[REDACTED:[\w-]+\]$/.test(x) && !allowed(x, carnet)
        ? RULES.find((r) => r.field?.test(k) && (!r.valid || r.valid(x))) : undefined;
      if (field) findings.push({ rule: field.id, path: nextPath });
      const value = field ? `[REDACTED:${field.id}]` : inspect(x, carnet, nextPath, findings, binary).value;
      Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
    }
    return { value: o, findings };
  }
  return { value: v, findings };
}

const lastWhere = (n: number, ok: (i: number) => boolean) => {
  let lo = 0, hi = n - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ok(mid)) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found;
};
export type SpanRange = Pick<Span, "start" | "end" | "matchStart" | "matchEnd">;
export const takenAcrossParts = (starts: number[], spans: SpanRange[]): boolean[] =>
  fromBendList(BendParts["taken.fast"](bendList(starts.slice(1)), bendListOf(spans, (s) => ({ $: "Span", start: s.start, end: s.end, ms: s.matchStart, me: s.matchEnd }))) as BendList<{ t: boolean }>).map((m) => m.t);

function joinParts(arr: unknown[], carnet: Allowlist | undefined, path: string, findings: Finding[]): unknown[] {
  const idx: number[] = [], texts: string[] = [];
  arr.forEach((x: any, i) => { const t = typeof x === "string" ? x : x && typeof x === "object" && typeof x.text === "string" ? x.text : undefined; if (t !== undefined && !isPayload(t)) { idx.push(i); texts.push(t); } });
  if (texts.length < 2) return arr;
  const starts: number[] = []; let joined = ""; texts.forEach((t) => { starts.push(joined.length); joined += t; });
  const part = (pos: number) => lastWhere(starts.length, (k) => starts[k] <= pos);
  const spans = scanText(joined, carnet), taken = takenAcrossParts(starts, spans);
  const cross = spans.filter((_, i) => taken[i]);
  if (!cross.length) return arr;
  const out = arr.slice(), next = texts.slice();
  for (const s of cross.reverse()) {
    const a = part(s.start), b = part(s.end - 1), first = idx[part(s.matchStart)], last = idx[part(s.matchEnd - 1)];
    findings.push({ rule: s.rule, path: first === last ? `${path}[${first}]` : `${path}[${first}..${last}]` });
    for (let k = b; k >= a; k--) {
      const from = Math.max(s.start - starts[k], 0), to = Math.min(s.end - starts[k], texts[k].length);
      next[k] = next[k].slice(0, from) + (k === a ? `[REDACTED:${s.rule}]` : "") + next[k].slice(to);
    }
  }
  idx.forEach((i, k) => { out[i] = typeof out[i] === "string" ? next[k] : { ...(out[i] as object), text: next[k] }; });
  return out;
}

export function hasDuplicateKeys(t: string): boolean {
  const stack: { keys?: Set<string>; expectKey?: boolean }[] = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') {
      let j = i + 1; while (t[j] !== '"') j += t[j] === "\\" ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top?.keys && top.expectKey) { const k = JSON.parse(t.slice(i, j + 1)); if (top.keys.has(k)) return true; top.keys.add(k); top.expectKey = false; }
      i = j;
    } else if (c === "{") stack.push({ keys: new Set(), expectKey: true });
    else if (c === "[") stack.push({});
    else if (c === "}" || c === "]") stack.pop();
    else if (c === ",") { const top = stack[stack.length - 1]; if (top?.keys) top.expectKey = true; }
  }
  return false;
}

export type Decision = { action: "forward-original" | "forward-redacted" | "block"; findings: Finding[]; status?: number; code?: string };
export function decide(mode: Mode, findings: Finding[]): Decision {
  if (!findings.length || mode === "advisory") return { action: "forward-original", findings };
  if (mode === "no-go") return { action: "block", findings, status: 409, code: "audit_findings_blocked" };
  if (findings.some((f) => f.inKey || f.unredactable)) return { action: "block", findings, status: 409, code: "audit_unredactable_finding" };
  return { action: "forward-redacted", findings };
}
