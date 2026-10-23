import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Segment } from "../src/context.js";
import { arenaOf, type Arena, type ArenaState, type SizedBlock } from "../src/session.js";
import { arenaReference } from "./arenaReference.js";
import { arenaInputs, type ArenaGoldenInput } from "./fixtures/capture-arena-goldens.js";

type ArenaFn = (previous: ArenaState | undefined, hashes: string[], blocks: SizedBlock[], turn: number, tracked: boolean) => { state: ArenaState; arena: Arena };
const run = (f: ArenaFn, i: ArenaGoldenInput) => { const { state, arena } = f(i.previous, i.hashes, i.blocks, i.turn, i.tracked); return JSON.stringify({ ages: state.ages, arena }); };
const goldens: { cases: { input: ArenaGoldenInput; output: unknown }[] } = JSON.parse(readFileSync(new URL("../../test/fixtures/arena-goldens.json", import.meta.url), "utf8"));

test("arena: every golden captured from the TypeScript arena is reproduced byte for byte (ADR 0020)", () => {
  assert.equal(goldens.cases.length, 504);
  for (const c of goldens.cases) assert.equal(run(arenaOf, c.input), JSON.stringify(c.output), JSON.stringify(c.input));
});

test("arena: same output as the TypeScript reference on generated inputs and on a request of 200,000 blocks", () => {
  for (const input of arenaInputs(21, 20_000)) assert.equal(run(arenaOf, input), run(arenaReference, input), JSON.stringify(input));
  const n = 200_000, kinds: Segment[] = ["user", "assistant", "toolResults"];
  const hashes = Array.from({ length: n }, (_, i) => `h${i}`), blocks = hashes.map((_, i): SizedBlock => ({ kind: kinds[i % 3], bytes: 1 + (i % 7) }));
  const previous: ArenaState = { hashes: hashes.map((h, i) => (i === n - 5 ? "x" : h)), ages: hashes.map((_, i) => 1 + (i % 4)) };
  const big: ArenaGoldenInput = { previous, hashes, blocks, turn: 9, tracked: true };
  assert.equal(run(arenaOf, big), run(arenaReference, big));
});
