import { randomUUID } from "node:crypto";
import { CaseworkStorage } from "./caseworkStorage.js";
import { AuthorityStore, type CaseworkPrincipal, type CurrentRelease } from "./authority.js";
import { evidenceDigest } from "./qualification.js";

export interface CaseScope { tenant: string; customer: string }
export interface ObservedContext { source: string; knowledgeDigest: string }
export interface CaseContextRules { source: string; valid(context: unknown): boolean }
export interface CaseworkOptions { currency: string; context?: CaseContextRules }
export const COST_KINDS = ["model", "review", "execution", "rework", "harm"] as const;
export type CostKind = typeof COST_KINDS[number];
export interface CaseCost { kind: CostKind; amountMinor: number; currency: string; basis: "measured" | "estimate"; source: string; actor: string; at: string }
interface CaseEvent { id: string; type: string; code: string; actor: string; at: string; ref: string | null; outcomeState?: "resolved" | "reopened" | "disputed" }
export interface CaseOrigin {
  runId: string; scenarioId: string; repetition: number; target: "ai-audit" | "python" | "python-audit" | "human";
  targetRevision: string; evaluation: "pass" | "fail" | "error" | "not-evaluated"; observation?: { digest: string; bytes: number }; reportDigest: string;
  audit: { available: boolean; chainVerified: boolean | null; records: { id: string; kind: string; hash: string }[] };
}
export interface CaseEscalation { owner: string; reason: string; summary: string; dueAt: string; status: "open" | "accepted" | "resolved"; acceptedBy: string | null; resolvedBy: string | null }
export interface WorkCase {
  id: string; tenant: string; customer: string; intent: string; qualificationDigest: string;
  question: string; answer: string; answerDigest: string; origin: CaseOrigin;
  createdAt: string; updatedAt: string;
  context?: ObservedContext;
  review: { verdict: "approved" | "rejected"; answerDigest: string; actor: string; at: string } | null;
  delivery: { state: "not-sent" | "held" | "delivered"; reason: string; grantId: string | null; at: string | null; outboxId: string | null };
  outcome: { state: "open" | "resolved" | "reopened" | "disputed"; reopened: number; code: string };
  escalation: CaseEscalation | null;
  costs: CaseCost[];
  events: CaseEvent[];
}
interface OutboxMessage { id: string; caseId: string; tenant: string; customer: string; answer: string; answerDigest: string; at: string }
interface CaseState { cases: WorkCase[]; outbox: OutboxMessage[] }
export interface IngestCase { scope: CaseScope; intent: string; qualificationDigest: string; question: string; answer: string; origin: CaseOrigin }
const named = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const text = (v: unknown, limit: number): v is string => typeof v === "string" && v.length <= limit;
const fail = (code: string): never => { throw new Error(`audit_casework_${code}`); };
const validState = (options: CaseworkOptions) => (v: any): v is CaseState => v && Array.isArray(v.cases) && Array.isArray(v.outbox)
  && v.cases.every((c: any) => c && named(c.id) && named(c.tenant) && named(c.customer) && named(c.intent) && hash(c.qualificationDigest)
    && (c.origin?.evaluation !== "not-evaluated" || (options.context?.valid(c.context) === true && hash(c.origin.observation?.digest) && Number.isSafeInteger(c.origin.observation?.bytes)))
    && text(c.question, 8000) && text(c.answer, 128000) && c.answerDigest === evidenceDigest(c.answer) && Array.isArray(c.events) && Array.isArray(c.costs)
    && ["open", "resolved", "reopened", "disputed"].includes(c.outcome?.state) && ["not-sent", "held", "delivered"].includes(c.delivery?.state))
  && new Set(v.cases.map((c: WorkCase) => c.id)).size === v.cases.length && new Set(v.outbox.map((m: OutboxMessage) => m.id)).size === v.outbox.length
  && v.outbox.every((m: any) => m && named(m.id) && named(m.tenant) && named(m.customer) && hash(m.answerDigest) && m.answerDigest === evidenceDigest(m.answer));

export class CaseworkStore {
  readonly storage: CaseworkStorage<CaseState>;
  constructor(directory: string, readonly authority: AuthorityStore, private readonly options: CaseworkOptions) {
    if (!/^[A-Z]{3}$/.test(options?.currency ?? "")) fail("invalid_currency");
    this.storage = new CaseworkStorage(directory, () => ({ cases: [], outbox: [] }), validState(options));
  }

