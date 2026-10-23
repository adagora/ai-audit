import { KIND_CODES, type ArenaBlock } from "../src/context.js";
import type { Arena, ArenaState, SizedBlock } from "../src/session.js";

export function arenaReference(previous: ArenaState | undefined, hashes: string[], blocks: SizedBlock[], turn: number, tracked: boolean): { state: ArenaState; arena: Arena } {
  let changed = previous ? hashes.findIndex((h, i) => previous.hashes[i] !== h) : -1;
  if (previous && changed === -1 && hashes.length < previous.hashes.length) changed = hashes.length;
  const ages = hashes.map((_, i) => previous && (changed === -1 || i < changed) ? previous.ages[i] : tracked ? turn : 0);
  const firstChanged = !previous || changed === -1 || changed >= previous.hashes.length ? null
    : { block: changed, offset: blocks.slice(0, changed).reduce((a, b) => a + b.bytes, 0) };
  const compact: ArenaBlock[] = [];
  blocks.forEach((b, i) => {
    const code = KIND_CODES[b.kind], last = compact[compact.length - 1];
    if (last && last[0] === code && last[2] === ages[i] && !(firstChanged && i === firstChanged.block)) last[1] += b.bytes;
    else compact.push([code, b.bytes, ages[i]]);
  });
  return { state: { hashes, ages }, arena: { blocks: compact, firstChanged, tracked } };
}
