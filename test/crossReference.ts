import type { SpanRange } from "../src/scan.js";

const lastWhere = (n: number, ok: (i: number) => boolean) => {
  let lo = 0, hi = n - 1, found = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ok(mid)) { found = mid; lo = mid + 1; } else hi = mid - 1; }
  return found;
};

export function takenAcrossPartsReference(starts: number[], spans: SpanRange[]): boolean[] {
  const part = (pos: number) => lastWhere(starts.length, (k) => starts[k] <= pos);
  const taken = spans.map((s) => part(s.matchStart) !== part(s.matchEnd - 1));
  for (let grew = taken.includes(true); grew;) {
    const removed = spans.filter((_, i) => taken[i]);
    const overlapsRemoved = (s: SpanRange) => { const k = lastWhere(removed.length, (i) => removed[i].start < s.matchEnd); return k >= 0 && removed[k].end > s.matchStart; };
    grew = false;
    spans.forEach((s, i) => { if (!taken[i] && overlapsRemoved(s)) taken[i] = grew = true; });
  }
  return taken;
}
