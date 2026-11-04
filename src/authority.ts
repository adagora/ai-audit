import { randomUUID } from "node:crypto";
import { CaseworkStorage } from "./caseworkStorage.js";
import { evidenceDigest, QualificationStore, type QualificationPackage, type Snapshot, type ComponentName } from "./qualification.js";
import type { Tier } from "./useCases.js";

export interface CaseworkPrincipal { tenant: string; id: string; roles: ("reviewer" | "deployer" | "operator" | "labeler" | "adjudicator")[] }
export interface CurrentRelease { targetRevision: string; components: Partial<Record<ComponentName, Snapshot>>; model: QualificationPackage["model"] }
export interface AuthorityLimits { actions: string[]; maxAmountMinor: number; currency: string }
export interface AuthorityGrant {
  id: string;
  tenant: string;
  intent: string;
  packageDigest: string;
  scope: "synthetic" | "production";
  tier: Exclude<Tier, "off">;
  limits: AuthorityLimits;
  reviewer: string;
  approvedAt: string;
  expiresAt: string;
  fallback: "human";
  acceptsMutableModel: boolean;
  digest: string;
}
interface AuthorityEvent { id: string; kind: "approved" | "activated" | "revoked"; grantId: string; tenant: string; actor: string; at: string; reason: string }
interface AuthorityState { grants: AuthorityGrant[]; active: Record<string, string>; revoked: string[]; events: AuthorityEvent[]; clockFloor: number }
export interface GrantRequest { packageDigest: string; scope: AuthorityGrant["scope"]; tier: AuthorityGrant["tier"]; limits: AuthorityLimits; expiresAt: string; acceptsMutableModel: boolean }
export interface AuthorizationRequest { tenant: string; intent: string; scope: AuthorityGrant["scope"]; action: string; amountMinor: number; currency: string }
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const named = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const fail = (reason: string): never => { throw new Error(`audit_authority_${reason}`); };
const activeKey = (tenant: string, intent: string, scope: string) => JSON.stringify([tenant, intent, scope]);
const grantPayload = ({ digest, ...payload }: AuthorityGrant) => payload;
const validLimits = (value: unknown): value is AuthorityLimits => object(value) && Object.keys(value).sort().join() === "actions,currency,maxAmountMinor" && Array.isArray(value.actions) && value.actions.length > 0
  && value.actions.every(named) && new Set(value.actions).size === value.actions.length && Number.isSafeInteger(value.maxAmountMinor) && value.maxAmountMinor >= 0 && /^[A-Z]{3}$/.test(value.currency);

function validState(value: unknown): value is AuthorityState {
  return object(value) && Array.isArray(value.grants) && Array.isArray(value.revoked) && object(value.active) && Array.isArray(value.events)
    && Number.isSafeInteger(value.clockFloor) && value.clockFloor >= 0
    && value.grants.every((g: any) => object(g) && named(g.tenant) && named(g.intent) && typeof g.id === "string" && validLimits(g.limits)
      && ["synthetic", "production"].includes(g.scope) && ["shadow", "assist", "contain", "transact"].includes(g.tier)
      && Number.isFinite(Date.parse(g.approvedAt)) && Number.isFinite(Date.parse(g.expiresAt)) && evidenceDigest(grantPayload(g as AuthorityGrant)) === g.digest)
    && new Set(value.grants.map((g: any) => g.id)).size === value.grants.length
    && value.revoked.every((id: any) => value.grants.some((g: any) => g.id === id))
    && Object.values(value.active).every((id) => value.grants.some((g: any) => g.id === id));
}

export class AuthorityStore {
  readonly storage: CaseworkStorage<AuthorityState>;
  constructor(directory: string, readonly qualifications: QualificationStore) {
    this.storage = new CaseworkStorage(directory, () => ({ grants: [], active: {}, revoked: [], events: [], clockFloor: 0 }), validState);
  }

  approve(principal: CaseworkPrincipal, request: GrantRequest, current: CurrentRelease, now = new Date()): AuthorityGrant {
    this.require(principal, "reviewer");
    if (!["synthetic", "production"].includes(request.scope) || !["shadow", "assist", "contain", "transact"].includes(request.tier)
      || !validLimits(request.limits) || typeof request.acceptsMutableModel !== "boolean" || !Number.isFinite(Date.parse(request.expiresAt)) || Date.parse(request.expiresAt) <= now.getTime()) fail("invalid_grant");
    const p = this.qualifications.load(request.packageDigest), assessment = this.qualifications.inspect(p, current);
    const tiers = ["shadow", "assist", "contain", "transact"];
    if (request.scope === "production" && (tiers.indexOf(request.tier) > tiers.indexOf(p.coverage.maximumTier) || request.limits.actions.some((action) => !p.coverage.actions.includes(action)))) fail("capability_ceiling");
    if (!assessment.integrity || !assessment.evidencePassed || !assessment.applicable || (request.scope === "production" && !assessment.readyForApproval)) fail("not_qualified");
    if (p.model.immutableRevision === null && !request.acceptsMutableModel) fail("mutable_model_unaccepted");
    const payload = { id: randomUUID(), tenant: principal.tenant, intent: p.intent, packageDigest: p.digest, scope: request.scope, tier: request.tier,
      limits: structuredClone(request.limits), reviewer: principal.id, approvedAt: now.toISOString(), expiresAt: new Date(request.expiresAt).toISOString(), fallback: "human" as const, acceptsMutableModel: request.acceptsMutableModel };
    const grant = { ...payload, digest: evidenceDigest(payload) };
    return this.transaction(now, (state) => { state.grants.push(grant); this.event(state, principal, "approved", grant.id, "explicit_review", now); return grant; });
  }

