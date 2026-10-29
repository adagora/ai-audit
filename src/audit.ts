import { createHash, randomUUID } from "node:crypto";
import { accessSync, appendFileSync, closeSync, constants, existsSync, fstatSync, openSync, readdirSync, readSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import vm from "node:vm";
import BendUsage from "./bend/usage.mjs";
import { bendCount, bendListOf } from "./context.js";
import { tokenCount } from "./extract.js";
import { firstSightings } from "./injection.js";
import { policyHistories } from "./policies.js";
import { findingTotals } from "./scan.js";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const GENESIS = "0".repeat(64);
const LOCK_STALE_MS = 10_000, LOCK_WAIT_MS = 5_000;
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export class AuditLogUnavailable extends Error { constructor(reason: string) { super(`audit_log_unavailable: ${reason}`); } }

export interface Step { source: string; input: unknown; output: unknown }
export interface Review { reviewer: string; decision: "approved" | "overridden" | "rejected"; note?: string; at: string }
export interface Effect { action: string; status: "done" | "skipped" | "failed"; review?: string; code?: string }
export interface Entry {
  systemId: string; useCase: string; llmCallId?: string;
  input: string; storeRedactedInput?: boolean;
  sources?: { doc: string; page?: number }[];
  model?: { name: string; version: string };
  prompt?: { templateId: string; template: string };
  params?: Record<string, unknown>;
  output: unknown;
  step?: Step;
  qdlDecision?: boolean;
}
export interface Rec {
  kind: "decision" | "review" | "llm-call" | "program" | "refusal" | "segment" | "prune" | "effect"; id: string; ts: string; refId?: string;
  systemId?: string; useCase?: string; llmCallId?: string; inputHash?: string; redactedInput?: string;
  sources?: { doc: string; page?: number }[]; model?: { name: string; version: string };
  prompt?: { templateId: string; hash: string }; params?: Record<string, unknown>; output?: unknown;
  step?: { sourceHash: string; input: unknown; outputHash: string };
  review?: Review; effect?: Effect; prevHash: string; hash: string;
  [extra: string]: unknown;
}

export function redact(s: string): string {
  return s.replace(/(?:(?<![\w.+-])[\w.+-]+|[\w.+-]{1,64})@[\w-]+\.[\w.]+/g, "[EMAIL]")
    .replace(/\+?\d[\d \-]{7,}\d/g, "[PHONE]")
    .replace(/\b\d{11}\b/g, "[PESEL]");
}

export const canon = (o: unknown): string => JSON.stringify(o, (_k, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);

const READ_CHUNK = 1 << 20;
export function* fileLines(path: string): Generator<string> {
  const fd = openSync(path, "r"), buf = Buffer.alloc(READ_CHUNK);
  try {
    let rest: Buffer[] = [];
    for (let n = readSync(fd, buf, 0, READ_CHUNK, null); n > 0; n = readSync(fd, buf, 0, READ_CHUNK, null)) {
      const chunk = buf.subarray(0, n);
      let from = 0;
      for (let nl = chunk.indexOf(0x0a, from); nl >= 0; nl = chunk.indexOf(0x0a, from)) {
        const line = Buffer.concat([...rest, chunk.subarray(from, nl)]).toString("utf8");
        rest = []; from = nl + 1;
        if (line) yield line;
      }
      if (from < n) rest.push(Buffer.from(chunk.subarray(from)));
    }
    const last = Buffer.concat(rest).toString("utf8");
    if (last) yield last;
  } finally { closeSync(fd); }
}
const recordsOf = (path: string): Rec[] => Array.from(fileLines(path), (l) => JSON.parse(l));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface SegmentLink { file: string; count: number; head: string }
const segmentNameTime = (file: string, ext: string) => {
  const c = basename(file, ext).slice(-19);
  return Date.parse(`${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}T${c.slice(9, 11)}:${c.slice(11, 13)}:${c.slice(13, 15)}.${c.slice(15, 18)}Z`);
};
export interface SeriesCheck { ok: boolean; badLine?: number; reason?: string; file?: string; files: number; records: number; prunedBefore?: string }
export function checkSeries(files: Iterable<readonly [string, Iterable<string>]>): SeriesCheck {
  let previous: SegmentLink | undefined, missing: { file: string; at: string; ts: string } | undefined, records = 0, n = 0;
  const pruned = new Set<string>();
  for (const [name, lines] of files) {
    let prev = GENESIS, count = 0, first: Rec | undefined;
    n++;
    for (const line of lines) {
      count++;
      let r: Rec;
      try { r = JSON.parse(line); } catch { return { ok: false, file: name, badLine: count, reason: "invalid JSON", files: n, records }; }
      if (!r || typeof r !== "object" || Array.isArray(r)) return { ok: false, file: name, badLine: count, reason: "not a record", files: n, records };
      const { hash, ...body } = r;
      if (r.prevHash !== prev) return { ok: false, file: name, badLine: count, reason: "prevHash mismatch", files: n, records };
      if (sha256(canon(body)) !== hash) return { ok: false, file: name, badLine: count, reason: "hash mismatch", files: n, records };
      if (count === 1) first = r;
      if (r.kind === "prune" && Array.isArray(r.segments)) for (const s of r.segments as { file?: unknown }[]) if (typeof s?.file === "string") pruned.add(s.file);
      prev = hash;
    }
    const link = first?.kind === "segment" ? first.previous as SegmentLink : undefined;
    if (previous && (link?.file !== previous.file || link.count !== previous.count || link.head !== previous.head))
      return { ok: false, file: name, badLine: 1, reason: `segment does not continue ${previous.file}`, files: n, records };
    if (!previous && link) missing = { file: link.file, at: name, ts: first!.ts };
    previous = { file: name, count, head: prev }; records += count;
  }
  if (missing && !pruned.has(missing.file)) return { ok: false, file: missing.at, badLine: 1, reason: `segment ${missing.file} is missing and no prune record lists it`, files: n, records };
  return { ok: true, files: n, records, ...(missing && { prunedBefore: missing.ts }) };
}

export class AuditLog {
  steps = new Map<string, string>();
  constructor(public path: string, private now = () => new Date().toISOString(), public rotateBytes = 0) {}

  closedSegments(): string[] {
    const dir = dirname(this.path), ext = extname(this.path), stem = basename(this.path, ext);
    const name = new RegExp(`^${escapeRe(stem)}\\.\\d{8}T\\d{9}Z${escapeRe(ext)}$`);
    try { return readdirSync(dir).filter((f) => name.test(f)).sort().map((f) => join(dir, f)); } catch { return []; }
  }
  files(): string[] { return [...this.closedSegments(), ...(existsSync(this.path) ? [this.path] : [])]; }
  read(): Rec[] { return this.files().flatMap(recordsOf); }
  readCurrent(): Rec[] { return existsSync(this.path) ? recordsOf(this.path) : []; }
  readRecent(): Rec[] { return this.files().slice(-2).flatMap(recordsOf); }
  private lastHash(): string {
    if (!existsSync(this.path)) return GENESIS;
    const fd = openSync(this.path, "r");
    try {
      let pos = fstatSync(fd).size, tail = "";
      while (pos > 0) {
        const n = Math.min(65536, pos); pos -= n; const b = Buffer.alloc(n); readSync(fd, b, 0, n, pos);
        tail = b.toString("latin1") + tail; const t = tail.trimEnd(), nl = t.lastIndexOf("\n");
        if (pos + n === fstatSync(fd).size && n > 0 && b[n - 1] !== 0x0a) throw new AuditLogUnavailable("torn last line, run `ai-audit verify`");
        if (nl >= 0 || pos === 0) { const line = Buffer.from(t.slice(nl + 1), "latin1").toString("utf8"); return line ? JSON.parse(line).hash : GENESIS; }
      }
      return GENESIS;
    } finally { closeSync(fd); }
  }
  private withLock<T>(fn: () => T): T {
    const lock = this.path + ".lock", deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      try { const fd = openSync(lock, "wx"); writeSync(fd, String(process.pid)); closeSync(fd); break; }
      catch (e: any) {
        if (e.code !== "EEXIST") throw new AuditLogUnavailable(`lock ${e.code}`);
        try { if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) { unlinkSync(lock); continue; } } catch { continue; }
        if (Date.now() > deadline) throw new AuditLogUnavailable("lock timeout");
        pause(2);
      }
    }
    try { return fn(); } finally { try { unlinkSync(lock); } catch { } }
  }
  ensureWritable(): void {
    try { accessSync(existsSync(this.path) ? this.path : dirname(this.path), constants.W_OK); }
    catch { throw new AuditLogUnavailable("not writable"); }
    try { this.lastHash(); } catch (e) { throw e instanceof AuditLogUnavailable ? e : new AuditLogUnavailable("unparseable last line"); }
  }
  rotate(): SegmentLink | undefined { return this.withLock(() => this.rotateLocked()); }
  private rotateLocked(): SegmentLink | undefined {
    if (!existsSync(this.path) || statSync(this.path).size === 0) return undefined;
    try { this.lastHash(); } catch (e) { throw e instanceof AuditLogUnavailable ? e : new AuditLogUnavailable("unparseable last line"); }
    const ts = this.segmentTime(), ext = extname(this.path), target = join(dirname(this.path), `${basename(this.path, ext)}.${ts.replace(/[-:.]/g, "")}${ext}`);
    if (!/^\d{8}T\d{9}Z$/.test(ts.replace(/[-:.]/g, "")) || existsSync(target)) throw new AuditLogUnavailable("segment name unavailable");
    try { renameSync(this.path, target); } catch (e: any) { throw new AuditLogUnavailable(`rotate ${e.code ?? "failed"}`); }
    return this.startSegment(ts);
  }
  private segmentTime(): string {
    const now = this.now(), at = Date.parse(now), ext = extname(this.path);
    let linked: unknown;
    for (const line of fileLines(this.path)) { linked = JSON.parse(line).previous?.file; break; }
    const after = Math.max(...[this.closedSegments().at(-1), linked].filter((f): f is string => typeof f === "string")
      .map((f) => segmentNameTime(f, ext) + 1).filter(Number.isFinite));
    return at < after ? new Date(after).toISOString() : now;
  }
  private startSegment(ts = this.now()): SegmentLink {
    const closed = this.closedSegments().at(-1)!;
    let count = 0, last = "";
    for (const line of fileLines(closed)) { count++; last = line; }
    const previous = { file: basename(closed), count, head: last ? JSON.parse(last).hash : GENESIS };
    const body = { kind: "segment", id: randomUUID(), ts, previous, prevHash: GENESIS }, pending = this.path + ".segment";
    if (existsSync(this.path)) throw new AuditLogUnavailable("segment EEXIST");
    try { writeFileSync(pending, JSON.stringify({ ...body, hash: sha256(canon(body)) }) + "\n"); renameSync(pending, this.path); }
    catch (e: any) { throw new AuditLogUnavailable(`segment ${e.code ?? "failed"}`); }
    return previous;
  }
  append(r: Omit<Rec, "prevHash" | "hash">): Rec { return this.withLock(() => this.appendLocked(r)); }
  private appendLocked(r: Omit<Rec, "prevHash" | "hash">): Rec {
    const size = existsSync(this.path) ? statSync(this.path).size : -1;
    if (this.rotateBytes > 0 && size > this.rotateBytes) this.rotateLocked();
    else if (size <= 0 && this.closedSegments().length) { if (size === 0) unlinkSync(this.path); this.startSegment(); }
    let prevHash: string;
    try { prevHash = this.lastHash(); } catch (e) { throw e instanceof AuditLogUnavailable ? e : new AuditLogUnavailable("unparseable last line"); }
    const body = { ...r, prevHash };
    const rec = { ...body, hash: sha256(canon(body)) } as Rec;
    appendFileSync(this.path, JSON.stringify(rec) + "\n");
    return rec;
  }

  record(e: Entry): Rec {
    let step: Rec["step"];
    if (e.step) {
      const sourceHash = sha256(e.step.source);
      this.steps.set(sourceHash, e.step.source);
      step = { sourceHash, input: e.step.input, outputHash: sha256(canon(e.step.output)) };
    }
    return this.append({
      kind: "decision", id: randomUUID(), ts: this.now(), systemId: e.systemId, useCase: e.useCase, llmCallId: e.llmCallId,
      inputHash: sha256(e.input), redactedInput: e.storeRedactedInput ? redact(e.input) : undefined,
      sources: e.sources, model: e.model,
      prompt: e.prompt && { templateId: e.prompt.templateId, hash: sha256(e.prompt.template) },
      params: e.params, output: e.output, step, ...(e.qdlDecision && { qdlDecision: true }),
    });
  }

  approve(refId: string, reviewer: string, decision: Review["decision"], note?: string): Rec {
    return this.withLock(() => {
      const records = this.read();
      if (!records.some((r) => r.kind === "decision" && r.id === refId && !r.qdl)) throw new Error("audit_unknown_decision");
      if (records.some((r) => r.kind === "review" && r.refId === refId)) throw new Error("audit_already_reviewed");
      return this.appendLocked({ kind: "review", id: randomUUID(), ts: this.now(), refId, review: { reviewer, decision, note, at: this.now() } });
    });
  }

  effect(refId: string, effect: Effect): Rec {
    const valid = /^[A-Za-z0-9_.:-]{1,128}$/.test(effect.action) && ["done", "skipped", "failed"].includes(effect.status)
      && (effect.code === undefined || /^[a-z0-9_]{1,64}$/.test(effect.code)) && (effect.review === undefined || typeof effect.review === "string");
    if (!valid) throw new Error("audit_effect_invalid");
    const records = this.read();
    if (!records.some((r) => r.kind === "decision" && r.id === refId && !r.qdl)) throw new Error("audit_unknown_decision");
    if (effect.review !== undefined && !records.some((r) => r.kind === "review" && r.id === effect.review && r.refId === refId)) throw new Error("audit_unknown_review");
    const { action, status, review, code } = effect;
    return this.append({ kind: "effect", id: randomUUID(), ts: this.now(), refId, effect: { action, status, ...(review && { review }), ...(code && { code }) } });
  }

  verifySeries(): SeriesCheck { return checkSeries(this.files().map((f) => [basename(f), fileLines(f)] as const)); }
  verifyChain(): { ok: boolean; badLine?: number; reason?: string; file?: string } {
    const v = this.verifySeries();
    return v.ok ? { ok: true } : { ok: false, badLine: v.badLine, reason: v.reason, ...(v.file !== basename(this.path) && { file: v.file }) };
  }
}

