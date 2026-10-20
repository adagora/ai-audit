// Whole-request secret + PII inspection. Pure: no I/O.
// Secret rule shapes are adapted from Gitleaks (MIT, (c) 2019 Zachary Rice); see THIRD_PARTY_NOTICES.md.
import { createHash } from "node:crypto";

export type Mode = "redact" | "no-go" | "advisory";
interface Rule { id: string; re: RegExp; group?: number; keywords?: string[]; valid?: (m: string) => boolean }
const END = String.raw`(?:[\x60'"\s;]|\\[nr]|$)`;

const pesel = (s: string) => {
  const d = [...s].map(Number), w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  return (10 - (w.reduce((a, x, i) => a + x * d[i], 0) % 10)) % 10 === d[10];
};
const mod97 = (iban: string) => {
  const s = iban.replace(/ /g, ""), r = s.slice(4) + s.slice(0, 4);
  const digits = [...r].map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)).join("");
  let m = 0; for (const ch of digits) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
};

export const RULES: Rule[] = [
  { id: "aws-access-token", re: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/g, group: 1, keywords: ["a3t", "akia", "asia", "abia", "acca"] },
  { id: "github-pat", re: /ghp_[0-9a-zA-Z]{36}/g, keywords: ["ghp_"] },
  { id: "github-fine-grained-pat", re: /github_pat_\w{82}/g, keywords: ["github_pat_"] },
  { id: "openai-api-key", re: new RegExp(String.raw`\b(sk-(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})\b|sk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20})${END}`, "g"), group: 1, keywords: ["t3blbkfj"] },
  { id: "anthropic-api-key", re: new RegExp(String.raw`\b(sk-ant-api03-[a-zA-Z0-9_\-]{93}AA)${END}`, "g"), group: 1, keywords: ["sk-ant-api03"] },
  { id: "anthropic-admin-api-key", re: new RegExp(String.raw`\b(sk-ant-admin01-[a-zA-Z0-9_\-]{93}AA)${END}`, "g"), group: 1, keywords: ["sk-ant-admin01"] },
  { id: "gcp-api-key", re: new RegExp(String.raw`\b(AIza[\w-]{35})${END}`, "g"), group: 1, keywords: ["aiza"] },
  { id: "stripe-access-token", re: new RegExp(String.raw`\b((?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99})${END}`, "g"), group: 1, keywords: ["sk_test", "sk_live", "sk_prod", "rk_test", "rk_live", "rk_prod"] },
  { id: "private-key", re: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----[\s\S-]{64,}?KEY(?: BLOCK)?-----/gi, keywords: ["-----begin"] },
  { id: "jwt", re: new RegExp(String.raw`\b(ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9\/\\_-]{17,}\.(?:[a-zA-Z0-9\/\\_-]{10,}={0,2})?)${END}`, "g"), group: 1, keywords: ["ey"] },
  { id: "slack-bot-token", re: /xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*/g, keywords: ["xoxb"] },
  { id: "slack-user-token", re: /xox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}/g, keywords: ["xoxp-", "xoxe-"] },
  { id: "slack-webhook-url", re: /(?:https?:\/\/)?hooks.slack.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g, keywords: ["hooks.slack.com"] },
  // PII (ours). Checksums keep false positives down.
  { id: "pii-email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, keywords: ["@"] },
  { id: "pii-iban", re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g, valid: mod97 },
  { id: "pii-iban", re: /(?<![\w-])\d{2}(?: ?\d{4}){6}(?![\w-])/g, valid: (m) => mod97("PL" + m.replace(/ /g, "")) },
  { id: "pii-pesel", re: /(?<!\d)\d{11}(?!\d)/g, valid: pesel },
  { id: "pii-phone", re: /(?<![\w+])(?:\+|00)\d{2,3}[ -]?\d{2,4}(?:[ -]?\d{2,4}){2,3}(?![\w])/g },
  { id: "pii-phone", re: /(?<![\w.,-])\d{3}[ -]\d{3}[ -]\d{3}(?![\w.,-])/g },
];

export interface Finding { rule: string; path: string; inKey?: boolean; unredactable?: boolean }
interface Span { start: number; end: number; rule: string; value: string }

