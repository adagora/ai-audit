import { randomBytes } from "node:crypto";
import { inspect, scanText, type Allowlist, type Span } from "./scan.js";

export interface PiiEntry { token: string; rule: string; value: string }
export const PII_TOKEN = /\[PII:(email|phone|pesel|iban):[a-p]{48}\]/g;
export const isPiiToken = (s: string) => new RegExp(`^(?:${PII_TOKEN.source})$`).test(s);
export const piiTokens = (s: string) => [...new Set(s.match(PII_TOKEN) ?? [])];
const id = () => [...randomBytes(24)].map((n) => String.fromCharCode(97 + (n >> 4), 97 + (n & 15))).join("");

export function inspectPii(value: unknown, carnet?: Allowlist) {
  const entries: PiiEntry[] = [], byValue = new Map<string, string>();
  const replace = (span: Span) => {
    if (!["pii-email", "pii-phone", "pii-pesel", "pii-iban"].includes(span.rule)) return `[REDACTED:${span.rule}]`;
    const secret = scanText(span.value).find((s) => !s.rule.startsWith("pii-"));
    if (secret) return `[REDACTED:${secret.rule}]`;
    const key = `${span.rule}\0${span.value}`;
    let token = byValue.get(key);
    if (!token) {
      if (entries.length >= 10_000) throw new Error("audit_pii_limit");
      token = `[PII:${span.rule.slice(4)}:${id()}]`;
      byValue.set(key, token); entries.push({ token, rule: span.rule, value: span.value });
    }
    return token;
  };
  return { ...inspect(value, carnet, "$", [], false, 0, replace), pii: entries };
}

export function redactPiiLog(value: unknown, depth = 0): unknown {
  if (depth > 64) return "[REDACTED:deep-content]";
  if (typeof value === "string") {
    const result = inspect(value.replace(PII_TOKEN, "[REDACTED:pii-token]"));
    return result.findings.some((f) => f.inKey || f.unredactable) ? "[REDACTED:unredactable-content]" : result.value;
  }
  if (Array.isArray(value)) return value.map((v) => redactPiiLog(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v], i) => [scanText(k).length ? `<redacted-key-${i}>` : k, redactPiiLog(v, depth + 1)]));
  return value;
}