export function prune(log: AuditLog, keepDays: number, now = new Date()) {
  if (!Number.isInteger(keepDays) || keepDays < 1) throw new Error("audit_invalid_keep_days");
  if (!log.verifySeries().ok) throw new Error("audit_chain_broken");
  const cutoff = new Date(now.getTime() - keepDays * 86_400_000).toISOString(), old: (SegmentLink & { first: string; firstTs: string; lastTs: string })[] = [];
  for (const f of log.closedSegments()) {
    let count = 0, head = GENESIS, first = GENESIS, firstTs = "~", lastTs = "";
    for (const line of fileLines(f)) {
      const r = JSON.parse(line) as Rec;
      if (count++ === 0) first = r.hash;
      head = r.hash;
      if (r.ts < firstTs) firstTs = r.ts;
      if (r.ts > lastTs) lastTs = r.ts;
    }
    if (lastTs >= cutoff) break;
    old.push({ file: basename(f), count, head, first, firstTs, lastTs });
  }
  if (!old.length) return [];
  log.append({ kind: "prune", id: randomUUID(), ts: now.toISOString(), keepDays, segments: old });
  for (const s of old) unlinkSync(join(dirname(log.path), s.file));
  return old;
}

export function replay(log: AuditLog, recId: string, opts = { timeoutMs: 200, maxSteps: 10_000 }) {
  const r = log.read().find((x) => x.id === recId);
  if (!r?.step) throw new Error("no deterministic step on record");
  const source = log.steps.get(r.step.sourceHash);
  if (!source || sha256(source) !== r.step.sourceHash) throw new Error("step source missing or altered");
  let n = 0;
  const tick = () => { if (++n > opts.maxSteps) throw new Error(`step budget exceeded (${opts.maxSteps})`); };
  const fn = vm.runInNewContext(`(${source})`, Object.create(null), { timeout: opts.timeoutMs });
  const out = vm.runInNewContext("fn(input, tick)", { fn, input: structuredClone(r.step.input), tick }, { timeout: opts.timeoutMs });
  const output = JSON.parse(JSON.stringify(out));
  const outputHash = sha256(canon(output));
  return { output, reproduced: outputHash === r.step.outputHash, steps: n };
}

