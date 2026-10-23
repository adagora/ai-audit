import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Api } from "./extract.js";
import { KIND_CODES, type ArenaBlock, type ContextBlock } from "./context.js";

export interface FirstChanged { block: number; offset: number }
export interface SessionLink { id: string; turn: number; digest: string; parent: string | null; messages: number; firstChanged?: FirstChanged | null; arena?: "tracked" | "untracked" }
export interface Arena { blocks: ArenaBlock[]; firstChanged: FirstChanged | null; tracked: boolean }
export interface ArenaState { hashes: string[]; ages: number[] }
export type SizedBlock = Pick<ContextBlock, "kind" | "bytes">;
export interface SessionRecordLike { session?: SessionLink }

const KEY_BYTES = 32;
const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x);

export function loadOrCreateSessionKey(path: string): Buffer {
  if (existsSync(path)) {
    const key = Buffer.from(readFileSync(path, "utf8").trim(), "hex");
    if (key.length !== KEY_BYTES) throw new Error("audit_invalid_session_key");
    return key;
  }
  const key = randomBytes(KEY_BYTES);
  writeFileSync(path, key.toString("hex") + "\n", { mode: 0o600, flag: "wx" });
  chmodSync(path, 0o600);
  return key;
}

export function conversationItems(api: Api, body: any): unknown[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  if (api === "openai-chat") return Array.isArray(body.messages) ? body.messages : undefined;
  if (api === "openai-responses") {
    if (body.previous_response_id !== undefined) return undefined;
    const input = typeof body.input === "string" ? [{ role: "user", content: body.input }] : Array.isArray(body.input) ? body.input : undefined;
    return input && (body.instructions !== undefined ? [{ role: "system", content: body.instructions }, ...input] : input);
  }
  if (!Array.isArray(body.messages)) return undefined;
  return body.system !== undefined ? [{ role: "system", content: body.system }, ...body.messages] : body.messages;
}

export function arenaOf(previous: ArenaState | undefined, hashes: string[], blocks: SizedBlock[], turn: number, tracked: boolean): { state: ArenaState; arena: Arena } {
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

export class SessionIndex {
  private readonly byDigest = new Map<string, SessionLink>();
  private readonly arenas = new Map<string, ArenaState>();
  constructor(private readonly key: Buffer, private readonly capacity = 100_000, private readonly arenaCapacity = 10_000) {}

  arena(link: SessionLink, blocks: ContextBlock[]): Arena {
    const hashes = blocks.map((b) => createHmac("sha256", this.key).update(b.kind).update("\0").update(canonical(b.value)).digest("base64url").slice(0, 16));
    const previous = this.arenas.get(link.digest) ?? (link.parent ? this.arenas.get(link.parent) : undefined);
    const { state, arena } = arenaOf(previous, hashes, blocks, link.turn, link.turn === 1 || !!previous);
    this.arenas.delete(link.digest); this.arenas.set(link.digest, state);
    if (this.arenas.size > this.arenaCapacity) this.arenas.delete(this.arenas.keys().next().value!);
    return arena;
  }

  prefixDigests(items: unknown[]): string[] {
    const out: string[] = []; let chain = createHmac("sha256", this.key).update("ai-audit-session-v1").digest("hex");
    for (const item of items) {
      const itemDigest = createHmac("sha256", this.key).update(canonical(item)).digest("hex");
      chain = createHmac("sha256", this.key).update(chain).update(itemDigest).digest("hex");
      out.push(chain);
    }
    return out;
  }

  link(items: unknown[]): SessionLink | undefined {
    if (!items.length) return undefined;
    const prefixes = this.prefixDigests(items), digest = prefixes[prefixes.length - 1];
    const same = this.byDigest.get(digest);
    if (same) return { ...same, digest, messages: items.length };
    for (let k = prefixes.length - 2; k >= 0; k--) {
      const previous = this.byDigest.get(prefixes[k]);
      if (previous) return { id: previous.id, turn: previous.turn + 1, digest, parent: previous.digest, messages: items.length };
    }
    return { id: digest.slice(0, 16), turn: 1, digest, parent: null, messages: items.length };
  }

  remember(link: SessionLink) {
    this.byDigest.delete(link.digest);
    this.byDigest.set(link.digest, link);
    if (this.byDigest.size > this.capacity) this.byDigest.delete(this.byDigest.keys().next().value!);
  }

  rebuild(records: Iterable<object>) { for (const r of records as Iterable<SessionRecordLike>) if (r.session) this.remember(r.session); return this; }
}
