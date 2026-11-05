import { CaseworkStorage } from "./caseworkStorage.js";
import { AuthorityStore, type AuthorityGrant, type CaseworkPrincipal, type CurrentRelease } from "./authority.js";
import { evidenceDigest } from "./qualification.js";
import type { WorkCase } from "./casework.js";
import type { ReviewedRegression } from "./caseworkRegression.js";

export interface MonitoredOperation { proposal: { id: string; caseId: string; tenant: string; intent: string; createdAt: string }; status: string; exception: { openedAt: string } | null; events: { at: string }[] }
export const MONITORING_SIGNALS = ["evaluation-failure", "human-regression", "complaint", "reopened", "answer-rejected", "delivery-held", "execution-exception", "grant-expired", "release-changed", "plan-expired", "fallback-overload"] as const;
export type MonitoringSignal = typeof MONITORING_SIGNALS[number];
export interface MonitoringPlanInput {
  intent: string; scope: "synthetic" | "production"; expiresAt: string; windowMs: number;
  thresholds: Record<MonitoringSignal, number>; owner: string; responseMinutes: number;
  fallback: { destination: "human"; owner: string; capacityPerHour: number; maxPendingCases: number; basis: "synthetic" | "measured"; evidence: string };
}
export interface MonitoringPlan extends MonitoringPlanInput { id: string; tenant: string; reviewer: string; createdAt: string }
interface MonitoringEvidence { id: string; sourceId: string; caseId: string | null; at: string; basis?: "event" | "current-state" }
export interface MonitoringIncident {
  id: string; tenant: string; intent: string; scope: AuthorityGrant["scope"]; planId: string; grantId: string; packageDigest: string;
  signal: MonitoringSignal; owner: string; openedAt: string; latestSignalAt: string; dueAt: string;
  fallback: MonitoringPlan["fallback"]; evidence: MonitoringEvidence[];
  status: "open" | "restriction-pending" | "restricted" | "recovered";
  restriction: { reviewer: string; rationale: string; at: string } | null;
  recoveryHistory?: NonNullable<MonitoringIncident["recovery"]>[];
  recovery: { reviewer: string; rationale: string; at: string; packageDigest: string; reportDigest: string; regressionRuns: string[]; activatedBy?: string } | null;
}
interface State { plans: MonitoringPlan[]; active: Record<string, string>; incidents: MonitoringIncident[]; clockFloor: number; lastScan: Record<string, string> }
export interface MonitoringSources {
  cases: WorkCase[]; operations: MonitoredOperation[];
  failures: { caseId: string; intent: string; at: string; digest: string }[];
}
const named = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && !!v.trim() && v.length <= max;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const stamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const fail = (reason: string): never => { throw new Error(`audit_monitoring_${reason}`); };
const latest = (rows: MonitoringEvidence[]): string => {
  const last = [...rows].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  return last?.at ?? fail("missing_evidence");
};
const key = (tenant: string, intent: string, scope: string) => JSON.stringify([tenant, intent, scope]);
function validPlan(p: any): p is MonitoringPlanInput {
  return p && named(p.intent) && ["synthetic", "production"].includes(p.scope) && stamp(p.expiresAt) && positive(p.windowMs) && p.windowMs <= 30 * 86400000
    && p.thresholds && Object.keys(p.thresholds).length === MONITORING_SIGNALS.length && MONITORING_SIGNALS.every((s) => positive(p.thresholds[s]))
    && ["grant-expired", "release-changed", "plan-expired", "fallback-overload"].every((s) => p.thresholds[s] === 1)
    && named(p.owner) && positive(p.responseMinutes) && p.responseMinutes <= 43200 && p.fallback?.destination === "human" && named(p.fallback.owner)
    && positive(p.fallback.capacityPerHour) && positive(p.fallback.maxPendingCases) && ["synthetic", "measured"].includes(p.fallback.basis) && text(p.fallback.evidence, 2000)
    && (p.scope !== "production" || p.fallback.basis === "measured");
}
const valid = (v: any): v is State => v && Array.isArray(v.plans) && Array.isArray(v.incidents) && v.active && typeof v.active === "object" && v.lastScan && typeof v.lastScan === "object" && Object.values(v.lastScan).every(stamp) && Number.isSafeInteger(v.clockFloor)
  && v.plans.every((p: any) => named(p.tenant) && named(p.reviewer) && stamp(p.createdAt) && hash(p.id) && p.id === evidenceDigest(Object.fromEntries(Object.entries(p).filter(([name]) => name !== "id"))) && validPlan(p))
  && v.incidents.every((i: any) => i && hash(i.id) && named(i.tenant) && named(i.intent) && hash(i.planId) && named(i.grantId) && hash(i.packageDigest) && MONITORING_SIGNALS.includes(i.signal)
    && ["open", "restriction-pending", "restricted", "recovered"].includes(i.status) && named(i.owner) && stamp(i.openedAt) && stamp(i.latestSignalAt) && stamp(i.dueAt) && Array.isArray(i.evidence)
    && i.evidence.every((e: any) => e && hash(e.id) && named(e.sourceId) && (e.caseId === null || named(e.caseId)) && stamp(e.at))
    && (i.status === "open" || !!i.restriction) && (i.status !== "recovered" || !!i.recovery))
  && new Set(v.plans.map((p: MonitoringPlan) => p.id)).size === v.plans.length && new Set(v.incidents.map((i: MonitoringIncident) => i.id)).size === v.incidents.length
  && Object.values(v.active).every((id) => v.plans.some((p: MonitoringPlan) => p.id === id));