export type EvidenceReason = "companion-missing" | "program-missing" | "not-reconstructible" | "output-mismatch";
export interface EvidenceGap { id: string; reason: EvidenceReason }

function companionOf(records: any[], id: string) {
  return records.find((r) => r?.qdl && r.refId === id);
}
function mainOf(records: any[], id: string) {
  const direct = records.find((r) => r?.kind === "decision" && r.id === id && !r.qdl);
  if (direct) return direct;
  const companion = records.find((r) => r?.id === id && r.qdl);
  return companion?.refId ? records.find((r) => r?.id === companion.refId && !r.qdl) : undefined;
}
export function replayableQdl(records: any[], id: string): boolean {
  const main = mainOf(records, id);
  if (!main) return false;
  if (main.step) return true;
  const q = companionOf(records, main.id)?.qdl;
  if (!q || q.inputs === undefined) return false;
  if (typeof q.sourceHash === "string" && typeof q.source !== "string" && !records.some((r) => r?.kind === "program" && r.id === q.sourceHash)) return false;
  return true;
}
export function decisionConsistency(records: any[], id: string): { ok: boolean; reason?: EvidenceReason } {
  const main = mainOf(records, id);
  if (!main) return { ok: false, reason: "companion-missing" };
  const companion = companionOf(records, main.id);
  if (!companion) return { ok: false, reason: "companion-missing" };
  const q = companion.qdl;
  if (q.inputs === undefined) return { ok: false, reason: "not-reconstructible" };
  if (typeof q.sourceHash === "string" && typeof q.source !== "string" && !records.some((r) => r?.kind === "program" && r.id === q.sourceHash)) return { ok: false, reason: "program-missing" };
  const outputOk = q.outputsHash !== undefined ? sha256(canon(main.output)) === q.outputsHash : main.output === undefined;
  return outputOk ? { ok: true } : { ok: false, reason: "output-mismatch" };
}
export function evidenceGaps(records: any[], decisions: any[]): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  for (const d of decisions) {
    if (d.step && !d.qdlDecision) continue;
    const companion = companionOf(records, d.id);
    if (!d.qdlDecision && !companion) continue;
    const consistency = decisionConsistency(records, d.id);
    if (!consistency.ok && consistency.reason) gaps.push({ id: d.id, reason: consistency.reason });
  }
  return gaps;
}

