import type { Rec, Review, UseCaseRow } from "./audit.js";
import { findingTotals } from "./scan.js";
import { TIERS, type Tier } from "./useCases.js";
import { effectAuthorized, proposedActions } from "./verdict.js";

export const STAGES = ["received", "key", "useCase", "shape", "model", "inspect", "decide", "budget", "upstream", "gate", "recorded"] as const;
export type Stage = (typeof STAGES)[number];
export type StageState = "pass" | "skip" | "flag" | "stop";
export type Outcome = "delivered" | "held" | "rewritten" | "upstream-error" | "upstream-failed" | "blocked" | "rejected" | "budget" | "refused";
export interface RequestPath {
  id: string; ts: string; kind: "llm-call" | "refusal"; stages: Partial<Record<Stage, StageState>>; notes: Partial<Record<Stage, string>>;
  outcome: Outcome; stoppedAt?: Stage; code?: string; status?: number;
}
export interface FlowStage { stage: Stage; reached: number; skipped: number; flagged: number; stopped: number; stops: Record<string, number>; flags: Record<string, number> }
export interface Flow { total: number; offPath: number; stages: FlowStage[]; outcomes: Partial<Record<Outcome, number>> }
export type DecisionState = "waiting" | "acted" | Review["decision"];
export interface DecisionAction { action: string; status: string }
export interface DecisionView {
  id: string; ts: string; systemId?: string; useCase?: string; llmCallId?: string; state: DecisionState; output: unknown; outputNames?: string[]; actions: DecisionAction[]; params?: Record<string, unknown>;
  qdl?: { status: string; sourceHash?: string; program?: string; inputs?: unknown; error?: unknown };
  reviews: { verdict: Review["decision"]; reviewer: string; at: string; note?: string }[];
  effects: { id: string; ts: string; action: string; status: string; code?: string; review?: string; authorized: boolean }[];
}
export interface Suggestion { id: string; severity: "info" | "warn"; title: string; detail: string; evidence: string[]; snippet?: string }
export interface ConfigLike { useCases?: Record<string, any>; keys?: { name: string; tools?: { mode: string; allow: string[] }; useCases?: string[] }[]; actionGate?: unknown }

const REFUSAL_STAGE: Record<string, Stage> = {
  audit_client_unauthorized: "key", audit_provider_not_allowed: "key",
  audit_use_case_required: "useCase", audit_use_case_not_allowed: "useCase", audit_use_case_off: "useCase",
  audit_unsupported_route: "shape", audit_body_too_large: "shape", audit_malformed_json: "shape", audit_duplicate_keys: "shape", audit_json_too_deep: "shape",
  audit_model_not_allowed: "model", audit_inspection_busy: "inspect",
};
const BUDGET_ERROR = /^audit_(budget|token_budget)_/;
export const PROMOTE_MIN_REVIEWS = 20, PROMOTE_MAX_OVERRIDE_PCT = 5, OVERRIDE_WARN_MIN_REVIEWS = 5, OVERRIDE_WARN_PCT = 20;
export const HELD_TOOL_MIN = 3, ENFORCE_READY_MIN_CALLS = 50, UNKNOWN_USAGE_WARN_SHARE = 0.05;