  ingest(input: IngestCase, now = new Date()): WorkCase {
    const { scope, origin } = input;
    if (!named(scope?.tenant) || !named(scope.customer) || !named(input.intent) || !hash(input.qualificationDigest) || !text(input.question, 8000) || !text(input.answer, 128000)
      || !origin || !named(origin.runId) || !named(origin.scenarioId) || !Number.isSafeInteger(origin.repetition) || origin.repetition < 0 || !["ai-audit", "python", "python-audit", "human"].includes(origin.target)
      || !["pass", "fail", "error", "not-evaluated"].includes(origin.evaluation) || !hash(origin.reportDigest) || !origin.audit || !Array.isArray(origin.audit.records) || !Number.isFinite(now.getTime())) return fail("invalid_case");
    if (!["ai-audit", "python-audit"].includes(origin.target) && (origin.audit.available || origin.audit.chainVerified !== null || origin.audit.records.length)) fail("fabricated_audit_evidence");
    const p = this.authority.qualifications.load(input.qualificationDigest);
    if (p.intent !== input.intent || p.targetRevision !== origin.targetRevision || origin.reportDigest !== p.report.digest) fail("qualification_mismatch");
    let context: ObservedContext | undefined;
    if (origin.evaluation === "not-evaluated") {
      if (!origin.observation || !hash(origin.observation.digest) || !Number.isSafeInteger(origin.observation.bytes)) return fail("invalid_observation_evidence");
      let observation;
      try { observation = JSON.parse(this.authority.qualifications.read(origin.observation).toString("utf8")); }
      catch { return fail("invalid_observation_evidence"); }
      if (observation.question !== input.question || observation.answer !== input.answer || observation.intent !== input.intent
        || observation.target !== origin.target || observation.targetRevision !== origin.targetRevision || evidenceDigest(observation.scope) !== evidenceDigest(scope)
        || evidenceDigest(observation.audit) !== evidenceDigest(origin.audit) || !observation.context || observation.context.source !== this.options.context?.source) fail("observation_mismatch");
      context = observation.context;
      if (!context || this.options.context?.valid(context) !== true || context.knowledgeDigest !== p.components.sop?.digest) fail("observation_mismatch");
    } else {
      let report, suite;
      try { report = JSON.parse(this.authority.qualifications.read(p.report).toString("utf8")); suite = JSON.parse(this.authority.qualifications.read(p.suite).toString("utf8")); }
      catch { return fail("invalid_observation_evidence"); }
      const row = report.results?.find((r: any) => r.caseId === origin.scenarioId && r.repetition === origin.repetition && r.intent === input.intent);
      const scenario = suite.cases?.find((c: any) => c.id === origin.scenarioId && c.intent === input.intent);
      if (!row || !scenario || scenario.input?.question !== input.question || (row.output?.answer ?? "") !== input.answer || row.status !== origin.evaluation) fail("observation_mismatch");
    }
    return this.storage.transact((state) => {
      const previous = state.cases.find((c) => c.tenant === scope.tenant && c.origin.runId === origin.runId && c.origin.scenarioId === origin.scenarioId && c.origin.repetition === origin.repetition);
      if (previous) {
        if (previous.customer !== scope.customer || previous.question !== input.question || previous.answer !== input.answer || evidenceDigest(previous.origin) !== evidenceDigest(origin) || previous.qualificationDigest !== p.digest) fail("source_conflict");
        return previous;
      }
      const c: WorkCase = { id: randomUUID(), tenant: scope.tenant, customer: scope.customer, intent: input.intent, qualificationDigest: p.digest, question: input.question, answer: input.answer, answerDigest: evidenceDigest(input.answer), origin: structuredClone(origin), createdAt: now.toISOString(), updatedAt: now.toISOString(), ...(context ? { context } : {}), review: null,
        delivery: { state: "not-sent", reason: "no_delivery_attempt", grantId: null, at: null, outboxId: null }, outcome: { state: "open", reopened: 0, code: "awaiting_resolution" }, escalation: null, costs: [], events: [] };
      this.event(c, "case-created", "actual_application_observation", "application-adapter", now, origin.runId);
      if (origin.evaluation !== "pass") {
        c.escalation = { owner: "quality-ops", reason: origin.evaluation === "not-evaluated" ? "answer_not_evaluated" : "evaluation_failed", summary: origin.evaluation === "not-evaluated" ? "This operational answer has no independent evaluation. Review its scoped facts and policy before delivery." : "The observed answer failed independent business checks. Inspect the original experiment before resolving.", dueAt: new Date(now.getTime() + 4 * 3600000).toISOString(), status: "open", acceptedBy: null, resolvedBy: null };
        this.event(c, "escalated", origin.evaluation === "not-evaluated" ? "answer_not_evaluated" : "evaluation_failed", "application-adapter", now);
      }
      state.cases.push(c); return c;
    });
  }

