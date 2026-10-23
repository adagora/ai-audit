import type { Span } from "../src/scan.js";

export function mergeSpansReference(text: string, spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end), out: Span[] = [];
  for (const s of sorted) {
    const prev = out.at(-1);
    if (!prev || s.start >= prev.end) { out.push({ ...s }); continue; }
    if (s.end > prev.end) { prev.end = s.end; prev.value = text.slice(prev.start, prev.end); }
    prev.matchStart = Math.min(prev.matchStart, s.matchStart); prev.matchEnd = Math.max(prev.matchEnd, s.matchEnd);
  }
  return out;
}
