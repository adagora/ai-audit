import { scanText, inspect, decide, sha256, fail } from "./common.mjs";

const checkSpans = (text, spans) => spans.forEach((s, k) => {
  if (!(s.matchStart <= s.start && s.start < s.end && s.end <= s.matchEnd && s.matchStart >= 0 && s.matchEnd <= text.length)) fail("span bounds", { text, s });
  const slice = text.slice(s.start, s.end);
  if (s.value !== slice && !(s.rule === "jwt" && s.value === slice.replace(/\s+/g, ""))) fail("span value", { text, s });
  if (k && spans[k - 1].end > s.start) fail("span overlap", { text, spans });
});
const covered = (n, ranges) => { const c = new Uint8Array(n); for (const r of ranges) c.fill(1, r.start, r.end); return c; };
const escape = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const occurrences = (text, value) =>
  [...text.matchAll(new RegExp(`(?=(${value.split("").map(escape).join("\\s*")}))`, "g"))].map((m) => ({ start: m.index, end: m.index + m[1].length }));

function maskingIsAFixpoint(text, carnet, what) {
  const r = inspect(text, carnet);
  if (decide("redact", r.findings).action === "block") return;
  const again = inspect(r.value, carnet);
  if (again.findings.length) fail(what, { text, once: r.value, again: again.findings });
}

function allowListHidesOnlyAllowedValues(text, spans) {
  const values = [...new Set(spans.filter((_, k) => k % 2 === text.length % 2).map((s) => s.value))];
  if (!values.length) return;
  const carnet = new Set(values.map(sha256)), kept = scanText(text, carnet);
  checkSpans(text, kept);
  const before = covered(text.length, spans), after = covered(text.length, kept), allowed = covered(text.length, values.flatMap((v) => occurrences(text, v)));
  for (let i = 0; i < text.length; i++) {
    if (after[i] && !before[i]) fail("the allow-list adds a finding byte", { text, values, at: i });
    if (before[i] && !after[i] && !allowed[i]) fail("the allow-list uncovers a byte outside every allowed value", { text, values, at: i });
  }
  maskingIsAFixpoint(text, carnet, "masking with an allow-list is not a fixpoint");
}

export function fuzz(data) {
  const text = data.toString("utf8"), spans = scanText(text);
  checkSpans(text, spans);
  maskingIsAFixpoint(text, undefined, "masking is not a fixpoint");
  allowListHidesOnlyAllowedValues(text, spans);
}
