import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { decide, type Finding, type Mode } from "../../src/scan.js";

export interface DecideGoldenInput { mode: Mode; findings: Finding[] }

const kinds: Finding[] = [{ rule: "pii-email", path: "$.messages[0].content" }, { rule: "github-pat", path: "$.<key>", inKey: true }, { rule: "ambiguous-json", path: "$.x", unredactable: true }];
const lists = (n: number): Finding[][] => (n === 0 ? [[]] : lists(n - 1).flatMap((l) => kinds.map((k) => [...l, k])));

export const decideInputs = (): DecideGoldenInput[] =>
  (["redact", "no-go", "advisory"] as Mode[]).flatMap((mode) => [0, 1, 2, 3].flatMap((n) => lists(n).map((findings) => ({ mode, findings }))));

const goldenPath = new URL("../../../test/fixtures/decide-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = decideInputs().map((input) => ({ input, output: decide(input.mode, input.findings) }));
  const sourceSha256 = createHash("sha256").update(readFileSync(new URL("../../../src/scan.ts", import.meta.url))).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/scan.ts decide", sourceSha256, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases from src/scan.ts ${sourceSha256.slice(0, 16)}`);
}
