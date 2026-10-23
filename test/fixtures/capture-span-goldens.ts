import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mergeSpans, type Span } from "../../src/scan.js";
import { gen } from "../helpers.js";

export interface SpanGoldenInput { text: string; spans: Span[] }

export function spanInputs(seed: number, count: number, maxSpans = 8): SpanGoldenInput[] {
  const g = gen(seed);
  const edges: SpanGoldenInput[] = [
    { text: "", spans: [] },
    { text: "abcdef", spans: [{ start: 2, end: 2, matchStart: 1, matchEnd: 3, rule: "r", value: "" }] },
    { text: "abcdef", spans: [{ start: 0, end: 3, matchStart: 0, matchEnd: 3, rule: "a", value: "abc" }, { start: 3, end: 6, matchStart: 3, matchEnd: 6, rule: "b", value: "def" }] },
    { text: "abcdef", spans: [{ start: 1, end: 4, matchStart: 0, matchEnd: 5, rule: "a", value: "bcd" }, { start: 1, end: 4, matchStart: 1, matchEnd: 6, rule: "b", value: "bcd" }] },
  ];
  const random = Array.from({ length: count }, (): SpanGoldenInput => {
    const length = g.int(60), text = g.chars(length, "abcdefgh  ey.");
    const spans = Array.from({ length: length ? g.int(maxSpans + 1) : 0 }, (): Span => {
      const start = g.int(length), end = start + 1 + g.int(length - start), matchStart = g.int(start + 1), matchEnd = end + g.int(length - end + 1);
      const rule = g.pick(["api-key", "email", "iban", "jwt", "url-credentials"]), slice = text.slice(start, end);
      return { start, end, matchStart, matchEnd, rule, value: rule === "jwt" ? slice.replace(/\s+/g, "") : slice };
    });
    return { text, spans };
  });
  return [...edges, ...random];
}

const goldenPath = new URL("../../../test/fixtures/span-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = spanInputs(40, 400).map((input) => ({ input, output: mergeSpans(input.text, input.spans) }));
  const sourceSha256 = createHash("sha256").update(readFileSync(new URL("../../../src/scan.ts", import.meta.url))).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/scan.ts mergeSpans", sourceSha256, seed: 40, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases from src/scan.ts ${sourceSha256.slice(0, 16)}`);
}
