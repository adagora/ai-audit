import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maskParts, redactText, type Span } from "../src/scan.js";
import { maskInputs, maskOutputs, type MaskGoldenInput } from "./fixtures/capture-mask-goldens.js";
import { maskPartsReference, redactTextReference } from "./maskReference.js";

const goldens: { cases: { input: MaskGoldenInput; output: unknown }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/mask-goldens.json", import.meta.url), "utf8"));

test("mask: every golden captured from the TypeScript redaction of one text and of text parts is reproduced (ADR 0007)", () => {
  assert.equal(goldens.cases.length, 408);
  for (const c of goldens.cases) assert.equal(JSON.stringify(maskOutputs(c.input)), JSON.stringify(c.output), JSON.stringify(c.input));
});

test("mask: same text as the TypeScript reference on generated inputs, on 50,000 findings in one text and on 20,000 parts", () => {
  for (const i of maskInputs(61, 20_000)) {
    assert.deepEqual(maskParts(i.texts, i.spans), maskPartsReference(i.texts, i.spans), JSON.stringify(i));
    assert.equal(redactText(i.texts.join(""), i.spans), redactTextReference(i.texts.join(""), i.spans), JSON.stringify(i));
  }
  const text = "abcdefghij".repeat(30_000), spans = Array.from({ length: 50_000 }, (_, i): Span => ({ start: 6 * i + 1, end: 6 * i + 4, matchStart: 6 * i + 1, matchEnd: 6 * i + 4, rule: "pii-email", value: "" }));
  assert.equal(redactText(text, spans), redactTextReference(text, spans));
  const parts = Array.from({ length: 20_000 }, (_, k) => "xyz".repeat(1 + (k % 4))), long = Array.from({ length: 5_000 }, (_, i): Span => ({ start: 9 * i + 2, end: 9 * i + 7, matchStart: 9 * i + 2, matchEnd: 9 * i + 7, rule: "jwt", value: "" }));
  assert.deepEqual(maskParts(parts, long), maskPartsReference(parts, long));
});