const billed = (c: any) => c.kind === "llm-call" && c.decision?.action !== "block" && c.upstreamStatus >= 200 && c.upstreamStatus < 400;
export function tokenTotals(calls: any[]) {
  const t: { input: number; output: number; unknownInput: number; unknownOutput: number; unknownUsage: number } = BendUsage["totals.fast"](
    bendListOf(calls, (c) => ({ $: "Call", billed: billed(c), input: bendCount(c.usage?.input), output: bendCount(c.usage?.output) })));
  return { inputTokens: t.input, outputTokens: t.output, unknownInputUsage: t.unknownInput, unknownOutputUsage: t.unknownOutput, unknownUsage: t.unknownUsage,
    tokensComplete: t.unknownInput === 0 && t.unknownOutput === 0 };
}

export interface UseCaseRow {
  useCase: string | null; tiers: string[]; versions: number; calls: number; forwarded: number; redacted: number; blocked: number; rejected: number; refused: number; gateHolds: number;
  inputTokens: number; outputTokens: number; unknownUsage: number; decisions: number; reviewed: number; overridden: number; overrideRatePct: number | null;
}

export function useCaseSummary(all: Rec[], inRange: (ts: string) => boolean): UseCaseRow[] {
  const groups = new Map<string | null, { calls: any[]; refused: number; decisions: Rec[] }>();
  const group = (name: unknown) => {
    const key = typeof name === "string" ? name : null;
    let g = groups.get(key);
    if (!g) groups.set(key, g = { calls: [], refused: 0, decisions: [] });
    return g;
  };
  for (const r of all) {
    if (typeof r.ts !== "string" || !inRange(r.ts)) continue;
    if (r.kind === "llm-call") group(r.useCase).calls.push(r);
    else if (r.kind === "refusal" && !r.suppressed) group(r.useCase).refused++;
    else if (r.kind === "decision" && !r.qdl) group(r.useCase).decisions.push(r);
  }
  const latest = new Map<string, Review>();
  for (const r of all) if (r.kind === "review" && r.refId && r.review) latest.set(r.refId, r.review);
  const rows = [...groups].map(([useCase, g]): UseCaseRow => {
    const policies = g.calls.map((c) => c.useCasePolicy).filter((p) => p && typeof p.tier === "string" && typeof p.digest === "string");
    const reviews = g.decisions.flatMap((d) => latest.has(d.id) ? [latest.get(d.id)!] : []);
    const overridden = reviews.filter((v) => v.decision !== "approved").length;
    const action = (a: string) => g.calls.filter((c) => c.decision?.action === a).length;
    const tokens = tokenTotals(g.calls);
    return { useCase, tiers: [...new Set(policies.map((p) => p.tier as string))], versions: new Set(policies.map((p) => p.digest)).size, calls: g.calls.length,
      forwarded: action("forward-original"), redacted: action("forward-redacted"), blocked: action("block"), rejected: action("reject"), refused: g.refused,
      gateHolds: g.calls.reduce((n, c) => n + (c.actionGate?.calls ?? []).filter((x: any) => x.result === "hold").length, 0),
      inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, unknownUsage: tokens.unknownUsage,
      decisions: g.decisions.length, reviewed: reviews.length, overridden, overrideRatePct: reviews.length ? Math.round((overridden / reviews.length) * 1000) / 10 : null };
  });
  if (rows.every((r) => r.useCase === null)) return [];
  return rows.sort((a, b) => a.useCase === null ? 1 : b.useCase === null ? -1 : a.useCase < b.useCase ? -1 : a.useCase > b.useCase ? 1 : 0);
}