export class CaseworkMonitoring {
  readonly storage: CaseworkStorage<State>;
  constructor(directory: string, readonly authority: AuthorityStore) { this.storage = new CaseworkStorage(directory, () => ({ plans: [], active: {}, incidents: [], clockFloor: 0, lastScan: {} }), valid); }

  configure(principal: CaseworkPrincipal, input: MonitoringPlanInput, now = new Date()): MonitoringPlan {
    this.require(principal, "reviewer");
    if (!validPlan(input) || Date.parse(input.expiresAt) <= now.getTime()) return fail("invalid_plan");
    const payload = { ...structuredClone(input), tenant: principal.tenant, reviewer: principal.id, createdAt: now.toISOString() };
    const plan = { ...payload, id: evidenceDigest(payload) };
    return this.change(now, (state) => { if (!state.plans.some((p) => p.id === plan.id)) state.plans.push(plan); state.active[key(plan.tenant, plan.intent, plan.scope)] = plan.id; return plan; });
  }

  view(principal: CaseworkPrincipal) {
    this.require(principal, "operator");
    const state = this.storage.read(), plans = state.plans.filter((p) => p.tenant === principal.tenant);
    return { plans, active: Object.fromEntries(Object.entries(state.active).filter(([, id]) => plans.some((p) => p.id === id))), incidents: state.incidents.filter((i) => i.tenant === principal.tenant), automaticRestriction: false, signals: MONITORING_SIGNALS, lastScannedAt: state.lastScan[principal.tenant] ?? null };
  }

  prepareActivation(principal: CaseworkPrincipal, grant: AuthorityGrant, sources: MonitoringSources, now = new Date()): MonitoringPlan {
    this.require(principal, "deployer");
    if (grant.tenant !== principal.tenant) return fail("not_found");
    const state = this.storage.read();
    this.clock(state, now);
    const plan = this.currentPlan(state, grant.tenant, grant.intent, grant.scope, now);
    if (Date.parse(plan.expiresAt) < Date.parse(grant.expiresAt)) fail("plan_expires_before_grant");
    this.capacity(plan, sources, now);
    for (const incident of state.incidents.filter((i) => i.tenant === grant.tenant && i.intent === grant.intent && i.scope === grant.scope)) {
      if (incident.status !== "recovered") fail("incident_review_required");
      const candidate = this.authority.qualifications.load(grant.packageDigest);
      const report = JSON.parse(this.authority.qualifications.read(candidate.report).toString("utf8"));
      if (!stamp(report.createdAt) || Date.parse(report.createdAt) <= Date.parse(incident.latestSignalAt) || Date.parse(report.createdAt) > now.getTime()) fail("fresh_evidence_required");
      if (!incident.recovery?.activatedBy && incident.recovery?.packageDigest !== grant.packageDigest) fail("recovery_package_mismatch");
    }
    return plan;
  }