  request(scope: CaseScope, runId: string): WorkCase | null {
    if (!named(scope?.tenant) || !named(scope.customer) || !named(runId)) return fail("invalid_customer");
    return this.storage.read().cases.find((c) => c.tenant === scope.tenant && c.customer === scope.customer && c.origin.runId === runId && c.origin.evaluation === "not-evaluated") ?? null;
  }

  list(principal: CaseworkPrincipal): WorkCase[] {
    this.require(principal, "operator");
    return this.storage.read().cases.filter((c) => c.tenant === principal.tenant).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(principal: CaseworkPrincipal, id: string): WorkCase {
    this.require(principal, "operator");
    return this.owned(this.storage.read(), principal.tenant, id);
  }

  review(principal: CaseworkPrincipal, id: string, verdict: "approved" | "rejected", now = new Date()): WorkCase {
    this.require(principal, "reviewer");
    if (!["approved", "rejected"].includes(verdict)) return fail("invalid_verdict");
    return this.change(principal.tenant, id, now, (c) => {
      if (c.review || c.delivery.state === "delivered") fail("already_reviewed");
      c.review = { verdict, answerDigest: c.answerDigest, actor: principal.id, at: now.toISOString() };
      this.event(c, "answer-reviewed", verdict, principal.id, now);
    });
  }

  deliver(principal: CaseworkPrincipal, id: string, current: CurrentRelease, now = new Date(), validateContext?: (c: WorkCase) => void): WorkCase {
    this.require(principal, "operator");
    return this.storage.transact((state) => {
      const c = this.owned(state, principal.tenant, id);
      this.clock(c, now);
      if (c.delivery.state === "delivered") return c;
      const hold = (reason: string, grantId: string | null = null) => {
        c.delivery = { state: "held", reason, grantId, at: now.toISOString(), outboxId: null };
        this.event(c, "delivery-held", reason, principal.id, now); return c;
      };
      if (c.context) {
        if (!validateContext) return hold("context_verification_required");
        try { validateContext(c); }
        catch (error) { return hold(error instanceof Error && /^audit_casework_[a-z_]+$/.test(error.message) ? error.message : "context_unavailable"); }
      }
      if (!c.answer.trim()) return hold("empty_answer");
      if (c.review?.verdict === "rejected") return hold("answer_rejected");
      let grant;
      try { grant = this.authority.authorize({ tenant: c.tenant, intent: c.intent, scope: "synthetic", action: "deliver-answer", amountMinor: 0, currency: this.options.currency }, current, now); }
      catch (error) { const code = error instanceof Error && /^audit_authority_[a-z_]+$/.test(error.message) ? error.message : "authority_unavailable"; return hold(code); }
      if (grant.packageDigest !== c.qualificationDigest) return hold("different_qualification", grant.id);
      if (grant.tier === "shadow") return hold("shadow_observation_only", grant.id);
      if (grant.tier === "assist" && (c.review?.verdict !== "approved" || c.review.answerDigest !== c.answerDigest)) return hold("answer_review_required", grant.id);
      const outboxId = evidenceDigest({ caseId: c.id, answerDigest: c.answerDigest });
      const message = state.outbox.find((m) => m.id === outboxId);
      if (message && (message.answerDigest !== c.answerDigest || message.tenant !== c.tenant || message.customer !== c.customer)) return fail("outbox_conflict");
      if (!message) state.outbox.push({ id: outboxId, caseId: c.id, tenant: c.tenant, customer: c.customer, answer: c.answer, answerDigest: c.answerDigest, at: now.toISOString() });
      c.delivery = { state: "delivered", reason: "synthetic_outbox_confirmed", grantId: grant.id, at: now.toISOString(), outboxId };
      this.event(c, "answer-delivered", "synthetic_outbox_confirmed", principal.id, now, outboxId);
      return c;
    });
  }

  inbox(scope: CaseScope): { id: string; caseId: string; answer: string; at: string }[] {
    if (!named(scope?.tenant) || !named(scope.customer)) return fail("invalid_customer");
    return this.storage.read().outbox.filter((m) => m.tenant === scope.tenant && m.customer === scope.customer).map(({ id, caseId, answer, at }) => ({ id, caseId, answer, at }));
  }

  customerCases(scope: CaseScope): (Pick<WorkCase, "id" | "tenant" | "customer" | "intent" | "qualificationDigest"> & { runId: string })[] {
    if (!named(scope?.tenant) || !named(scope.customer)) return fail("invalid_customer");
    return this.storage.read().cases.filter((c) => c.tenant === scope.tenant && c.customer === scope.customer)
      .map(({ id, tenant, customer, intent, qualificationDigest, origin }) => ({ id, tenant, customer, intent, qualificationDigest, runId: origin.runId }));
  }

  outcome(principal: CaseworkPrincipal, id: string, state: WorkCase["outcome"]["state"], code: string, now = new Date()): WorkCase {
    this.require(principal, "operator");
    if ((state !== "resolved" && state !== "reopened" && state !== "disputed") || !named(code)) return fail("invalid_outcome");
    return this.change(principal.tenant, id, now, (c) => {
      if (state === "reopened" && c.outcome.state !== "resolved") fail("not_resolved");
      if (state === c.outcome.state) return;
      if (state === "reopened") c.outcome.reopened++;
      c.outcome.state = state; c.outcome.code = code;
      this.event(c, "outcome-observed", code, principal.id, now, null, state);
    });
  }

  escalate(principal: CaseworkPrincipal, id: string, input: { owner: string; reason: string; summary: string; dueAt: string }, now = new Date()): WorkCase {
    this.require(principal, "operator");
    if (!named(input.owner) || !named(input.reason) || !text(input.summary, 2000) || !input.summary.trim() || !Number.isFinite(Date.parse(input.dueAt)) || Date.parse(input.dueAt) <= now.getTime()) return fail("invalid_escalation");
    return this.change(principal.tenant, id, now, (c) => {
      if (c.escalation && c.escalation.status !== "resolved") fail("escalation_already_open");
      c.escalation = { ...input, status: "open", acceptedBy: null, resolvedBy: null };
      this.event(c, "escalated", input.reason, principal.id, now);
    });
  }

  handoff(principal: CaseworkPrincipal, id: string, action: "accept" | "resolve", now = new Date()): WorkCase {
    this.require(principal, "operator");
    if (!["accept", "resolve"].includes(action)) return fail("invalid_handoff");
    return this.change(principal.tenant, id, now, (c) => {
      if (!c.escalation) return fail("no_escalation");
      if (action === "accept" && c.escalation.status === "open") { c.escalation.status = "accepted"; c.escalation.acceptedBy = principal.id; }
      else if (action === "resolve" && c.escalation.status === "accepted" && c.escalation.acceptedBy === principal.id) { c.escalation.status = "resolved"; c.escalation.resolvedBy = principal.id; }
      else return fail("handoff_state");
      this.event(c, "handoff-" + action, c.escalation.reason, principal.id, now);
    });
  }

  recordCost(principal: CaseworkPrincipal, id: string, input: Omit<CaseCost, "actor" | "at">, now = new Date()): WorkCase {
    this.require(principal, "operator");
    if (!COST_KINDS.includes(input.kind) || !Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0 || !/^[A-Z]{3}$/.test(input.currency)
      || !["measured", "estimate"].includes(input.basis) || !named(input.source)) return fail("invalid_cost");
    return this.change(principal.tenant, id, now, (c) => {
      if (c.costs.some((cost) => cost.kind === input.kind)) fail("cost_already_recorded");
      if (c.costs.some((cost) => cost.currency !== input.currency)) fail("mixed_currencies");
      c.costs.push({ ...input, actor: principal.id, at: now.toISOString() });
      this.event(c, "cost-recorded", input.kind + ":" + input.basis, principal.id, now);
    });
  }

  insights(principal: CaseworkPrincipal) {
    const cases = this.list(principal);
    const summarize = (rows: WorkCase[]) => {
      const costed = rows.filter((c) => c.costs.length === COST_KINDS.length && c.costs.every((cost) => cost.basis === "measured"));
      const currencies = [...new Set(costed.flatMap((c) => c.costs.map((cost) => cost.currency)))];
      const knownSubtotalByCurrency: Record<string, number | null> = {};
      let costAggregationOverflow = false;
      for (const c of rows) for (const cost of c.costs) if (cost.basis === "measured") {
        const previous = Object.hasOwn(knownSubtotalByCurrency, cost.currency) ? knownSubtotalByCurrency[cost.currency] : 0;
        const next = previous === null ? null : previous + cost.amountMinor;
        if (next === null || !Number.isSafeInteger(next)) { knownSubtotalByCurrency[cost.currency] = null; costAggregationOverflow = true; }
        else knownSubtotalByCurrency[cost.currency] = next;
      }
      const measuredTotal = costed.reduce((sum, c) => sum + c.costs.reduce((s, cost) => s + cost.amountMinor, 0), 0);
      if (!Number.isSafeInteger(measuredTotal)) costAggregationOverflow = true;
      const meanMeasuredCostMinor = costed.length && currencies.length === 1 && Number.isSafeInteger(measuredTotal) ? measuredTotal / costed.length : null;
      return { cases: rows.length, delivered: rows.filter((c) => c.delivery.state === "delivered").length, resolved: rows.filter((c) => c.outcome.state === "resolved").length,
        reopened: rows.filter((c) => c.outcome.reopened > 0).length, disputed: rows.filter((c) => c.outcome.state === "disputed").length,
        escalations: rows.filter((c) => c.escalation && c.escalation.status !== "resolved").length,
        measuredCostCoverage: rows.length ? costed.length / rows.length : null, meanMeasuredCostMinor, meanCostCurrency: currencies.length === 1 ? currencies[0] : null, knownSubtotalByCurrency,
        estimatedComponents: rows.flatMap((c) => c.costs).filter((cost) => cost.basis === "estimate").length, costAggregationOverflow };
    };
    return { overall: summarize(cases), byIntent: Object.fromEntries([...new Set(cases.map((c) => c.intent))].sort().map((intent) => [intent, summarize(cases.filter((c) => c.intent === intent))])),
      byImplementation: Object.fromEntries(["ai-audit", "python", "python-audit", "human"].map((target) => [target, summarize(cases.filter((c) => c.origin.target === target))])),
      sampling: "synthetic-development", populationEstimate: false, note: "Observed outcomes are operator records, not independently reviewed correctness labels. Missing costs are unknown; estimates are separate." };
  }

  private require(principal: CaseworkPrincipal, role: CaseworkPrincipal["roles"][number]) {
    if (!principal || !named(principal.id) || !named(principal.tenant) || !Array.isArray(principal.roles) || !principal.roles.includes(role)) fail("forbidden");
  }

  private owned(state: CaseState, tenant: string, id: string): WorkCase { return state.cases.find((c) => c.id === id && c.tenant === tenant) ?? fail("not_found"); }
  private clock(c: WorkCase, now: Date) { if (!Number.isFinite(now.getTime()) || now.getTime() < Date.parse(c.updatedAt)) fail("clock_regressed"); c.updatedAt = now.toISOString(); }
  private event(c: WorkCase, type: string, code: string, actor: string, now: Date, ref: string | null = null, outcomeState?: CaseEvent["outcomeState"]) { c.events.push({ id: randomUUID(), type, code, actor, at: now.toISOString(), ref, ...(outcomeState ? { outcomeState } : {}) }); c.updatedAt = now.toISOString(); }
  private change(tenant: string, id: string, now: Date, action: (c: WorkCase) => void): WorkCase {
    return this.storage.transact((state) => { const c = this.owned(state, tenant, id); this.clock(c, now); action(c); return c; });
  }
}