export function requestPath(r: any): RequestPath | undefined {
  if (r?.kind !== "llm-call" && r?.kind !== "refusal") return undefined;
  const path: RequestPath = { id: String(r.id), ts: String(r.ts), kind: r.kind, stages: {}, notes: {}, outcome: "delivered" };
  const pass = (...stages: Stage[]) => stages.forEach((s) => { path.stages[s] = "pass"; });
  const stop = (stage: Stage, outcome: Outcome, code?: unknown) => {
    path.stages[stage] = "stop"; path.stoppedAt = stage; path.outcome = outcome;
    if (typeof code === "string") path.code = code;
    return path;
  };
  if (r.kind === "refusal") {
    const at = typeof r.code === "string" ? REFUSAL_STAGE[r.code] : undefined;
    if (r.suppressed || !at) return undefined;
    pass(...STAGES.slice(0, STAGES.indexOf(at)));
    if (typeof r.status === "number") path.status = r.status;
    return stop(at, "refused", r.code);
  }
  pass("received", "key");
  path.stages.useCase = r.useCasePolicy ? "pass" : "skip";
  if (r.useCasePolicy) path.notes.useCase = `${r.useCase} · ${r.useCasePolicy.tier}`;
  pass("shape", "model");
  const action = r.decision?.action;
  if (action === "reject") return stop("inspect", "rejected", r.error);
  pass("inspect");
  const findings = [...findingTotals(r.decision).values()].reduce((a, n) => a + n, 0), signals = Array.isArray(r.decision?.signals) ? r.decision.signals.length : 0;
  if (findings || signals) path.notes.inspect = [findings && `${findings} finding${findings === 1 ? "" : "s"}`, signals && `${signals} signal${signals === 1 ? "" : "s"}`].filter(Boolean).join(", ");
  if (action === "block" && BUDGET_ERROR.test(r.error ?? "")) { pass("decide"); return stop("budget", "budget", r.error); }
  if (action === "block") return stop("decide", "blocked", r.decision?.findings?.[0]?.rule);
  if (action === "forward-redacted") { path.stages.decide = "flag"; path.notes.decide = "redacted"; } else pass("decide");
  path.stages.budget = r.tokenBudget ? "pass" : "skip";
  if (typeof r.upstreamStatus !== "number") return stop("upstream", "upstream-failed", r.error);
  path.status = r.upstreamStatus;
  const ok = r.upstreamStatus >= 200 && r.upstreamStatus < 400;
  path.stages.upstream = ok ? "pass" : "flag"; path.notes.upstream = `HTTP ${r.upstreamStatus}`;
  const calls: any[] = Array.isArray(r.actionGate?.calls) ? r.actionGate.calls : [], held = calls.filter((c) => c.result === "hold");
  if (!calls.length) path.stages.gate = "skip";
  else if (held.length) { path.stages.gate = "flag"; path.notes.gate = `${held.length} held${r.actionGate.rewritten ? ", answer rewritten" : ""}`; }
  else { pass("gate"); path.notes.gate = `${calls.length} checked`; }
  pass("recorded");
  path.outcome = r.actionGate?.rewritten ? "rewritten" : held.length ? "held" : ok ? "delivered" : "upstream-error";
  return path;
}

export function flow(records: readonly any[]): Flow {
  const stages = STAGES.map((stage): FlowStage => ({ stage, reached: 0, skipped: 0, flagged: 0, stopped: 0, stops: {}, flags: {} }));
  const outcomes: Partial<Record<Outcome, number>> = {};
  let total = 0, offPath = 0;
  for (const r of records) {
    if (r?.kind === "refusal" && r.suppressed) { offPath += Number(r.suppressed) || 0; continue; }
    const path = requestPath(r);
    if (!path) { if (r?.kind === "refusal") offPath++; continue; }
    total++; outcomes[path.outcome] = (outcomes[path.outcome] ?? 0) + 1;
    stages.forEach((s) => {
      const state = path.stages[s.stage];
      if (!state) return;
      s.reached++;
      if (state === "skip") s.skipped++;
      if (state === "flag") { s.flagged++; const key = s.stage === "gate" ? (path.outcome === "rewritten" ? "rewritten" : "held") : path.notes[s.stage] ?? "flagged"; s.flags[key] = (s.flags[key] ?? 0) + 1; }
      if (state === "stop") { s.stopped++; const key = path.code ?? path.outcome; s.stops[key] = (s.stops[key] ?? 0) + 1; }
    });
  }
  return { total, offPath, stages, outcomes };
}