  recordActivation(principal: CaseworkPrincipal, grant: AuthorityGrant, now = new Date()): void {
    this.require(principal, "deployer");
    const active = this.authority.storage.read();
    if (grant.tenant !== principal.tenant || active.active[key(grant.tenant, grant.intent, grant.scope)] !== grant.id || active.revoked.includes(grant.id)) return fail("activation_required");
    this.change(now, (state) => {
      for (const i of state.incidents.filter((i) => i.tenant === grant.tenant && i.intent === grant.intent && i.scope === grant.scope)) {
        if (i.status !== "recovered" || !i.recovery || (!i.recovery.activatedBy && i.recovery.packageDigest !== grant.packageDigest)) fail("incident_review_required");
        if (!i.recovery) return fail("incident_review_required");
        i.recovery.activatedBy ??= grant.id;
      }
    });
  }

  scan(principal: CaseworkPrincipal, sources: MonitoringSources, currentRelease: (digest: string) => CurrentRelease, now = new Date()) {
    this.require(principal, "operator");
    this.validateSources(principal, sources, now);
    const authority = this.authority.view(principal);
    return this.change(now, (state) => {
      for (const grant of authority.grants.filter((g) => Object.values(authority.active).includes(g.id) && (!authority.revoked.includes(g.id) || state.incidents.some((i) => i.grantId === g.id && (i.status !== "recovered" || !i.recovery?.activatedBy))))) {
        const plan = state.plans.find((p) => p.id === state.active[key(grant.tenant, grant.intent, grant.scope)]);
        if (!plan) continue;
        const evidence = new Map<MonitoringSignal, MonitoringEvidence[]>();
        const add = (signal: MonitoringSignal, sourceId: string, caseId: string | null, at: string, basis: "event" | "current-state" = "event") => {
          if (Date.parse(at) > now.getTime() || Date.parse(at) < now.getTime() - plan.windowMs || Date.parse(at) < Date.parse(grant.approvedAt)) return;
          const item = { sourceId, caseId, at, basis, id: evidenceDigest({ signal, sourceId, caseId, grantId: grant.id }) };
          const rows = evidence.get(signal) ?? []; rows.push(item); evidence.set(signal, rows);
        };
        try { this.capacity(plan, sources, now); } catch (error) { if (error instanceof Error && error.message === "audit_monitoring_fallback_capacity_exceeded") add("fallback-overload", plan.id, null, now.toISOString()); else throw error; }
        const cases = sources.cases.filter((c) => c.intent === grant.intent && c.qualificationDigest === grant.packageDigest);
        for (const c of cases) {
          if (["fail", "error"].includes(c.origin.evaluation)) add("evaluation-failure", c.origin.reportDigest, c.id, c.createdAt);
          if (c.outcome.state === "disputed" && !c.events.some((e) => e.type === "outcome-observed" && e.outcomeState === "disputed")) add("complaint", `current-state-disputed-${c.id}`, c.id, now.toISOString(), "current-state");
          if (c.outcome.reopened > 0 && !c.events.some((e) => e.type === "outcome-observed" && e.outcomeState === "reopened")) add("reopened", `current-state-reopened-${c.id}`, c.id, now.toISOString(), "current-state");
          for (const e of c.events) {
            if (e.type === "outcome-observed" && e.outcomeState === "disputed") add("complaint", e.id, c.id, e.at);
            if (e.type === "outcome-observed" && e.outcomeState === "reopened") add("reopened", e.id, c.id, e.at);
            if (e.type === "answer-reviewed" && e.code === "rejected") add("answer-rejected", e.id, c.id, e.at);
            if (e.type === "delivery-held") add("delivery-held", e.id, c.id, e.at);
          }
        }
        for (const f of sources.failures.filter((f) => cases.some((c) => c.id === f.caseId))) add("human-regression", f.digest, f.caseId, f.at);
        for (const o of sources.operations.filter((o) => cases.some((c) => c.id === o.proposal.caseId) && ["unknown", "dispatching"].includes(o.status))) {
          add("execution-exception", o.proposal.id, o.proposal.caseId, o.exception?.openedAt ?? o.events.at(-1)?.at ?? o.proposal.createdAt);
        }
        if (Date.parse(grant.expiresAt) <= now.getTime()) add("grant-expired", grant.id, null, grant.expiresAt);
        if (Date.parse(plan.expiresAt) <= now.getTime()) add("plan-expired", plan.id, null, plan.expiresAt);
        try { const p = this.authority.qualifications.load(grant.packageDigest), assessment = this.authority.qualifications.inspect(p, currentRelease(grant.packageDigest)); if (!assessment.integrity || !assessment.applicable || !assessment.evidencePassed) add("release-changed", grant.packageDigest, null, now.toISOString()); }
        catch { add("release-changed", grant.packageDigest, null, now.toISOString()); }
        for (const [signal, rows] of evidence) {
          const count = new Set(rows.map((e) => e.caseId ?? e.sourceId)).size;
          if (count < plan.thresholds[signal]) continue;
          const id = evidenceDigest({ tenant: grant.tenant, grantId: grant.id, planId: plan.id, signal });
          let incident = state.incidents.find((i) => i.id === id);
          if (!incident) {
            incident = { id, tenant: grant.tenant, intent: grant.intent, scope: grant.scope, planId: plan.id, grantId: grant.id, packageDigest: grant.packageDigest, signal, owner: plan.owner, openedAt: now.toISOString(), latestSignalAt: latest(rows), dueAt: new Date(now.getTime() + plan.responseMinutes * 60000).toISOString(), fallback: structuredClone(plan.fallback), evidence: [], status: "open", restriction: null, recovery: null };
            state.incidents.push(incident);
          }
          const unseen = rows.filter((row) => !incident.evidence.some((e) => e.id === row.id));
          if (unseen.length && incident.status === "recovered" && incident.recovery) {
            (incident.recoveryHistory ??= []).push(incident.recovery);
            incident.recovery = null;
            incident.status = "restricted";
          }
          incident.evidence.push(...unseen);
          incident.latestSignalAt = latest(incident.evidence);
        }
      }
      state.lastScan[principal.tenant] = now.toISOString();
      return state.incidents.filter((i) => i.tenant === principal.tenant);
    });
  }

