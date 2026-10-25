export type QuoteIssueCode = "quote-missing" | "quote-not-in-source" | "value-not-in-quote";
export interface QuoteIssue { field: string; code: QuoteIssueCode }
export interface QuoteCheck { ok: boolean; checked: number; issues: QuoteIssue[] }
export interface QuotedValue { value: string | number | boolean | null; quote?: string | null }

const MASK = /\[REDACTED:[\w-]+\]/gi;
const NUMBER_FORMS: [RegExp, (m: string) => number][] = [
  [/-?\d+/g, Number],
  [/-?\d+[.,]\d+/g, (m) => Number(m.replace(",", "."))],
  [/-?\d{1,3}(?:[ .,]\d{3})+/g, (m) => Number(m.replace(/[ .,]/g, ""))],
];
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isScalar = (v: unknown) => v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
const isQuotedValue = (v: unknown): v is QuotedValue => isRecord(v) && Object.hasOwn(v, "value") && isScalar(v.value)
  && (v.quote === undefined || v.quote === null || typeof v.quote === "string");

function numbersIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const [form, read] of NUMBER_FORMS) for (const [m] of text.matchAll(form)) { const n = read(m); found.add(n).add(Math.abs(n)); }
  return found;
}

function inOrder(source: string, pieces: string[]): boolean {
  let end = -1;
  for (const piece of pieces) {
    const at = source.indexOf(piece, end + 1);
    if (at < 0) return false;
    end = at + piece.length;
  }
  return true;
}

function issueOf(source: string, { value, quote }: QuotedValue): QuoteIssueCode | undefined {
  const pieces = typeof quote === "string" ? quote.split(MASK).map(normalize).filter(Boolean) : [];
  if (!pieces.length) return "quote-missing";
  if (!inOrder(source, pieces)) return "quote-not-in-source";
  if (typeof value === "number" && !pieces.some((p) => numbersIn(p).has(value))) return "value-not-in-quote";
  if (typeof value === "string" && !pieces.some((p) => p.includes(normalize(value)))) return "value-not-in-quote";
  return undefined;
}

export function checkQuotes(source: string, answer: unknown): QuoteCheck {
  if (typeof source !== "string" || !isRecord(answer)) throw new Error("audit_invalid_answer");
  const text = normalize(source), fields = Object.entries(answer), issues: QuoteIssue[] = [];
  for (const [field, entry] of fields) {
    if (!isQuotedValue(entry)) throw new Error("audit_invalid_answer");
    const code = issueOf(text, entry);
    if (code) issues.push({ field, code });
  }
  return { ok: issues.length === 0, checked: fields.length, issues };
}
