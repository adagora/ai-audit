import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mergeSpans, takenAcrossParts, type Span, type SpanRange } from "../../src/scan.js";
import { gen } from "../helpers.js";

export interface CrossGoldenInput { starts: number[]; spans: SpanRange[] }

const range = (start: number, end: number, matchStart = start, matchEnd = end): SpanRange => ({ start, end, matchStart, matchEnd });
const prefixStarts = (lengths: number[]) => lengths.reduce<number[]>((s, n, i) => (i ? [...s, s[i - 1] + lengths[i - 1]] : [0]), []);

export function crossInputs(seed: number, count: number, maxParts = 6, maxSpans = 10): CrossGoldenInput[] {
  const g = gen(seed);
  const edges: CrossGoldenInput[] = [
    { starts: [0, 5], spans: [] },
    { starts: [0, 5], spans: [range(2, 5), range(5, 8)] },
    { starts: [0, 5, 5, 10], spans: [range(3, 7)] },
    { starts: [0, 5], spans: [range(1, 3, 1, 3), range(6, 9, 2, 9)] },
    { starts: [0, 51], spans: [range(10, 12, 10, 51), range(20, 22, 20, 41), range(30, 32, 21, 32), range(40, 42, 11, 42), range(50, 52)] },
  ];
  const random = Array.from({ length: count }, (): CrossGoldenInput => {
    const lengths = Array.from({ length: 2 + g.int(maxParts - 1) }, () => g.int(12)), total = lengths.reduce((a, n) => a + n, 0);
    const raw = Array.from({ length: total ? g.int(maxSpans + 1) : 0 }, (): Span => {
      const start = g.int(total), end = start + 1 + g.int(Math.min(6, total - start));
      return { start, end, matchStart: start - g.int(Math.min(start, 8) + 1), matchEnd: end + g.int(Math.min(total - end, 8) + 1), rule: "r", value: "" };
    });
    const spans = mergeSpans("x".repeat(total), raw).map((s) => range(s.start, s.end, s.matchStart, s.matchEnd));
    return { starts: prefixStarts(lengths), spans };
  });
  return [...edges, ...random];
}

const goldenPath = new URL("../../../test/fixtures/cross-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = crossInputs(50, 400).map((input) => ({ input, output: takenAcrossParts(input.starts, input.spans) }));
  const sourceSha256 = createHash("sha256").update(readFileSync(new URL("../../../src/scan.ts", import.meta.url))).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/scan.ts takenAcrossParts", sourceSha256, seed: 50, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases from src/scan.ts ${sourceSha256.slice(0, 16)}`);
}