  restrict(principal: CaseworkPrincipal, id: string, rationale: string, now = new Date()): MonitoringIncident {
    this.require(principal, "reviewer");
    if (!text(rationale, 2000)) return fail("invalid_review");
    const incident = this.change(now, (state) => {
      const i = this.owned(state, principal.tenant, id);
      if (i.status === "recovered") fail("already_recovered");
      if (i.restriction && (i.restriction.reviewer !== principal.id || i.restriction.rationale !== rationale)) fail("review_locked");
      i.restriction ??= { reviewer: principal.id, rationale, at: now.toISOString() };
      if (i.status === "open") i.status = "restriction-pending";
      return i;
    });
    this.authority.revoke(principal, incident.grantId, "monitoring_restriction", now);
    return this.change(now, (state) => { const i = this.owned(state, principal.tenant, id); if (i.status !== "recovered") i.status = "restricted"; return i; });
  }

  recover(principal: CaseworkPrincipal, id: string, packageDigest: string, rationale: string, current: CurrentRelease, sources: MonitoringSources, regressions: ReviewedRegression[], now = new Date()): MonitoringIncident {
    this.require(principal, "reviewer");
    if (!text(rationale, 2000) || !hash(packageDigest)) return fail("invalid_review");
    const p = this.authority.qualifications.load(packageDigest), assessment = this.authority.qualifications.inspect(p, current);
    const report = JSON.parse(this.authority.qualifications.read(p.report).toString("utf8"));
    return this.change(now, (state) => {
      const i = this.owned(state, principal.tenant, id);
      if (i.status === "recovered") { if (i.recovery?.packageDigest !== packageDigest || i.recovery.rationale !== rationale || i.recovery.reviewer !== principal.id) fail("review_locked"); return i; }
      if (i.status !== "restricted") fail("restriction_required");
      const previous = this.authority.qualifications.load(i.packageDigest);
      if (p.intent !== i.intent || p.report.digest === previous.report.digest || !stamp(report.createdAt) || Date.parse(report.createdAt) <= Date.parse(i.latestSignalAt) || Date.parse(report.createdAt) > now.getTime()
        || !assessment.integrity || !assessment.applicable || !assessment.evidencePassed || (i.scope === "production" && !assessment.readyForApproval)) fail("fresh_evidence_required");
      const plan = this.currentPlan(state, principal.tenant, i.intent, i.scope, now);
      this.capacity(plan, sources, now);
      const qualityCases = ["human-regression", "evaluation-failure", "answer-rejected"].includes(i.signal) ? [...new Set(i.evidence.map((e) => e.caseId).filter((id): id is string => id !== null))] : [];
      const regressionRuns: string[] = [];
      for (const caseId of qualityCases) {
        const candidates = regressions.filter((r) => r.tenant === i.tenant && r.source.caseId === caseId && r.review?.approved && r.review.digest === r.digest && r.reviewer !== r.author)
          .flatMap((r) => r.runs.map((run) => ({ regression: r, run })));
        const verified = candidates.find(({ regression, run }) => {
          if (!run.passed || run.targetRevision !== p.targetRevision || Date.parse(run.at) <= Date.parse(i.latestSignalAt) || Date.parse(run.at) > now.getTime()) return false;
          const sourceCase = sources.cases.find((c) => c.origin.runId === run.runId && c.origin.reportDigest === run.reportDigest && run.caseIds.includes(c.id));
          if (!sourceCase) return false;
          const candidate = this.authority.qualifications.load(sourceCase.qualificationDigest), assessed = this.authority.qualifications.inspect(candidate, current);
          const rerun = JSON.parse(this.authority.qualifications.read(candidate.report).toString("utf8"));
          return candidate.targetRevision === p.targetRevision && assessed.integrity && assessed.applicable && assessed.evidencePassed && rerun.suite?.hash === evidenceDigest(regression.suite)
            && stamp(rerun.createdAt) && Date.parse(rerun.createdAt) > Date.parse(i.latestSignalAt) && Date.parse(rerun.createdAt) <= now.getTime();
        });
        if (!verified) return fail("regression_rerun_required");
        regressionRuns.push(verified.run.runId);
      }
      i.recovery = { reviewer: principal.id, rationale, at: now.toISOString(), packageDigest, reportDigest: p.report.digest, regressionRuns };
      i.status = "recovered"; return i;
    });
  }

