import { createHash, randomUUID } from "node:crypto";
import { accessSync, appendFileSync, closeSync, constants, existsSync, fstatSync, openSync, readFileSync, readSync, statSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import vm from "node:vm";
import BendUsage from "./bend/usage.mjs";
import { bendCount, bendListOf } from "./context.js";
import { tokenCount } from "./extract.js";
import { policyHistories } from "./policies.js";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const GENESIS = "0".repeat(64);
const LOCK_STALE_MS = 10_000, LOCK_WAIT_MS = 5_000;
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
export class AuditLogUnavailable extends Error { constructor(reason: string) { super(`audit_log_unavailable: ${reason}`); } }

export interface Step { source: string; input: unknown; output: unknown }
export interface Review { reviewer: string; decision: "approved" | "overridden" | "rejected"; note?: string; at: string }
export interface Entry {
  systemId: string; useCase: string; llmCallId?: string;
  input: string; storeRedactedInput?: boolean;
  sources?: { doc: string; page?: number }[];
  model?: { name: string; version: string };
  prompt?: { templateId: string; template: string };
  params?: Record<string, unknown>;
  output: unknown;
  step?: Step;
}
export interface Rec {
  kind: "decision" | "review" | "llm-call" | "program"; id: string; ts: string; refId?: string;
  systemId?: string; useCase?: string; llmCallId?: string; inputHash?: string; redactedInput?: string;
  sources?: { doc: string; page?: number }[]; model?: { name: string; version: string };
  prompt?: { templateId: string; hash: string }; params?: Record<string, unknown>; output?: unknown;
  step?: { sourceHash: string; input: unknown; outputHash: string };
  review?: Review; prevHash: string; hash: string;
  [extra: string]: unknown;
}

export function redact(s: string): string {
  return s.replace(/(?:(?<![\w.+-])[\w.+-]+|[\w.+-]{1,64})@[\w-]+\.[\w.]+/g, "[EMAIL]")
    .replace(/\+?\d[\d \-]{7,}\d/g, "[PHONE]")
    .replace(/\b\d{11}\b/g, "[PESEL]");
}

export const canon = (o: unknown): string => JSON.stringify(o, (_k, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v);

export class AuditLog {
  steps = new Map<string, string>();
  constructor(public path: string, private now = () => new Date().toISOString()) {}

  read(): Rec[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }
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
  append(r: Omit<Rec, "prevHash" | "hash">): Rec {
    return this.withLock(() => {
      let prevHash: string;
      try { prevHash = this.lastHash(); } catch (e) { throw e instanceof AuditLogUnavailable ? e : new AuditLogUnavailable("unparseable last line"); }
      const body = { ...r, prevHash };
      const rec = { ...body, hash: sha256(canon(body)) } as Rec;
      appendFileSync(this.path, JSON.stringify(rec) + "\n");
      return rec;
    });
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
      params: e.params, output: e.output, step,
    });
  }

  approve(refId: string, reviewer: string, decision: Review["decision"], note?: string): Rec {
    if (!this.read().some((r) => r.kind === "decision" && r.id === refId && !r.qdl)) throw new Error("audit_unknown_decision");
    return this.append({ kind: "review", id: randomUUID(), ts: this.now(), refId, review: { reviewer, decision, note, at: this.now() } });
  }

  verifyChain(): { ok: boolean; badLine?: number; reason?: string } {
    if (!existsSync(this.path)) return { ok: true };
    const lines = readFileSync(this.path, "utf8").split("\n").filter(Boolean);
    let prev = GENESIS;
    for (let i = 0; i < lines.length; i++) {
      let r: Rec;
      try { r = JSON.parse(lines[i]); } catch { return { ok: false, badLine: i + 1, reason: "invalid JSON" }; }
      const { hash, ...body } = r;
      if (r.prevHash !== prev) return { ok: false, badLine: i + 1, reason: "prevHash mismatch" };
      if (sha256(canon(body)) !== hash) return { ok: false, badLine: i + 1, reason: "hash mismatch" };
      prev = hash;
    }
    return { ok: true };
  }
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

const billed = (c: any) => c.kind === "llm-call" && c.decision?.action !== "block" && c.upstreamStatus >= 200 && c.upstreamStatus < 400;
export function tokenTotals(calls: any[]) {
  const t: { input: number; output: number; unknownInput: number; unknownOutput: number; unknownUsage: number } = BendUsage["totals.fast"](
    bendListOf(calls, (c) => ({ $: "Call", billed: billed(c), input: bendCount(c.usage?.input), output: bendCount(c.usage?.output) })));
  return { inputTokens: t.input, outputTokens: t.output, unknownInputUsage: t.unknownInput, unknownOutputUsage: t.unknownOutput, unknownUsage: t.unknownUsage,
    tokensComplete: t.unknownInput === 0 && t.unknownOutput === 0 };
}

export function report(log: AuditLog, from: string, to: string) {
  const all = log.read();
  const inRange = (ts: string) => ts >= from && ts < to;
  const dec = all.filter((r) => r.kind === "decision" && !r.qdl && inRange(r.ts));
  const steps = all.filter((r) => r.qdl && inRange(r.ts)) as any[], stepRefs = new Set(steps.map((s) => s.refId));
  const qdl = { completed: 0, refused: 0, failed: 0 };
  const policies = policyHistories(all.filter((r) => r.kind === "program" || inRange(r.ts)));
  steps.forEach((s) => qdl[(s.qdl.status ?? "completed") as keyof typeof qdl]++);
  const ids = new Set(dec.map((d) => d.id));
  const rev = all.filter((r) => r.kind === "review" && ids.has(r.refId!));
  const last = new Map<string, Review>(); rev.forEach((r) => last.set(r.refId!, r.review!));
  const overridden = [...last.values()].filter((v) => v.decision !== "approved").length;
  const src = new Map<string, number>();
  dec.forEach((d) => d.sources?.forEach((s) => { const k = `${s.doc}${s.page ? ` s.${s.page}` : ""}`; src.set(k, (src.get(k) ?? 0) + 1); }));
  const v = log.verifyChain();
  const stats = { decisions: dec.length, reviewed: last.size, unreviewed: dec.length - last.size, overridden,
    overrideRatePct: last.size ? Math.round((overridden / last.size) * 1000) / 10 : 0, withReplayableStep: dec.filter((d) => d.step || stepRefs.has(d.id)).length };
  const calls = all.filter((r) => r.kind === "llm-call" && inRange(r.ts)) as any[];
  const llm = { calls: calls.length, blocked: calls.filter((c) => c.decision.action === "block").length,
    redacted: calls.filter((c) => c.decision.action === "forward-redacted").length,
    withFindings: calls.filter((c) => c.decision.findings.length).length, withInjectionSignals: calls.filter((c) => c.decision.signals?.length).length, withQuinelings: calls.filter((c) => c.quinelings?.length).length, contentLogged: calls.filter((c) => c.content === "redacted").length, upstreamErrors: calls.filter((c) => c.upstreamStatus >= 400).length,
    ...tokenTotals(calls) };
  const count = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([k, x]) => `- ${k}: ${x}`);
  const md = [
    `# Raport audytowy AI (${from} – ${to})`, "",
    `Integralność łańcucha: ${v.ok ? "OK ✅" : `NARUSZONA ❌ (linia ${v.badLine}: ${v.reason})`}`, "",
    "| Metryka | Wartość |", "|---|---|",
    ...Object.entries(stats).map(([k, x]) => `| ${k} | ${x} |`), "",
    ...(steps.length ? ["## Kroki QDL", "| status | liczba |", "|---|---|", ...Object.entries(qdl).map(([k, x]) => `| ${k} | ${x} |`), ""] : []),
    ...(policies.length ? ["## Wersje polityk QDL", ...policies.flatMap((p) => [`### ${p.systemId} / ${p.useCase}`,
      ...p.versions.map((v) => `- v${v.version}${v.current ? " (aktualna)" : ""} ${v.sourceHash.slice(0, 15)}…${v.name ? ` „${v.name}”` : ""}: decyzje ${v.decisions}, ${v.firstUsed} – ${v.lastUsed}`)]), ""] : []),
    "## Decyzje według systemu", ...Object.entries(dec.reduce<Record<string, number>>((a, d) => ((a[`${d.systemId} / ${d.useCase}`] = (a[`${d.systemId} / ${d.useCase}`] ?? 0) + 1), a), {})).map(([k, x]) => `- ${k}: ${x}`), "",
    "## Cytowane źródła", ...(src.size ? [...src].map(([k, x]) => `- ${k}: ${x}`) : ["- brak"]), "",
    "## Modele", ...[...new Set(dec.filter((d) => d.model).map((d) => `${d.model!.name}@${d.model!.version}`))].map((m) => `- ${m}`), "",
    "## Wywołania LLM przez proxy", "| Metryka | Wartość |", "|---|---|", ...Object.entries(llm).map(([k, x]) => `| ${k} | ${x} |`), "",
    ...(llm.tokensComplete ? [] : [`> Token totals are a lower bound: ${llm.unknownUsage} call(s) without usage from the provider (unknown, not zero).`, ""]),
    "### Według dostawcy / modelu / systemu", ...count(calls.map((c) => `${c.provider} / ${c.model ?? "?"} / ${c.systemId ?? "-"}`)), "",
    "### Wykryte reguły (tylko ID)", ...(calls.length ? count(calls.flatMap((c) => c.decision.findings.map((f: any) => f.rule))) : []), "",
    "### Sygnały prompt injection (advisory, tylko ID)", ...count(calls.flatMap((c) => (c.decision.signals ?? []).map((f: any) => f.rule))), "",
    ...(llm.withQuinelings ? ["### Quinelings w ruchu (tylko hashe, ADR 0024)", ...count(calls.flatMap((c) => (c.quinelings ?? []).map((e: any) => `${e.where} ${e.op}${e.status ? ` ${e.status}` : ""}${e.error ? ` error ${e.error.code}` : ""}`))), ""] : []),
    "_Raport generowany automatycznie z dziennika. Nie stanowi porady prawnej._",
  ].join("\n");
  return { md, stats, llm, qdl, policies };
}

