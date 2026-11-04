import { randomUUID } from "node:crypto";
import { CaseworkStorage } from "./caseworkStorage.js";
import { evidenceDigest } from "./qualification.js";
import type { CaseworkPrincipal } from "./authority.js";

export interface RegressionAssertion { id: string; type: "equals" | "contains" | "notContains" | "range"; path?: string; value?: unknown; min?: number; max?: number; severity: "critical" }
export interface RegressionSource { caseId: string; taskId: string; publicationDigest: string; observationDigest: string; gold: boolean }
export interface ReviewedRegression {
  id: string; tenant: string; author: string; reviewer: string; createdAt: string; digest: string;
  source: RegressionSource; evidence: unknown;
  suite: { schemaVersion: 1; name: string; version: string; cases: { id: string; intent: string; split: "test"; tags: string[]; input: unknown; assertions: RegressionAssertion[] }[]; gates: { minPassRate: number; maxCriticalFailures: number }[] };
  review: { approved: boolean; reviewer: string; rationale: string; at: string; digest: string } | null;
  runs: { runId: string; reportDigest: string; targetRevision: string; target: "ai-audit" | "python" | "python-audit"; passed: boolean; at: string; caseIds: string[] }[];
}
interface State { regressions: ReviewedRegression[]; clockFloor: number }
const named = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const fail = (code: string): never => { throw new Error(`audit_regression_${code}`); };
const payload = (r: ReviewedRegression) => ({ tenant: r.tenant, author: r.author, reviewer: r.reviewer, source: r.source, evidence: r.evidence, suite: r.suite });
const valid = (v: any): v is State => v && Array.isArray(v.regressions) && Number.isSafeInteger(v.clockFloor) && v.regressions.every((r: any) => r && named(r.id) && named(r.tenant) && r.digest === evidenceDigest(payload(r)) && Array.isArray(r.runs) && (!r.review || r.review.digest === r.digest && r.review.reviewer === r.reviewer)) && new Set(v.regressions.map((r: ReviewedRegression) => r.id)).size === v.regressions.length;

