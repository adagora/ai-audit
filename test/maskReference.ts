import type { Span } from "../src/scan.js";

const lastWhere = (n: number, ok: (i: number) => boolean) => {
  let lo = 0, hi = n - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ok(mid)) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found;
};

export const redactTextReference = (text: string, spans: Span[]) =>
  spans.map((s, i) => `${text.slice(i ? spans[i - 1].end : 0, s.start)}[REDACTED:${s.rule}]`).join("") + text.slice(spans.at(-1)?.end ?? 0);

export function maskPartsReference(texts: string[], spans: Span[]): string[] {
  const starts: number[] = []; let total = 0; texts.forEach((t) => { starts.push(total); total += t.length; });
  const part = (pos: number) => lastWhere(starts.length, (k) => starts[k] <= pos);
  const next = texts.slice();
  for (const s of [...spans].reverse()) {
    const a = part(s.start), b = part(s.end - 1);
    for (let k = b; k >= a; k--) {
      const from = Math.max(s.start - starts[k], 0), to = Math.min(s.end - starts[k], texts[k].length);
      next[k] = next[k].slice(0, from) + (k === a ? `[REDACTED:${s.rule}]` : "") + next[k].slice(to);
    }
  }
  return next;
}