export function decisionViews(records: readonly Rec[]): DecisionView[] {
  const steps = new Map<string, any>(), programs = new Map<string, string>(), reviews = new Map<string, DecisionView["reviews"]>(), effects = new Map<string, DecisionView["effects"]>();
  for (const r of records) {
    if (r.kind === "effect" && r.refId && r.effect) {
      const list = effects.get(r.refId) ?? [];
      list.push({ id: r.id, ts: r.ts, action: r.effect.action, status: r.effect.status, ...(r.effect.code && { code: r.effect.code }), ...(r.effect.review && { review: r.effect.review }), authorized: effectAuthorized(records, r.id) });
      effects.set(r.refId, list);
    }
    if (r.kind === "decision" && r.qdl && typeof r.refId === "string") steps.set(r.refId, r.qdl);
    else if (r.kind === "program" && typeof r.name === "string") programs.set(r.id, r.name);
    else if (r.kind === "review" && r.refId && r.review) {
      const list = reviews.get(r.refId) ?? [];
      list.push({ verdict: r.review.decision, reviewer: r.review.reviewer, at: r.review.at, ...(r.review.note && { note: r.review.note }) });
      reviews.set(r.refId, list);
    }
  }
  return records.filter((r) => r.kind === "decision" && !r.qdl).map((d): DecisionView => {
    const q = steps.get(d.id), history = reviews.get(d.id) ?? [];
    return {
      id: d.id, ts: d.ts, systemId: d.systemId, useCase: d.useCase, llmCallId: d.llmCallId, output: d.output, actions: proposedActions(d.output), ...(d.params && { params: d.params }),
      state: history.length ? history[history.length - 1].verdict : effects.has(d.id) ? "acted" : "waiting", reviews: history, effects: effects.get(d.id) ?? [],
      ...(q && { qdl: { status: q.status ?? "completed", sourceHash: q.sourceHash, program: q.sourceHash ? programs.get(q.sourceHash) : undefined, inputs: q.inputs, error: q.error } }),
    };
  }).reverse();
}

const nextTier = (tier: Tier): Tier | undefined => tier === "off" || tier === "transact" ? undefined : TIERS[TIERS.indexOf(tier) + 1];
const json = (value: unknown) => JSON.stringify(value, null, 2);

