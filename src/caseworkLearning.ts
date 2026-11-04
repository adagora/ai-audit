import { randomUUID } from "node:crypto";
import { CaseworkStorage } from "./caseworkStorage.js";
import { evidenceDigest } from "./qualification.js";
import type { CaseworkPrincipal } from "./authority.js";

export interface LearningSource {
  family: string; kind: "synthetic" | "incident" | "representative"; sampling: "development" | "random" | "risk-selected";
  split: "dev" | "test" | "holdout"; owner: string; reference: string; sanitized: true; exposedToDevelopment: boolean;
}
interface HumanLabel { reviewer: string; value: boolean; at: string }
interface JudgeLabel { name: string; revision: string; value: boolean; source: string; at: string }
export interface LearningTask {
  id: string; tenant: string; caseId: string | null; intent: string; question: string; answer: string; context: unknown;
  source: LearningSource; rubric: { id: string; text: string; revision: string; digest: string };
  assigned: [string, string]; adjudicator: string; labels: HumanLabel[]; adjudication: HumanLabel | null;
  judge: JudgeLabel | null; snapshotDigest: string; createdBy: string; createdAt: string; published: { digest: string; at: string; by: string } | null;
}
interface LearningState { tasks: LearningTask[]; families: Record<string, { development: boolean; goldReleased: boolean }>; clockFloor: number }
export interface LearningInput {
  caseId: string | null; intent: string; question: string; answer: string; context: unknown; source: LearningSource;
  rubric: { id: string; text: string; revision: string }; assigned: [string, string]; adjudicator: string;
}
const named = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const fail = (code: string): never => { throw new Error(`audit_learning_${code}`); };
const familyKey = (tenant: string, family: string) => JSON.stringify([tenant, family]);
const resolved = (task: LearningTask): boolean | null => task.labels.length !== 2 ? null : task.labels[0].value === task.labels[1].value ? task.labels[0].value : task.adjudication?.value ?? null;
const valid = (v: any): v is LearningState => v && Array.isArray(v.tasks) && v.families && typeof v.families === "object" && Number.isSafeInteger(v.clockFloor)
  && v.tasks.every((t: any) => t && named(t.id) && named(t.tenant) && named(t.intent) && Array.isArray(t.assigned) && t.assigned.length === 2 && Array.isArray(t.labels) && t.labels.length <= 2
    && t.labels.every((l: any) => l && t.assigned.includes(l.reviewer) && typeof l.value === "boolean") && new Set(t.labels.map((l: any) => l.reviewer)).size === t.labels.length
    && new Set([...t.assigned, t.adjudicator]).size === 3 && t.rubric && t.rubric.digest === evidenceDigest({ id: t.rubric.id, text: t.rubric.text, revision: t.rubric.revision }))
  && new Set(v.tasks.map((t: LearningTask) => t.id)).size === v.tasks.length;

export class CaseworkLearning {
  readonly storage: CaseworkStorage<LearningState>;
  constructor(directory: string) { this.storage = new CaseworkStorage(directory, () => ({ tasks: [], families: {}, clockFloor: 0 }), valid); }

  create(principal: CaseworkPrincipal, input: LearningInput, now = new Date()): Pick<LearningTask, "id" | "snapshotDigest"> {
    this.require(principal, "operator");
    const s = input.source;
    if (!named(input.intent) || !(input.caseId === null || named(input.caseId)) || !text(input.question, 8000) || !text(input.answer, 128000)
      || !s || !named(s.family) || !["synthetic", "incident", "representative"].includes(s.kind) || !["development", "random", "risk-selected"].includes(s.sampling)
      || !["dev", "test", "holdout"].includes(s.split) || !named(s.owner) || !text(s.reference, 512) || s.sanitized !== true || typeof s.exposedToDevelopment !== "boolean"
      || !input.rubric || !named(input.rubric.id) || !text(input.rubric.text, 8000) || !named(input.rubric.revision)
      || !Array.isArray(input.assigned) || input.assigned.length !== 2 || !input.assigned.every(named) || !named(input.adjudicator) || new Set([...input.assigned, input.adjudicator]).size !== 3) return fail("invalid_task");
    const contextJson = evidenceDigest(input.context);
    if (JSON.stringify(input.context).length > 200000) fail("context_too_large");
    if (s.split === "holdout" && (s.exposedToDevelopment || s.sampling === "development" || s.kind === "incident")) fail("holdout_contaminated");
    const rubric = { ...input.rubric, digest: evidenceDigest(input.rubric) };
    const snapshotDigest = evidenceDigest({ tenant: principal.tenant, intent: input.intent, question: input.question, answer: input.answer, context: contextJson, source: s, rubric });
    return this.change(now, (state) => {
      const key = familyKey(principal.tenant, s.family), family = state.families[key];
      if (s.split === "holdout" && family?.development) fail("holdout_contaminated");
      state.families[key] = { development: !!family?.development || s.exposedToDevelopment || s.split !== "holdout", goldReleased: !!family?.goldReleased };
      const previous = state.tasks.find((t) => t.tenant === principal.tenant && t.snapshotDigest === snapshotDigest);
      if (previous) {
        if (JSON.stringify(previous.assigned) !== JSON.stringify(input.assigned) || previous.adjudicator !== input.adjudicator) fail("assignment_locked");
        return { id: previous.id, snapshotDigest: previous.snapshotDigest };
      }
      const task: LearningTask = { id: randomUUID(), tenant: principal.tenant, caseId: input.caseId, intent: input.intent, question: input.question, answer: input.answer, context: structuredClone(input.context), source: structuredClone(input.source), assigned: [...input.assigned], adjudicator: input.adjudicator, rubric, labels: [], adjudication: null, judge: null, snapshotDigest, createdBy: principal.id, createdAt: now.toISOString(), published: null };
      state.tasks.push(task); return { id: task.id, snapshotDigest: task.snapshotDigest };
    });
  }