export class CaseworkRegression {
  readonly storage: CaseworkStorage<State>;
  constructor(directory: string) { this.storage = new CaseworkStorage(directory, () => ({ regressions: [], clockFloor: 0 }), valid); }
  create(principal: CaseworkPrincipal, input: { source: RegressionSource; evidence: unknown; intent: string; input: unknown; assertions: RegressionAssertion[]; reviewer: string }, now = new Date()) {
    this.require(principal, "operator");
    const source = input.source;
    if (!source || !named(source.caseId) || !named(source.taskId) || !hash(source.publicationDigest) || !hash(source.observationDigest) || typeof source.gold !== "boolean"
      || !named(input.intent) || !named(input.reviewer) || input.reviewer === principal.id || !Array.isArray(input.assertions) || !input.assertions.length || input.assertions.length > 30) fail("invalid_fixture");
    if (!input.input || typeof input.input !== "object" || Array.isArray(input.input) || Object.hasOwn(input.input, "assertions") || JSON.stringify(input.input).length > 16000) fail("invalid_fixture");
    if (JSON.stringify(input.evidence ?? null).length > 200000 || input.evidence === undefined) fail("invalid_evidence");
    evidenceDigest(input.evidence);
    for (const a of input.assertions) {
      if (!a || Object.keys(a).some((k) => !["id", "type", "path", "value", "min", "max", "severity"].includes(k)) || !named(a.id) || a.severity !== "critical"
        || !["equals", "contains", "notContains", "range"].includes(a.type) || a.path !== undefined && (typeof a.path !== "string" || !a.path.startsWith("/") || a.path.length > 256)
        || ["contains", "notContains"].includes(a.type) && (typeof a.value !== "string" || !a.value.trim()) || a.type === "equals" && !Object.hasOwn(a, "value")
        || a.type === "range" && (a.min === undefined && a.max === undefined || a.min !== undefined && !Number.isFinite(a.min) || a.max !== undefined && !Number.isFinite(a.max) || a.min !== undefined && a.max !== undefined && a.min > a.max)) fail("invalid_assertion");
    }
    if (new Set(input.assertions.map((a) => a.id)).size !== input.assertions.length || JSON.stringify(input.assertions).length > 16000) fail("invalid_assertion");
    return this.change(now, (state) => {
      const id = randomUUID();
      const regression: ReviewedRegression = { id, tenant: principal.tenant, author: principal.id, reviewer: input.reviewer, createdAt: now.toISOString(), digest: "", source: structuredClone(source), evidence: structuredClone(input.evidence), review: null, runs: [],
        suite: { schemaVersion: 1, name: "Reviewed incident regression", version: "1", cases: [{ id: `regression-${id}`, intent: input.intent, split: "test", tags: ["development", "reviewed-regression"], input: structuredClone(input.input), assertions: structuredClone(input.assertions) }], gates: [{ minPassRate: 1, maxCriticalFailures: 0 }] } };
      regression.digest = evidenceDigest(payload(regression)); state.regressions.push(regression); return regression;
    });
  }
  list(principal: CaseworkPrincipal) { this.require(principal, "operator"); return this.storage.read().regressions.filter((r) => r.tenant === principal.tenant); }
  assignments(principal: CaseworkPrincipal) { this.require(principal, "labeler"); return this.storage.read().regressions.filter((r) => r.tenant === principal.tenant && r.reviewer === principal.id); }
  get(principal: CaseworkPrincipal, id: string) { this.require(principal, "operator"); return this.owned(this.storage.read(), principal.tenant, id); }
  executable(principal: CaseworkPrincipal, id: string) { const r = this.get(principal, id); if (!r.review?.approved || r.review.digest !== r.digest) fail("review_required"); return r; }
  review(principal: CaseworkPrincipal, id: string, approved: boolean, rationale: string, now = new Date()) {
    this.require(principal, "labeler");
    if (typeof approved !== "boolean" || typeof rationale !== "string" || !rationale.trim() || rationale.length > 2000) fail("invalid_review");
    return this.change(now, (state) => {
      const r = this.owned(state, principal.tenant, id);
      if (r.reviewer !== principal.id || r.author === principal.id) fail("not_assigned");
      if (r.review) fail("review_locked");
      r.review = { approved, reviewer: principal.id, rationale, at: now.toISOString(), digest: r.digest }; return r;
    });
  }
  recordRun(principal: CaseworkPrincipal, id: string, run: ReviewedRegression["runs"][number], suiteDigest: string, now = new Date()) {
    this.require(principal, "operator");
    if (!named(run.runId) || !hash(run.reportDigest) || !hash(run.targetRevision) || !["ai-audit", "python", "python-audit"].includes(run.target) || typeof run.passed !== "boolean" || !Number.isFinite(Date.parse(run.at)) || !Array.isArray(run.caseIds) || !run.caseIds.length || !run.caseIds.every(named)) fail("invalid_run");
    return this.change(now, (state) => {
      const r = this.owned(state, principal.tenant, id);
      if (!r.review?.approved || r.review.digest !== r.digest) fail("review_required");
      if (suiteDigest !== evidenceDigest(r.suite)) fail("suite_changed");
      const previous = r.runs.find((v) => v.runId === run.runId);
      if (previous) { if (evidenceDigest(previous) !== evidenceDigest(run)) fail("run_conflict"); return previous; }
      r.runs.push(structuredClone(run)); return run;
    });
  }
  private require(p: CaseworkPrincipal, role: CaseworkPrincipal["roles"][number]) { if (!p || !named(p.id) || !named(p.tenant) || !p.roles?.includes(role)) fail("forbidden"); }
  private owned(state: State, tenant: string, id: string) { return state.regressions.find((r) => r.tenant === tenant && r.id === id) ?? fail("not_found"); }
  private change<T>(now: Date, action: (state: State) => T): T { return this.storage.transact((state) => { if (!Number.isSafeInteger(now.getTime()) || now.getTime() < state.clockFloor) fail("clock_regressed"); state.clockFloor = now.getTime(); return action(state); }); }
}
