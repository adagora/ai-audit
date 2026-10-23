import { arenaOf } from "../dist/src/session.js";
import { tokenTotals } from "../dist/src/audit.js";
import { mergeSpans, redactText, takenAcrossParts } from "../dist/src/scan.js";
import { redactTextReference } from "../dist/test/maskReference.js";
import { arenaReference } from "../dist/test/arenaReference.js";
import { tokenTotalsReference } from "../dist/test/usageReference.js";
import { mergeSpansReference } from "../dist/test/spanReference.js";
import { takenAcrossPartsReference } from "../dist/test/crossReference.js";
import { fork } from "node:child_process";
import { once } from "node:events";
const median = (xs) => xs.sort((a, b) => a - b)[xs.length >> 1];
const time = (f, reps) => { for (let i = 0; i < 3; i++) f(); const r = []; for (let i = 0; i < 15; i++) { const t0 = performance.now(); for (let k = 0; k < reps; k++) f(); r.push((performance.now() - t0) / reps * 1000); } return median(r); };
const only = process.argv[2], names = [];
const row = (name, reps, bend, ts) => {
  names.push(name);
  if (only !== name) return;
  const b = time(bend, reps), t = time(ts, reps);
  process.send(JSON.stringify({ case: name, bendUs: +b.toFixed(3), typescriptUs: +t.toFixed(3), ratio: +(b / t).toFixed(2) }));
};

const blocks = (n) => Array.from({ length: n }, (_, i) => ({ kind: i === 0 ? "system" : i % 2 ? "user" : "assistant", bytes: 100 + i }));
for (const n of [20, 200]) {
  const bs = blocks(n), hashes = bs.map((_, i) => `h${i}`.padEnd(16, "x")), prev = { hashes: hashes.slice(0, n - 2), ages: hashes.slice(0, n - 2).map(() => 1) };
  row(`arena, ${n} blocks`, 2000, () => arenaOf(prev, hashes, bs, 2, true), () => arenaReference(prev, hashes, bs, 2, true));
}
const one = [{ start: 1, end: 4, matchStart: 0, matchEnd: 4, rule: "pii-email", value: "bcd" }];
row("span merge, string without findings", 200000, () => mergeSpans("abc", []), () => mergeSpansReference("abc", []));
row("span merge, string with one finding", 200000, () => mergeSpans("abcdef", one), () => mergeSpansReference("abcdef", one));
const text = "x".repeat(200_000), spans = Array.from({ length: 50_000 }, (_, i) => { const start = (i * 7919) % 199_990; return { start, end: start + 1 + (i % 9), matchStart: start, matchEnd: start + 1 + (i % 9), rule: "pii-email", value: "v" }; });
row("span merge, 50,000 spans", 3, () => mergeSpans(text, spans), () => mergeSpansReference(text, spans));
const two = [{ start: 3, end: 8, matchStart: 0, matchEnd: 8 }, { start: 12, end: 20, matchStart: 12, matchEnd: 20 }];
row("cross-part, 2 parts, 2 spans", 100000, () => takenAcrossParts([0, 10], two), () => takenAcrossPartsReference([0, 10], two));
const starts = Array.from({ length: 10_000 }, (_, k) => k * 40), many = Array.from({ length: 100_000 }, (_, i) => ({ start: 4 * i + 1, end: 4 * i + 3, matchStart: 4 * i, matchEnd: 4 * i + 4 + (i % 3 === 0 ? 1 : 0) }));
row("cross-part, 100,000 spans", 3, () => takenAcrossParts(starts, many), () => takenAcrossPartsReference(starts, many));
const page = "word ".repeat(200), found = [10, 400, 900].map((start) => ({ start, end: start + 20, matchStart: start, matchEnd: start + 20, rule: "pii-email", value: "" }));
row("redaction, 1 KB text with 3 findings", 20000, () => redactText(page, found), () => redactTextReference(page, found));
const calls = Array.from({ length: 200_000 }, (_, i) => ({ kind: "llm-call", upstreamStatus: 200, decision: { action: "forward-original" }, usage: i % 50 ? { input: 1000 + (i % 977), output: 200 + (i % 31) } : {} }));
row("usage totals, 200,000 calls", 3, () => tokenTotals(calls), () => tokenTotalsReference(calls));

if (only === undefined) for (const name of names) { const child = fork(new URL(import.meta.url), [name]); const [line] = await once(child, "message"); console.log(line); child.kill(); }