  list(principal: CaseworkPrincipal) {
    this.require(principal, "operator");
    return this.storage.read().tasks.filter((t) => t.tenant === principal.tenant).map((t) => ({ id: t.id, caseId: t.caseId, intent: t.intent, rubric: t.rubric, source: t.source,
      assigned: t.assigned, adjudicator: t.adjudicator, submitted: t.labels.length, state: t.labels.length < 2 ? "awaiting-labels" : resolved(t) === null ? "needs-adjudication" : "resolved", judgeRecorded: !!t.judge, published: t.published, snapshotDigest: t.snapshotDigest }));
  }

  publishedFailures(principal: CaseworkPrincipal) {
    this.require(principal, "operator");
    return this.storage.read().tasks.flatMap((t) => t.tenant === principal.tenant && t.published && t.caseId !== null && resolved(t) === false
      ? [{ caseId: t.caseId, intent: t.intent, at: t.published.at, digest: t.published.digest }] : []);
  }

  assignments(principal: CaseworkPrincipal) {
    this.identity(principal);
    if (!principal.roles?.includes("labeler") && !principal.roles?.includes("adjudicator")) return fail("forbidden");
    return this.storage.read().tasks.filter((t) => t.tenant === principal.tenant && (t.assigned.includes(principal.id) || t.adjudicator === principal.id)).map((t) => {
      const adjudicator = t.adjudicator === principal.id && principal.roles.includes("adjudicator");
      const own = t.labels.find((l) => l.reviewer === principal.id);
      return { id: t.id, intent: t.intent, question: t.question, answer: t.answer, context: t.context, rubric: t.rubric, source: t.source,
        ownLabel: own ?? null, submitted: t.labels.length, adjudicator,
        peerLabels: adjudicator && t.labels.length === 2 && t.labels[0].value !== t.labels[1].value ? t.labels : null,
        adjudication: adjudicator ? t.adjudication : null,
        state: t.labels.length < 2 ? "awaiting-labels" : resolved(t) === null ? "needs-adjudication" : "resolved" };
    });
  }

  label(principal: CaseworkPrincipal, id: string, value: boolean, now = new Date()): void {
    this.require(principal, "labeler");
    if (typeof value !== "boolean") return fail("invalid_label");
    this.change(now, (state) => {
      const t = this.owned(state, principal.tenant, id);
      if (!t.assigned.includes(principal.id)) fail("not_assigned");
      if (t.published || t.labels.some((l) => l.reviewer === principal.id)) fail("label_locked");
      t.labels.push({ reviewer: principal.id, value, at: now.toISOString() });
    });
  }

  adjudicate(principal: CaseworkPrincipal, id: string, value: boolean, now = new Date()): void {
    this.require(principal, "adjudicator");
    if (typeof value !== "boolean") return fail("invalid_label");
    this.change(now, (state) => {
      const t = this.owned(state, principal.tenant, id);
      if (t.adjudicator !== principal.id || t.assigned.includes(principal.id)) fail("not_assigned");
      if (t.published || t.adjudication) fail("label_locked");
      if (t.labels.length !== 2 || t.labels[0].value === t.labels[1].value) fail("adjudication_not_required");
      t.adjudication = { reviewer: principal.id, value, at: now.toISOString() };
    });
  }

