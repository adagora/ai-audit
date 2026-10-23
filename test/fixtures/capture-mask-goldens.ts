import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { maskParts, mergeSpans, redactText, type Span } from "../../src/scan.js";
import { gen } from "../helpers.js";

export interface MaskGoldenInput { texts: string[]; spans: Span[] }

const span = (texts: string[], start: number, end: number, rule = "pii-email"): Span => ({ start, end, matchStart: start, matchEnd: end, rule, value: texts.join("").slice(start, end) });

export function maskInputs(seed: number, count: number, maxParts = 5, maxLength = 12): MaskGoldenInput[] {
  const g = gen(seed);
  const edges: MaskGoldenInput[] = [[""], ["abc"]].map((texts) => ({ texts, spans: [] }));
  for (const [texts, cuts] of [[["abcdef"], [[0, 6]]], [["ab", "", "cd"], [[1, 3]]], [["abc", "def"], [[3, 5]]], [["abc", "def"], [[1, 3]]], [["abcdef"], [[1, 3], [3, 5]]], [["a", "b", "c", "d"], [[0, 4]]]] as [string[], number[][]][])
    edges.push({ texts, spans: cuts.map(([s, e]) => span(texts, s, e)) });
  const random = Array.from({ length: count }, (): MaskGoldenInput => {
    const texts = Array.from({ length: 1 + g.int(maxParts) }, () => g.chars(g.int(maxLength), "abcdef ")), joined = texts.join(""), total = joined.length;
    const raw = Array.from({ length: total ? g.int(6) : 0 }, (): Span => {
      const start = g.int(total), end = start + 1 + g.int(Math.min(6, total - start));
      return { start, end, matchStart: start, matchEnd: end, rule: g.pick(["pii-email", "github-pat", "jwt"]), value: joined.slice(start, end) };
    });
    return { texts, spans: mergeSpans(joined, raw) };
  });
  return [...edges, ...random];
}

export const maskOutputs = (i: MaskGoldenInput) => ({ parts: maskParts(i.texts, i.spans), text: redactText(i.texts.join(""), i.spans) });

const goldenPath = new URL("../../../test/fixtures/mask-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = maskInputs(60, 400).map((input) => ({ input, output: maskOutputs(input) }));
  const sourceSha256 = createHash("sha256").update(readFileSync(new URL("../../../src/scan.ts", import.meta.url))).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/scan.ts maskParts, redactText", sourceSha256, seed: 60, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases from src/scan.ts ${sourceSha256.slice(0, 16)}`);
}