export function anchor(log: AuditLog, anchorsPath: string, now = new Date().toISOString()) {
  const recs = log.read(), a = { ts: now, count: recs.length, head: recs.length ? recs[recs.length - 1].hash : GENESIS };
  appendFileSync(anchorsPath, JSON.stringify(a) + "\n"); return a;
}
export function verifyAnchors(log: AuditLog, anchorsPath: string): { ok: boolean; anchors: number; reason?: string } {
  const chain = log.verifyChain(); if (!chain.ok) return { ok: false, anchors: 0, reason: `chain broken at line ${chain.badLine}: ${chain.reason}` };
  const recs = log.read(), as = readFileSync(anchorsPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  for (const a of as) {
    if (recs.length < a.count) return { ok: false, anchors: as.length, reason: `truncated: anchor ${a.ts} saw ${a.count} records, log has ${recs.length}` };
    const head = a.count ? recs[a.count - 1].hash : GENESIS;
    if (head !== a.head) return { ok: false, anchors: as.length, reason: `swapped: record ${a.count} hash differs from anchor ${a.ts}` };
  }
  return { ok: true, anchors: as.length };
}

export function stats(log: AuditLog, by: "key" | "model" | "hour", from = "", to = "~") {
  const g = new Map<string, { requests: number; errors: number; blocked: number; calls: any[]; cached: number; cacheWrite: number; injection: number; latencyMs: number[] }>();
  for (const c of log.read() as any[]) {
    if (c.kind !== "llm-call" || c.ts < from || c.ts >= to) continue;
    const k = by === "key" ? c.virtualKey ?? "(provider key)" : by === "model" ? `${c.provider}/${c.model ?? "?"}` : c.ts.slice(0, 13) + ":00Z";
    const r = g.get(k) ?? { requests: 0, errors: 0, blocked: 0, calls: [], cached: 0, cacheWrite: 0, injection: 0, latencyMs: [] }; g.set(k, r);
    r.requests++; if (c.decision?.action === "block") r.blocked++; else if (!(c.upstreamStatus >= 200 && c.upstreamStatus < 400)) r.errors++;
    r.calls.push(c); r.cached += tokenCount(c.usage?.cached) ?? 0; r.cacheWrite += tokenCount(c.usage?.cacheWrite) ?? 0; r.injection += c.decision?.signals?.length ?? 0; r.latencyMs.push(c.latencyMs ?? 0);
  }
  return [...g].sort(([a], [b]) => a.localeCompare(b)).map(([group, r]) => {
    const l = r.latencyMs.sort((a, b) => a - b);
    return { group, requests: r.requests, errors: r.errors, blocked: r.blocked, ...tokenTotals(r.calls), cachedTokens: r.cached, cacheWriteTokens: r.cacheWrite, injectionSignals: r.injection,
      latencyAvgMs: Math.round(l.reduce((a, x) => a + x, 0) / l.length), latencyP95Ms: l[Math.min(l.length - 1, Math.floor(l.length * 0.95))] };
  });
}
