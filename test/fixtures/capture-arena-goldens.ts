import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import type { Segment } from "../../src/context.js";
import { arenaOf, type ArenaState, type SizedBlock } from "../../src/session.js";
import { gen } from "../helpers.js";

export interface ArenaGoldenInput { previous?: ArenaState; hashes: string[]; blocks: SizedBlock[]; turn: number; tracked: boolean }

const KINDS: Segment[] = ["tools", "system", "user", "assistant", "toolResults", "attachments"];

export function arenaInputs(seed: number, count: number): ArenaGoldenInput[] {
  const g = gen(seed);
  const hash = () => g.pick(["a", "b", "c", "d"]);
  const bytes = () => (g.int(4) === 0 ? g.int(100_000) : g.int(40));
  const edges: ArenaGoldenInput[] = [
    { hashes: [], blocks: [], turn: 1, tracked: true },
    { previous: { hashes: ["a"], ages: [1] }, hashes: [], blocks: [], turn: 2, tracked: true },
    { previous: { hashes: [], ages: [] }, hashes: ["a"], blocks: [{ kind: "user", bytes: 5 }], turn: 2, tracked: true },
    { hashes: ["a", "a"], blocks: [{ kind: "user", bytes: 0 }, { kind: "user", bytes: 0 }], turn: 3, tracked: false },
  ];
  const random = Array.from({ length: count }, (): ArenaGoldenInput => {
    const n = g.int(9), hashes = Array.from({ length: n }, hash), blocks = hashes.map((): SizedBlock => ({ kind: g.pick(KINDS), bytes: bytes() }));
    const turn = 1 + g.int(12), shape = g.int(6), j = g.int(n + 1);
    const prevHashes =
      shape === 1 ? [...hashes]
      : shape === 2 ? hashes.slice(0, j)
      : shape === 3 ? [...hashes.slice(0, j), "e", ...Array.from({ length: g.int(4) }, hash)]
      : shape === 4 ? [...hashes, ...Array.from({ length: 1 + g.int(3) }, hash)]
      : Array.from({ length: g.int(9) }, hash);
    const previous = shape === 0 ? undefined : { hashes: prevHashes, ages: prevHashes.map(() => g.int(turn + 1)) };
    return { previous, hashes, blocks, turn, tracked: turn === 1 || previous !== undefined };
  });
  return [...edges, ...random];
}

const sourcePath = new URL("../../../src/session.ts", import.meta.url), goldenPath = new URL("../../../test/fixtures/arena-goldens.json", import.meta.url);
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const cases = arenaInputs(20, 500).map((input) => {
    const { state, arena } = arenaOf(input.previous, input.hashes, input.blocks, input.turn, input.tracked);
    return { input, output: { ages: state.ages, arena } };
  });
  const sourceSha256 = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
  writeFileSync(goldenPath, JSON.stringify({ source: "src/session.ts arenaOf", sourceSha256, seed: 20, cases }) + "\n", { flag: "wx" });
  console.log(`wrote ${cases.length} cases from src/session.ts ${sourceSha256.slice(0, 16)}`);
}
