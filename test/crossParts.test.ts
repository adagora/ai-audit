import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { takenAcrossParts, type SpanRange } from "../src/scan.js";
import { crossInputs, type CrossGoldenInput } from "./fixtures/capture-cross-goldens.js";
import { takenAcrossPartsReference } from "./crossReference.js";

const goldens: { cases: { input: CrossGoldenInput; output: boolean[] }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/cross-goldens.json", import.meta.url), "utf8"));

test("cross-part: every golden captured from the TypeScript closure is reproduced (ADR 0007)", () => {
  assert.equal(goldens.cases.length, 405);
  for (const c of goldens.cases) assert.deepEqual(takenAcrossParts(c.input.starts, c.input.spans), c.output, JSON.stringify(c.input));
});

test("cross-part: same spans taken as the TypeScript reference on generated inputs, on 100,000 spans and on a chain that needs many rounds", () => {
  for (const i of crossInputs(51, 20_000, 8, 14)) assert.deepEqual(takenAcrossParts(i.starts, i.spans), takenAcrossPartsReference(i.starts, i.spans), JSON.stringify(i));
  const starts = Array.from({ length: 10_000 }, (_, k) => k * 40), spans = Array.from({ length: 100_000 }, (_, i): SpanRange => ({ start: 4 * i + 1, end: 4 * i + 3, matchStart: 4 * i, matchEnd: 4 * i + 4 + (i % 3 === 0 ? 1 : 0) }));
  assert.deepEqual(takenAcrossParts(starts, spans), takenAcrossPartsReference(starts, spans));
  const n = 300, order = [n - 1];
  for (let lo = 0, hi = n - 2; lo <= hi;) { order.push(lo++); if (lo <= hi) order.push(hi--); }
  const chain = Array.from({ length: n }, (_, i): SpanRange => ({ start: 10 * i + 10, end: 10 * i + 12, matchStart: 10 * i + 10, matchEnd: 10 * i + 12 }));
  order.forEach((e, j) => { if (j && order[j - 1] > e) chain[e].matchEnd = chain[order[j - 1]].start + 1; else if (j) chain[e].matchStart = chain[order[j - 1]].end - 1; });
  assert.deepEqual(takenAcrossParts([0, 10 * n + 1], chain), Array(n).fill(true));
  assert.deepEqual(takenAcrossPartsReference([0, 10 * n + 1], chain), Array(n).fill(true));
});