export function report(log: AuditLog, from: string, to: string) {
  const all = log.read();
  const inRange = (ts: string) => ts >= from && ts < to;
  const dec = all.filter((r) => r.kind === "decision" && !r.qdl && inRange(r.ts));
  const steps = all.filter((r) => r.qdl && inRange(r.ts)) as any[];
  const qdl = { completed: 0, refused: 0, failed: 0 };
  const policies = periodPolicies(all, inRange);
  const evidence = evidenceGaps(all, dec);
  steps.forEach((s) => qdl[(s.qdl.status ?? "completed") as keyof typeof qdl]++);
  const ids = new Set(dec.map((d) => d.id));
  const rev = all.filter((r) => r.kind === "review" && ids.has(r.refId!));
  const last = new Map<string, Review>(); rev.forEach((r) => last.set(r.refId!, r.review!));
  const overridden = [...last.values()].filter((v) => v.decision !== "approved").length;
  const src = new Map<string, number>();
  dec.forEach((d) => d.sources?.forEach((s) => { const k = `${s.doc}${s.page ? ` s.${s.page}` : ""}`; src.set(k, (src.get(k) ?? 0) + 1); }));
  const v = log.verifyChain();
  const stats = { decisions: dec.length, reviewed: last.size, unreviewed: dec.length - last.size, overridden,
    overrideRatePct: last.size ? Math.round((overridden / last.size) * 1000) / 10 : 0, withReplayableStep: dec.filter((d) => replayableQdl(all, d.id)).length };
  const calls = all.filter((r) => r.kind === "llm-call" && inRange(r.ts)) as any[];
  const refusalRecords = all.filter((r) => r.kind === "refusal" && inRange(r.ts)) as any[];
  const refusals = { recorded: refusalRecords.filter((r) => !r.suppressed).length, suppressed: refusalRecords.reduce((a, r) => a + (r.suppressed ?? 0), 0) };
  const llm = { calls: calls.length, blocked: calls.filter((c) => c.decision.action === "block").length,
    redacted: calls.filter((c) => c.decision.action === "forward-redacted").length,
    withFindings: calls.filter((c) => c.decision.findings.length).length, withInjectionSignals: calls.filter((c) => c.decision.signals?.length).length, withQuinelings: calls.filter((c) => c.quinelings?.length).length, contentLogged: calls.filter((c) => c.content === "redacted").length, upstreamErrors: calls.filter((c) => c.upstreamStatus >= 400).length,
    ...tokenTotals(calls) };
  const sighted = new Set<string>();
  const toolUses = calls.flatMap((c) => (c.toolCalls ?? []).map((t: any) => `${c.virtualKey ?? "(klucz dostawcy)"} / ${t.name}`));
  const gateHolds = calls.flatMap((c) => (c.actionGate?.calls ?? []).filter((g: any) => g.result === "hold")
    .map((g: any) => `${g.mode} ${g.tool}${g.toolAllowed === false ? " (poza listą klucza)" : ""}${g.useCaseToolAllowed === false ? " (poza listą przypadku użycia)" : ""}`));
  const count = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([k, x]) => `- ${k}: ${x}`);
  const useCases = useCaseSummary(all, inRange);
  const md = [
    `# Raport audytowy AI (${from} – ${to})`, "",
    `Integralność łańcucha: ${v.ok ? "OK ✅" : `NARUSZONA ❌ (linia ${v.badLine}: ${v.reason})`}`, "",
    "| Metryka | Wartość |", "|---|---|",
    ...Object.entries(stats).map(([k, x]) => `| ${k} | ${x} |`), "",
    ...(useCases.length ? ["## Przypadki użycia (ADR 0053)", "Odmowy liczą tylko rekordy z nazwą przypadku. Nadpisane to ostatnie recenzje inne niż „approved”.",
      "| przypadek | poziom | wersje wiersza | wywołania | przekazane | zredagowane | zablokowane | odrzucone | odmowy | wstrzymane narzędzia | tokeny we / wy | decyzje | ocenione | nadpisane |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
      ...useCases.map((u) => `| ${u.useCase ?? "(brak)"} | ${u.tiers.join(" → ") || "—"} | ${u.versions} | ${u.calls} | ${u.forwarded} | ${u.redacted} | ${u.blocked} | ${u.rejected} | ${u.refused} | ${u.gateHolds} | ${u.inputTokens} / ${u.outputTokens}${u.unknownUsage ? ` (+${u.unknownUsage} bez danych)` : ""} | ${u.decisions} | ${u.reviewed} | ${u.overridden}${u.overrideRatePct === null ? "" : ` (${u.overrideRatePct} %)`} |`), ""] : []),
    ...(steps.length ? ["## Kroki QDL", "| status | liczba |", "|---|---|", ...Object.entries(qdl).map(([k, x]) => `| ${k} | ${x} |`), ""] : []),
    ...(policies.length ? ["## Wersje polityk QDL", "Wersje są numerowane z całego dziennika. „aktualna” oznacza wersję ostatniej decyzji w całym dzienniku, nie ostatnią w tym oknie.", ...policies.flatMap((p) => [`### ${p.systemId} / ${p.useCase}`,
      ...p.versions.map((v) => `- v${v.version}${v.current ? " (aktualna)" : ""} ${v.sourceHash.slice(0, 15)}…${v.name ? ` „${v.name}”` : ""}: decyzje ${v.decisions}, ${v.firstUsed} – ${v.lastUsed}`)]), ""] : []),
    ...(evidence.length ? ["## Niepełne dowody decyzji", ...evidence.map((g) => `- ${g.id}: ${GAP_TEXT[g.reason]}`), ""] : []),
    "## Decyzje według systemu", ...Object.entries(dec.reduce<Record<string, number>>((a, d) => ((a[`${d.systemId} / ${d.useCase}`] = (a[`${d.systemId} / ${d.useCase}`] ?? 0) + 1), a), {})).map(([k, x]) => `- ${k}: ${x}`), "",
    "## Cytowane źródła", ...(src.size ? [...src].map(([k, x]) => `- ${k}: ${x}`) : ["- brak"]), "",
    "## Modele", ...[...new Set(dec.filter((d) => d.model).map((d) => `${d.model!.name}@${d.model!.version}`))].map((m) => `- ${m}`), "",
    "## Wywołania LLM przez proxy", "| Metryka | Wartość |", "|---|---|", ...Object.entries(llm).map(([k, x]) => `| ${k} | ${x} |`), "",
    ...(llm.tokensComplete ? [] : [`> Token totals are a lower bound: ${llm.unknownUsage} call(s) without usage from the provider (unknown, not zero).`, ""]),
    "### Według dostawcy / modelu / systemu", ...count(calls.map((c) => `${c.provider} / ${c.model ?? "?"} / ${c.systemId ?? "-"}`)), "",
    "### Wykryte reguły (tylko ID)", ...[...calls.reduce((m: Map<string, number>, c) => { findingTotals(c.decision).forEach((n, rule) => m.set(rule, (m.get(rule) ?? 0) + n)); return m; }, new Map<string, number>())].map(([k, x]) => `- ${k}: ${x}`), "",
    "### Sygnały prompt injection (advisory, tylko ID)", ...count(calls.flatMap((c) => firstSightings(c.decision.signals ?? [], c.session?.id, sighted).map((f: any) => f.rule))), "",
    ...(toolUses.length ? ["### Narzędzia wywołane przez model (klucz / narzędzie)", ...count(toolUses), ""] : []),
    ...(gateHolds.length ? ["### Wstrzymane wywołania narzędzi (ADR 0046, 0048)", ...count(gateHolds), ""] : []),
    ...(refusalRecords.length ? ["## Odmowy przed inspekcją (bez treści, ADR 0047)", ...count(refusalRecords.filter((r) => !r.suppressed).map((r) => `${r.status} ${r.code}`)),
      ...(refusals.suppressed ? [`- bez szczegółów (limit na minutę): ${refusals.suppressed}`] : []), ""] : []),
    ...(llm.withQuinelings ? ["### Quinelings w ruchu (tylko hashe, ADR 0024)", ...count(calls.flatMap((c) => (c.quinelings ?? []).map((e: any) => `${e.where} ${e.op}${e.status ? ` ${e.status}` : ""}${e.error ? ` error ${e.error.code}` : ""}`))), ""] : []),
    "_Raport generowany automatycznie z dziennika. Nie stanowi porady prawnej._",
  ].join("\n");
  return { md, stats, llm, refusals, qdl, policies, evidence, useCases };
}

