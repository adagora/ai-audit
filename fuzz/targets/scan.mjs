import { scanText, inspect, decide, fail } from "./common.mjs";

export function fuzz(data) {
  const text = data.toString("utf8"), spans = scanText(text);
  spans.forEach((s, k) => {
    if (!(s.matchStart <= s.start && s.start < s.end && s.end <= s.matchEnd && s.matchStart >= 0 && s.matchEnd <= text.length)) fail("span bounds", { text, s });
    const slice = text.slice(s.start, s.end);
    if (s.value !== slice && !(s.rule === "jwt" && s.value === slice.replace(/\s+/g, ""))) fail("span value", { text, s });
    if (k && spans[k - 1].end > s.start) fail("span overlap", { text, spans });
  });
  const r = inspect(text);
  if (decide("redact", r.findings).action === "block") return;
  const again = inspect(r.value);
  if (again.findings.length) fail("masking is not a fixpoint", { text, once: r.value, again: again.findings });
}