  private capacity(plan: MonitoringPlan, sources: MonitoringSources, now: Date): void {
    this.validateSources({ tenant: plan.tenant, id: "monitoring", roles: ["operator"] }, sources, now);
    const pending = new Set(sources.cases.filter((c) => c.intent === plan.intent && (c.escalation && c.escalation.status !== "resolved" || c.delivery.state === "held" || c.outcome.state === "disputed")).map((c) => c.id));
    for (const o of sources.operations.filter((o) => o.proposal.intent === plan.intent && ["unknown", "dispatching"].includes(o.status))) pending.add(o.proposal.caseId);
    if (pending.size > plan.fallback.maxPendingCases || pending.size / plan.fallback.capacityPerHour * 60 > plan.responseMinutes) fail("fallback_capacity_exceeded");
  }
  private validateSources(principal: CaseworkPrincipal, sources: MonitoringSources, now: Date): void {
    if (!sources || !Array.isArray(sources.cases) || !Array.isArray(sources.operations) || !Array.isArray(sources.failures) || sources.cases.some((c) => c.tenant !== principal.tenant)
      || sources.operations.some((o) => o.proposal.tenant !== principal.tenant) || sources.failures.some((f) => !sources.cases.some((c) => c.id === f.caseId && c.intent === f.intent) || !hash(f.digest) || !stamp(f.at) || Date.parse(f.at) > now.getTime())) fail("invalid_sources");
  }
  private currentPlan(state: State, tenant: string, intent: string, scope: string, now: Date): MonitoringPlan {
    const plan = state.plans.find((p) => p.id === state.active[key(tenant, intent, scope)]);
    if (!plan) return fail("plan_required");
    if (Date.parse(plan.expiresAt) <= now.getTime()) fail("plan_expired");
    return plan;
  }
  private owned(state: State, tenant: string, id: string): MonitoringIncident { return state.incidents.find((i) => i.tenant === tenant && i.id === id) ?? fail("not_found"); }
  private require(p: CaseworkPrincipal, role: CaseworkPrincipal["roles"][number]): void { if (!p || !named(p.id) || !named(p.tenant) || !p.roles?.includes(role)) fail("forbidden"); }
  private clock(state: State, now: Date): void { if (!Number.isSafeInteger(now.getTime()) || now.getTime() < state.clockFloor) fail("clock_regressed"); state.clockFloor = now.getTime(); }
  private change<T>(now: Date, action: (state: State) => T): T { return this.storage.transact((state) => { this.clock(state, now); return action(state); }); }
}