const GAP_TEXT = { "companion-missing": "brak zapisu QDL", "program-missing": "brak programu", "not-reconstructible": "wynik zapisany, nie do odtworzenia", "output-mismatch": "wynik decyzji nie zgadza się z zapisem QDL" };

function periodPolicies(all: Rec[], inRange: (ts: string) => boolean) {
  const steps = new Map<string, any>();
  for (const r of all) if (r.qdl && typeof r.refId === "string") steps.set(r.refId, r.qdl);
  return policyHistories(all).map((h) => ({
    ...h,
    versions: h.versions.flatMap((v) => {
      const used = all.filter((d) => d.kind === "decision" && !d.qdl && d.systemId === h.systemId && d.useCase === h.useCase && steps.get(d.id)?.sourceHash === v.sourceHash && inRange(d.ts));
      if (!used.length) return [];
      const times = used.map((d) => d.ts).sort();
      return [{ ...v, decisions: used.length, firstUsed: times[0], lastUsed: times[times.length - 1] }];
    }),
  })).filter((h) => h.versions.length);
}

export function anchor(log: AuditLog, anchorsPath: string, now = new Date().toISOString()) {
  let count = 0, first = "", last = "";
  if (existsSync(log.path)) for (const line of fileLines(log.path)) { if (count++ === 0) first = line; last = line; }
  const a = { ts: now, count, head: last ? JSON.parse(last).hash : GENESIS, ...(first && { first: JSON.parse(first).hash as string }) };
  appendFileSync(anchorsPath, JSON.stringify(a) + "\n"); return a;
}
export function verifyAnchors(log: AuditLog, anchorsPath: string): { ok: boolean; anchors: number; pruned?: number; reason?: string } {
  const chain = log.verifySeries();
  if (!chain.ok) return { ok: false, anchors: 0, reason: `chain broken at ${chain.file === basename(log.path) ? "" : `${chain.file} `}line ${chain.badLine}: ${chain.reason}` };
  const as: { ts: string; count: number; head: string; first?: string }[] = Array.from(fileLines(anchorsPath), (l) => JSON.parse(l));
  const wanted = new Set(as.map((a) => a.count)), found = new Set<string>(), present = new Set<string>(), prunedFirst = new Set<string>();
  let longest = 0, pruned = 0;
  for (const f of log.files()) {
    let count = 0;
    for (const line of fileLines(f)) {
      if (++count !== 1 && !wanted.has(count) && !line.includes('"kind":"prune"')) continue;
      const r = JSON.parse(line);
      if (count === 1) present.add(r.hash);
      if (wanted.has(count)) found.add(`${count}:${r.hash}`);
      if (r.kind === "prune" && Array.isArray(r.segments)) for (const s of r.segments) if (typeof s?.first === "string") prunedFirst.add(s.first);
    }
    longest = Math.max(longest, count);
  }
  for (const a of as) {
    if (a.count === 0 ? a.head === GENESIS : found.has(`${a.count}:${a.head}`)) continue;
    if (a.first !== undefined ? !present.has(a.first) && prunedFirst.has(a.first) : chain.prunedBefore && a.ts < chain.prunedBefore) { pruned++; continue; }
    if (longest < a.count) return { ok: false, anchors: as.length, reason: `truncated: anchor ${a.ts} saw ${a.count} records, log has ${longest}` };
    return { ok: false, anchors: as.length, reason: `swapped: record ${a.count} hash differs from anchor ${a.ts}` };
  }
  return { ok: true, anchors: as.length, ...(pruned && { pruned }) };
}