  recordJudge(principal: CaseworkPrincipal, id: string, input: { name: string; revision: string; value: boolean; source: string }, now = new Date()): void {
    this.require(principal, "operator");
    if (!named(input.name) || !named(input.revision) || typeof input.value !== "boolean" || !text(input.source, 512)) return fail("invalid_judge");
    this.change(now, (state) => {
      const t = this.owned(state, principal.tenant, id), family = state.families[familyKey(principal.tenant, t.source.family)];
      if (t.published || family?.goldReleased) fail("gold_already_exposed");
      if (t.judge) fail("judge_locked");
      t.judge = { ...input, at: now.toISOString() };
    });
  }

  publish(principal: CaseworkPrincipal, id: string, now = new Date()) {
    this.require(principal, "operator");
    return this.change(now, (state) => {
      const t = this.owned(state, principal.tenant, id), gold = resolved(t);
      if (gold === null) return fail("labels_unresolved");
      const payload = { format: "ai-audit-reviewed-label" as const, version: 1, taskId: t.id, snapshotDigest: t.snapshotDigest, source: t.source, rubric: t.rubric,
        humans: t.assigned.map((reviewer) => t.labels.find((l) => l.reviewer === reviewer)), adjudication: t.adjudication, gold, judge: t.judge };
      const digest = evidenceDigest(payload);
      t.published ??= { digest, by: principal.id, at: now.toISOString() };
      if (t.published.digest !== digest) return fail("publication_changed");
      state.families[familyKey(principal.tenant, t.source.family)].goldReleased = true;
      return { ...payload, publication: t.published, digest, representative: !state.families[familyKey(principal.tenant, t.source.family)].development && t.source.split === "holdout" && t.source.kind === "representative" && t.source.sampling === "random" && !t.source.exposedToDevelopment };
    });
  }

  reviewedSample(principal: CaseworkPrincipal, id: string) {
    this.require(principal, "operator");
    const t = this.owned(this.storage.read(), principal.tenant, id);
    if (!t.published) return fail("publication_required");
    return { caseId: t.caseId, context: t.context, rubric: t.rubric, snapshotDigest: t.snapshotDigest };
  }

  calibrationInput(principal: CaseworkPrincipal, ids: string[], rubricDigest: string, judge: { name: string; revision: string }, now = new Date()) {
    this.require(principal, "operator");
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || !judge || !named(judge.name) || !named(judge.revision)) return fail("invalid_selection");
    return this.change(now, (state) => {
      const tasks = ids.map((id) => this.owned(state, principal.tenant, id));
      if (new Set(tasks.map((t) => t.source.family)).size !== tasks.length) fail("repeated_source_family");
      for (const t of tasks) {
        if (t.rubric.digest !== rubricDigest) fail("rubric_changed");
        if (t.labels.length !== 2) fail("labels_unresolved");
        if (t.source.split !== "holdout" || t.source.exposedToDevelopment || state.families[familyKey(principal.tenant, t.source.family)].development) fail("not_independent_holdout");
        if (!t.judge || t.judge.name !== judge.name || t.judge.revision !== judge.revision) fail("judge_changed_or_missing");
      }
      for (const t of tasks) state.families[familyKey(principal.tenant, t.source.family)].goldReleased = true;
      const rows = tasks.map((t) => ({ caseId: t.id, intent: t.intent, rubric: t.rubric.id, split: "holdout" as const,
        humans: t.assigned.map((id) => ({ reviewer: id, value: (t.labels.find((l) => l.reviewer === id) ?? fail("labels_unresolved")).value })),
        ...(t.adjudication ? { adjudication: { reviewer: t.adjudication.reviewer, value: t.adjudication.value } } : {}), judge: (t.judge ?? fail("judge_changed_or_missing")).value }));
      return { dataset: { schemaVersion: 1, judge, datasetVersion: evidenceDigest(tasks.map((t) => ({ snapshotDigest: t.snapshotDigest, labels: t.labels, adjudication: t.adjudication, judge: t.judge }))), rows },
        provenance: { rubricDigest, sourceSnapshots: tasks.map((t) => t.snapshotDigest), representative: tasks.every((t) => t.source.kind === "representative" && t.source.sampling === "random"), operatorAttested: true } };
    });
  }

  private identity(principal: CaseworkPrincipal) { if (!principal || !named(principal.id) || !named(principal.tenant) || !Array.isArray(principal.roles)) fail("forbidden"); }
  private require(principal: CaseworkPrincipal, role: CaseworkPrincipal["roles"][number]) { this.identity(principal); if (!principal.roles.includes(role)) fail("forbidden"); }
  private owned(state: LearningState, tenant: string, id: string) { return state.tasks.find((t) => t.id === id && t.tenant === tenant) ?? fail("not_found"); }
  private change<T>(now: Date, action: (state: LearningState) => T): T {
    return this.storage.transact((state) => { if (!Number.isSafeInteger(now.getTime()) || now.getTime() < state.clockFloor) return fail("clock_regressed"); state.clockFloor = now.getTime(); return action(state); });
  }
}