export function scanText(text: string, carnet: Set<string> = new Set()): Span[] {
  const lower = text.toLowerCase(), spans: Span[] = [];
  for (const r of RULES) {
    if (r.keywords && !r.keywords.some((k) => lower.includes(k))) continue;
    for (const m of text.matchAll(new RegExp(r.re.source, r.re.flags.includes("d") ? r.re.flags : r.re.flags + "d"))) {
      const [s, e] = m.indices![r.group ?? 0]!; const value = text.slice(s, e);
      if (r.valid && !r.valid(value)) continue;
      if (carnet.has(createHash("sha256").update(value).digest("hex"))) continue; // exact-value allowlist
      spans.push({ start: s, end: e, rule: r.id, value });
    }
  }
  // wrapped JWTs: a token broken by newlines/indentation (mapped reconstruction); continuation chunks must be >= 8 chars
  if (lower.includes("ey")) for (const m of text.matchAll(/ey[\w\-\/\\.=]*(?:\s+[\w\-\/\\.=]{8,}(?![\w\-\/\\.=]))+/g)) {
    const at: number[] = []; let joined = "";
    [...m[0]].forEach((c, i) => { if (!/\s/.test(c)) { at.push(m.index! + i); joined += c; } });
    for (const j of joined.matchAll(/ey[a-zA-Z0-9]{17,}\.ey[a-zA-Z0-9\/\\_-]{17,}\.(?:[a-zA-Z0-9\/\\_-]{10,}={0,2})?/g))
      spans.push({ start: at[j.index!], end: at[j.index! + j[0].length - 1] + 1, rule: "jwt", value: j[0] });
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end); // earliest, then longest wins
  const out: Span[] = []; for (const s of spans) if (!out.length || s.start >= out[out.length - 1].end) out.push(s);
  return out;
}

export const redactText = (text: string, spans: Span[]) =>
  spans.reduceRight((t, s) => t.slice(0, s.start) + `[REDACTED:${s.rule}]` + t.slice(s.end), text);

/** Walk every string leaf (and key) of a parsed JSON value. Returns a redacted copy + findings (rule + JSON path only). */
const isPayload = (s: string) => /^data:[\w.+-]+\/[\w.+-]+(?:;[^,]*)?;base64,/.test(s);
export function inspect(v: unknown, carnet?: Set<string>, path = "$", findings: Finding[] = [], payload = false): { value: unknown; findings: Finding[] } {
  if (typeof v === "string") {
    if (payload || isPayload(v)) return { value: v, findings }; // attachments are inspected by attachments.ts
    const spans = scanText(v, carnet); spans.forEach((s) => findings.push({ rule: s.rule, path }));
    return { value: spans.length ? redactText(v, spans) : v, findings };
  }
  if (Array.isArray(v)) return { value: joinParts(v.map((x, i) => inspect(x, carnet, `${path}[${i}]`, findings).value), carnet, path, findings), findings };
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      scanText(k, carnet).forEach((s) => findings.push({ rule: s.rule, path: `${path}.<key>`, inKey: true }));
      o[k] = inspect(x, carnet, `${path}.${k}`, findings, k === "data" && (v as any).type === "base64").value;
    }
    return { value: o, findings };
  }
  return { value: v, findings };
}

/** Ordered text parts ([{type:"text",text}...] or [string...]) are scanned joined; a secret split across parts
 *  is replaced in the first part and removed from the following ones. */
function joinParts(arr: unknown[], carnet: Set<string> | undefined, path: string, findings: Finding[]): unknown[] {
  const idx: number[] = [], texts: string[] = [];
  arr.forEach((x: any, i) => { const t = typeof x === "string" ? x : x && typeof x === "object" && typeof x.text === "string" ? x.text : undefined; if (t !== undefined && !isPayload(t)) { idx.push(i); texts.push(t); } });
  if (texts.length < 2) return arr;
  const starts: number[] = []; let joined = ""; texts.forEach((t) => { starts.push(joined.length); joined += t; });
  const part = (pos: number) => { let k = 0; while (k + 1 < starts.length && starts[k + 1] <= pos) k++; return k; };
  const cross = scanText(joined, carnet).filter((s) => part(s.start) !== part(s.end - 1));
  if (!cross.length) return arr;
  const out = arr.slice(), next = texts.slice();
  for (const s of cross.reverse()) {
    const a = part(s.start), b = part(s.end - 1);
    findings.push({ rule: s.rule, path: `${path}[${idx[a]}..${idx[b]}]` });
    for (let k = b; k >= a; k--) {
      const from = Math.max(s.start - starts[k], 0), to = Math.min(s.end - starts[k], texts[k].length);
      next[k] = next[k].slice(0, from) + (k === a ? `[REDACTED:${s.rule}]` : "") + next[k].slice(to);
    }
  }
  idx.forEach((i, k) => { out[i] = typeof out[i] === "string" ? next[k] : { ...(out[i] as object), text: next[k] }; });
  return out;
}

/** JSON.parse silently keeps the last duplicate key; a scanner could see one value and the upstream another. Reject. */
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
/** One request-wide decision. */
export function decide(mode: Mode, findings: Finding[]): Decision {
  if (!findings.length || mode === "advisory") return { action: "forward-original", findings };
  if (mode === "no-go") return { action: "block", findings, status: 409, code: "audit_findings_blocked" };
  if (findings.some((f) => f.inKey || f.unredactable)) return { action: "block", findings, status: 409, code: "audit_unredactable_finding" };
  return { action: "forward-redacted", findings };
}