export function stats(log: AuditLog, by: "key" | "model" | "hour", from = "", to = "~") {
  const g = new Map<string, { requests: number; errors: number; blocked: number; calls: any[]; cached: number; cacheWrite: number; injection: number; latencyMs: number[] }>();
  const sighted = new Set<string>();
  for (const c of log.read() as any[]) {
    if (c.kind !== "llm-call" || c.ts < from || c.ts >= to) continue;
    const k = by === "key" ? c.virtualKey ?? "(provider key)" : by === "model" ? `${c.provider}/${c.model ?? "?"}` : c.ts.slice(0, 13) + ":00Z";
    const r = g.get(k) ?? { requests: 0, errors: 0, blocked: 0, calls: [], cached: 0, cacheWrite: 0, injection: 0, latencyMs: [] }; g.set(k, r);
    r.requests++; if (c.decision?.action === "block") r.blocked++; else if (!(c.upstreamStatus >= 200 && c.upstreamStatus < 400)) r.errors++;
    r.calls.push(c); r.cached += tokenCount(c.usage?.cached) ?? 0; r.cacheWrite += tokenCount(c.usage?.cacheWrite) ?? 0; r.injection += firstSightings(c.decision?.signals ?? [], c.session?.id, sighted).length; r.latencyMs.push(c.latencyMs ?? 0);
  }
  return [...g].sort(([a], [b]) => a.localeCompare(b)).map(([group, r]) => {
    const l = r.latencyMs.sort((a, b) => a - b);
    return { group, requests: r.requests, errors: r.errors, blocked: r.blocked, ...tokenTotals(r.calls), cachedTokens: r.cached, cacheWriteTokens: r.cacheWrite, injectionSignals: r.injection,
      latencyAvgMs: Math.round(l.reduce((a, x) => a + x, 0) / l.length), latencyP95Ms: l[Math.min(l.length - 1, Math.floor(l.length * 0.95))] };
  });
}