  activate(principal: CaseworkPrincipal, grantId: string, current: CurrentRelease, now = new Date()): AuthorityGrant {
    this.require(principal, "deployer");
    return this.transaction(now, (state) => {
      const grant = this.grant(state, principal.tenant, grantId, now);
      this.checkRelease(grant, current);
      state.active[activeKey(grant.tenant, grant.intent, grant.scope)] = grant.id;
      this.event(state, principal, "activated", grant.id, "explicit_activation", now);
      return grant;
    });
  }

  revoke(principal: CaseworkPrincipal, grantId: string, reason: string, now = new Date()): void {
    this.require(principal, "reviewer");
    if (!named(reason)) fail("invalid_reason");
    this.transaction(now, (state) => {
      const grant = state.grants.find((g) => g.id === grantId && g.tenant === principal.tenant);
      if (!grant) fail("unknown_grant");
      if (!state.revoked.includes(grantId)) { state.revoked.push(grantId); this.event(state, principal, "revoked", grantId, reason, now); }
    });
  }

  authorize(request: AuthorizationRequest, current: CurrentRelease, now = new Date()): AuthorityGrant {
    if (!named(request.tenant) || !named(request.intent) || !named(request.action) || !["synthetic", "production"].includes(request.scope)
      || !Number.isSafeInteger(request.amountMinor) || request.amountMinor < 0 || !/^[A-Z]{3}$/.test(request.currency)) fail("invalid_operation");
    return this.transaction(now, (state) => {
      const id = state.active[activeKey(request.tenant, request.intent, request.scope)];
      if (!id) fail("not_active");
      const grant = this.grant(state, request.tenant, id, now);
      if (grant.intent !== request.intent || grant.scope !== request.scope) fail("scope_mismatch");
      this.checkRelease(grant, current);
      if (!grant.limits.actions.includes(request.action) || grant.limits.currency !== request.currency || request.amountMinor > grant.limits.maxAmountMinor) fail("limits");
      return grant;
    });
  }

  view(principal: CaseworkPrincipal) {
    this.require(principal, "operator");
    const state = this.storage.read(), grants = state.grants.filter((g) => g.tenant === principal.tenant);
    return { grants, active: Object.fromEntries(Object.entries(state.active).filter(([, id]) => grants.some((g) => g.id === id))), revoked: state.revoked.filter((id) => grants.some((g) => g.id === id)), events: state.events.filter((e) => e.tenant === principal.tenant) };
  }

  private require(principal: CaseworkPrincipal, role: CaseworkPrincipal["roles"][number]): void {
    if (!principal || !named(principal.tenant) || !named(principal.id) || !Array.isArray(principal.roles) || !principal.roles.includes(role)) fail("forbidden");
  }

  private clock(state: AuthorityState, now: Date): void {
    if (!Number.isSafeInteger(now.getTime()) || now.getTime() < state.clockFloor) fail("clock_regressed");
    state.clockFloor = now.getTime();
  }

  private transaction<R>(now: Date, change: (state: AuthorityState) => R): R {
    const result = this.storage.transact((state): { ok: true; value: R } | { ok: false; error: string } => {
      this.clock(state, now);
      const draft = structuredClone(state);
      try { const value = change(draft); Object.assign(state, draft); return { ok: true, value }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : "audit_authority_failed" }; }
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }

  private grant(state: AuthorityState, tenant: string, id: string, now: Date): AuthorityGrant {
    const grant = state.grants.find((g) => g.id === id && g.tenant === tenant);
    if (!grant) return fail("unknown_grant");
    if (state.revoked.includes(id)) fail("revoked");
    if (Date.parse(grant.expiresAt) <= now.getTime()) fail("expired");
    return grant;
  }

  private checkRelease(grant: AuthorityGrant, current: CurrentRelease): void {
    const assessment = this.qualifications.inspect(this.qualifications.load(grant.packageDigest), current);
    if (!assessment.integrity || !assessment.evidencePassed || !assessment.applicable || (grant.scope === "production" && !assessment.readyForApproval)) fail("release_changed");
  }

  private event(state: AuthorityState, principal: CaseworkPrincipal, kind: AuthorityEvent["kind"], grantId: string, reason: string, now: Date): void {
    state.events.push({ id: randomUUID(), kind, grantId, tenant: principal.tenant, actor: principal.id, at: now.toISOString(), reason });
  }
}