export function suggestions(records: readonly any[], useCases: readonly UseCaseRow[], config: ConfigLike): Suggestion[] {
  const out: Suggestion[] = [];
  const rows = config.useCases ?? {};
  for (const u of useCases) {
    if (u.useCase === null || u.overrideRatePct === null) continue;
    const tier = (rows[u.useCase]?.tier ?? u.tiers[u.tiers.length - 1]) as Tier | undefined, next = tier && nextTier(tier);
    if (next && tier !== "off" && u.reviewed >= PROMOTE_MIN_REVIEWS && u.overrideRatePct <= PROMOTE_MAX_OVERRIDE_PCT) out.push({
      id: `promote:${u.useCase}`, severity: "info", title: `${u.useCase}: candidate to move from ${tier} to ${next}`,
      detail: "People agreed with the recorded result in almost every reviewed decision. Raise the tier only if the application then lets the model do more.",
      evidence: [`${u.reviewed} reviewed decisions`, `${u.overridden} overridden (${u.overrideRatePct}%)`],
      ...(rows[u.useCase] && { snippet: json({ [u.useCase]: { ...rows[u.useCase], tier: next } }) }),
    });
    if (u.reviewed >= OVERRIDE_WARN_MIN_REVIEWS && u.overrideRatePct >= OVERRIDE_WARN_PCT) out.push({
      id: `overrides:${u.useCase}`, severity: "warn", title: `${u.useCase}: people override ${u.overrideRatePct}% of results`,
      detail: "Keep the tier. Check whether the rule or the model is wrong before the tier goes up.",
      evidence: [`${u.reviewed} reviewed decisions`, `${u.overridden} overridden`],
    });
  }
  const held = new Map<string, { owner: string; list: "key" | "use case"; tool: string; count: number }>();
  for (const r of records) {
    if (r.kind !== "llm-call") continue;
    for (const c of r.actionGate?.calls ?? []) {
      if (c.mode !== "observe" || c.result !== "hold") continue;
      if (c.toolAllowed === false && r.virtualKey) { const k = `key|${r.virtualKey}|${c.tool}`; held.set(k, { owner: r.virtualKey, list: "key", tool: c.tool, count: (held.get(k)?.count ?? 0) + 1 }); }
      if (c.useCaseToolAllowed === false && r.useCase) { const k = `use case|${r.useCase}|${c.tool}`; held.set(k, { owner: r.useCase, list: "use case", tool: c.tool, count: (held.get(k)?.count ?? 0) + 1 }); }
    }
  }
  for (const h of held.values()) {
    if (h.count < HELD_TOOL_MIN) continue;
    const allow = h.list === "key" ? config.keys?.find((k) => k.name === h.owner)?.tools?.allow : rows[h.owner]?.tools?.allow;
    out.push({
      id: `held:${h.list}:${h.owner}:${h.tool}`, severity: "info", title: `${h.tool} was held ${h.count} times outside the ${h.list} list of ${h.owner}`,
      detail: "The gate is in observe mode, so the calls went through. Add the tool if the work needs it; otherwise these calls are what enforce mode would stop.",
      evidence: [`${h.count} observed holds`],
      ...(allow && { snippet: json({ allow: [...allow, h.tool] }) }),
    });
  }
  const checked = records.filter((r) => r.kind === "llm-call" && r.actionGate?.calls?.length);
  const observeOnly = checked.filter((r) => r.actionGate.calls.every((c: any) => c.mode === "observe"));
  if (observeOnly.length >= ENFORCE_READY_MIN_CALLS && observeOnly.every((r) => r.actionGate.calls.every((c: any) => c.result === "pass"))) out.push({
    id: "enforce-ready", severity: "info", title: `The tool gate held nothing in ${observeOnly.length} checked responses`,
    detail: "Observe mode has found no friction. Switching the listed tools to enforce now stops only calls that would have been held.",
    evidence: [`${observeOnly.length} responses with checked tool calls`, "0 held"],
  });
  if (!config.useCases) {
    const labels = [...new Set(records.filter((r) => r.kind === "llm-call" && typeof r.useCase === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(r.useCase)).map((r) => r.useCase as string))].sort();
    if (labels.length) out.push({
      id: "use-case-table", severity: "info", title: `${labels.length} use-case label${labels.length === 1 ? "" : "s"} without a use-case table`,
      detail: "Clients already name their use cases. A table gives each one its own models, tools and tier (ADR 0053). Start every row at shadow.",
      evidence: labels.slice(0, 8).map((l) => `label ${l}`),
      snippet: json({ useCases: Object.fromEntries(labels.map((l) => [l, { tier: "shadow" }])) }),
    });
  }
  const answered = records.filter((r) => r.kind === "llm-call" && r.upstreamStatus >= 200 && r.upstreamStatus < 400);
  const unknown = answered.filter((r) => r.usage?.input == null || r.usage?.output == null).length;
  if (answered.length && unknown / answered.length > UNKNOWN_USAGE_WARN_SHARE) out.push({
    id: "unknown-usage", severity: "warn", title: `${unknown} of ${answered.length} answers have no token usage`,
    detail: "Token totals are a lower bound. Streams without a usage chunk are the usual cause; ask the client to request usage in streams (ADR 0012).",
    evidence: [`${Math.round((unknown / answered.length) * 100)}% of answered calls`],
  });
  const signals = records.filter((r) => r.kind === "llm-call" && r.decision?.signals?.length).length;
  if (signals && !config.actionGate) out.push({
    id: "gate-for-signals", severity: "warn", title: `${signals} calls carried prompt-injection signals and no tool gate is set`,
    detail: "Signals are advisory. The gate is what stops a tool call that sends data to a place the user did not name (ADR 0046).",
    evidence: [`${signals} calls with signals`],
  });
  return out;
}
