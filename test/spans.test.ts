import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeSpans, type Span } from "../src/scan.js";
import { spanInputs, type SpanGoldenInput } from "./fixtures/capture-span-goldens.js";
import { mergeSpansReference } from "./spanReference.js";

const goldens: { cases: { input: SpanGoldenInput; output: Span[] }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/span-goldens.json", import.meta.url), "utf8"));

test("spans: every golden captured from the TypeScript span merge is reproduced byte for byte (ADR 0007)", () => {
  assert.equal(goldens.cases.length, 404);
  for (const c of goldens.cases) assert.equal(JSON.stringify(mergeSpans(c.input.text, c.input.spans)), JSON.stringify(c.output), JSON.stringify(c.input));
});

test("spans: same merge as the TypeScript reference on generated inputs and on 50,000 spans of one string", () => {
  for (const i of spanInputs(41, 20_000)) assert.equal(JSON.stringify(mergeSpans(i.text, i.spans)), JSON.stringify(mergeSpansReference(i.text, i.spans)), JSON.stringify(i));
  const text = "x".repeat(200_000), spans = Array.from({ length: 50_000 }, (_, i): Span => {
    const start = (i * 7919) % 199_990, end = start + 1 + (i % 9);
    return { start, end, matchStart: start, matchEnd: end, rule: i % 3 ? "email" : "api-key", value: text.slice(start, end) };
  });
  assert.equal(JSON.stringify(mergeSpans(text, spans)), JSON.stringify(mergeSpansReference(text, spans)));
});
