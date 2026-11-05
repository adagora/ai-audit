import { CaseworkStorage } from "./caseworkStorage.js";
import { AuthorityStore, type CaseworkPrincipal, type CurrentRelease } from "./authority.js";
import { evidenceDigest } from "./qualification.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CustomerScope { tenant: string; customer: string }
export interface SyntheticBooking {
  id: string; tenant: string; customer: string; version: number; status: "confirmed" | "cancelled" | "completed" | "in_progress";
  startsAt: string; rentalMinor: number; depositMinor: number; currency: string; paymentRef: string;
  paymentKind?: "card" | "voucher";
  bookingFeeMinor?: number;
  display?: { bikeType: string; bikes: number; endsAt: string; addOns: string[] };
  cancelledBy?: string;
}
interface RefundEntry { operationId: string; bookingId: string; amountMinor: number; currency: string; paymentRef: string; paymentKind?: "card" | "voucher"; settledAt: string }
interface BackendState { bookings: SyntheticBooking[]; refunds: RefundEntry[] }
export interface CancellationProposal {
  id: string; tenant: string; customer: string; caseId: string; bookingId: string; bookingVersion: number;
  intent: string; action: "cancel-refund"; amountMinor: number; currency: string; policyDigest: string;
  createdAt: string; expiresAt: string;
  generation?: number; supersedes?: string | null; businessAt?: string; calculationId?: string; paymentKind?: "card" | "voucher";
}
interface OperationEvent { type: string; at: string; actor: string; code: string }
export interface CancellationOperation {
  proposal: CancellationProposal;
  status: "proposed" | "ready" | "dispatching" | "unknown" | "done" | "rejected" | "superseded";
  consentAt: string | null;
  consentDigest?: string;
  review: { reviewer: string; verdict: "approved" | "rejected"; proposalDigest: string; at: string } | null;
  grantId: string | null;
  exception: { owner: string; code: string; openedAt: string } | null;
  events: OperationEvent[];
  resolution?: { reviewer: string; at: string; proposalDigest: string; code: "complete_original_refund" };
}
interface ExecutorState { operations: CancellationOperation[] }
export type ExecutorFault = "before-dispatch" | "after-cancel" | "after-refund" | "refund-failure";
export const CANCELLATION_CALCULATION = evidenceDigest({ name: "citywheels-cancellation-minor-v1", fullHours: 48, halfHours: 24, halfRounding: "floor", confirmedDeposit: "return", bookingFee: "excluded", destination: "original-payment-method" });
const named = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const minor = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const fail = (reason: string): never => { throw new Error(`audit_executor_${reason}`); };
const validBooking = (b: any): b is SyntheticBooking => b && named(b.id) && named(b.tenant) && named(b.customer) && Number.isSafeInteger(b.version) && b.version >= 1
  && ["confirmed", "cancelled", "completed", "in_progress"].includes(b.status) && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(b.startsAt) && Number.isFinite(Date.parse(b.startsAt)) && minor(b.rentalMinor) && minor(b.depositMinor) && minor(b.rentalMinor + b.depositMinor)
  && (b.display === undefined || (typeof b.display.bikeType === "string" && Number.isSafeInteger(b.display.bikes) && b.display.bikes > 0 && Number.isFinite(Date.parse(b.display.endsAt)) && Array.isArray(b.display.addOns) && b.display.addOns.every((v: unknown) => typeof v === "string")))
  && (b.bookingFeeMinor === undefined || minor(b.bookingFeeMinor)) && /^[A-Z]{3}$/.test(b.currency) && named(b.paymentRef) && (b.paymentKind === undefined || ["card", "voucher"].includes(b.paymentKind));
const validBackend = (v: any): v is BackendState => v && Array.isArray(v.bookings) && Array.isArray(v.refunds) && v.bookings.every(validBooking)
  && new Set(v.bookings.map((b: SyntheticBooking) => JSON.stringify([b.tenant, b.id]))).size === v.bookings.length
  && v.refunds.every((r: any) => r && named(r.operationId) && named(r.bookingId) && minor(r.amountMinor) && /^[A-Z]{3}$/.test(r.currency) && named(r.paymentRef) && Number.isFinite(Date.parse(r.settledAt)))
  && new Set(v.refunds.map((r: RefundEntry) => r.operationId)).size === v.refunds.length;
const validExecutor = (v: any): v is ExecutorState => v && Array.isArray(v.operations) && v.operations.every((o: any) => o && o.proposal && named(o.proposal.id)
  && named(o.proposal.tenant) && named(o.proposal.customer) && minor(o.proposal.amountMinor) && Array.isArray(o.events)
  && ["proposed", "ready", "dispatching", "unknown", "done", "rejected", "superseded"].includes(o.status)) && new Set(v.operations.map((o: CancellationOperation) => o.proposal.id)).size === v.operations.length;

export class SyntheticCitywheelsBackend {
  readonly storage: CaseworkStorage<BackendState>;
  constructor(directory: string, bookings: SyntheticBooking[] = []) {
    if (!validBackend({ bookings, refunds: [] })) fail("invalid_bookings");
    this.storage = new CaseworkStorage(directory, () => ({ bookings: structuredClone(bookings), refunds: [] }), validBackend);
    if (existsSync(join(this.storage.directory, "state.json"))) this.storage.read();
    else this.storage.transact(() => undefined);
  }

  bookings(scope: CustomerScope): Omit<SyntheticBooking, "paymentRef">[] {
    if (!named(scope?.tenant) || !named(scope.customer)) return fail("invalid_scope");
    return this.storage.read().bookings.filter((b) => b.tenant === scope.tenant && b.customer === scope.customer).map(({ paymentRef, ...publicBooking }) => publicBooking);
  }

  owned(scope: CustomerScope, bookingId: string): SyntheticBooking {
    if (!named(scope?.tenant) || !named(scope.customer) || !named(bookingId)) return fail("invalid_scope");
    const booking = this.storage.read().bookings.find((b) => b.tenant === scope.tenant && b.customer === scope.customer && b.id === bookingId);
    return booking ?? fail("booking_not_accessible");
  }

  cancel(proposal: CancellationProposal): void {
    this.storage.transact((state) => {
      const b = state.bookings.find((b) => b.tenant === proposal.tenant && b.customer === proposal.customer && b.id === proposal.bookingId);
      if (!b) return fail("booking_not_accessible");
      if (b.cancelledBy === proposal.id && b.status === "cancelled") return;
      if (b.version !== proposal.bookingVersion || b.status !== "confirmed") fail("booking_changed");
      b.status = "cancelled"; b.cancelledBy = proposal.id; b.version++;
    });
  }

  refund(proposal: CancellationProposal, now: Date): void {
    this.storage.transact((state) => {
      const b = state.bookings.find((b) => b.tenant === proposal.tenant && b.customer === proposal.customer && b.id === proposal.bookingId);
      if (!b || b.cancelledBy !== proposal.id || b.status !== "cancelled") return fail("cancellation_not_observed");
      const previous = state.refunds.find((r) => r.operationId === proposal.id);
      if (previous) {
        if (previous.amountMinor !== proposal.amountMinor || previous.currency !== proposal.currency || previous.paymentRef !== b.paymentRef || (previous.paymentKind ?? "card") !== (proposal.paymentKind ?? "card")) fail("idempotency_conflict");
        return;
      }
      if (b.currency !== proposal.currency || (b.paymentKind ?? "card") !== (proposal.paymentKind ?? "card")) fail("refund_method_changed");
      state.refunds.push({ operationId: proposal.id, bookingId: proposal.bookingId, amountMinor: proposal.amountMinor, currency: proposal.currency, paymentRef: b.paymentRef, paymentKind: b.paymentKind ?? "card", settledAt: now.toISOString() });
    });
  }

  observe(proposal: CancellationProposal): "none" | "cancelled-only" | "settled" {
    const state = this.storage.read(), b = state.bookings.find((b) => b.tenant === proposal.tenant && b.customer === proposal.customer && b.id === proposal.bookingId);
    const r = state.refunds.find((r) => r.operationId === proposal.id);
    if (b?.cancelledBy === proposal.id && b.status === "cancelled") {
      if (!r) return "cancelled-only";
      if (r.amountMinor !== proposal.amountMinor || r.currency !== proposal.currency || r.paymentRef !== b.paymentRef || r.bookingId !== b.id || (r.paymentKind ?? "card") !== (proposal.paymentKind ?? "card")) fail("readback_mismatch");
      return "settled";
    }
    if (r) fail("readback_mismatch");
    return "none";
  }
}

export class SyntheticCancellationExecutor {
  readonly storage: CaseworkStorage<ExecutorState>;
  constructor(directory: string, readonly backend: SyntheticCitywheelsBackend, readonly authority: AuthorityStore,
    private readonly currentRelease: () => CurrentRelease, private readonly options: { intent: string; autoApproveMinor: number; exceptionOwner: string; quoteTtlMs?: number; businessClock?: (systemTime: Date) => Date }) {
    if (!named(options.intent) || !named(options.exceptionOwner) || !minor(options.autoApproveMinor)
      || !Number.isSafeInteger(options.quoteTtlMs ?? 300000) || (options.quoteTtlMs ?? 300000) <= 0) fail("invalid_options");
    this.storage = new CaseworkStorage(directory, () => ({ operations: [] }), validExecutor);
  }

  propose(scope: CustomerScope, caseId: string, bookingId: string, now = new Date(), stormClaim = false, requestedBy = scope.customer): CancellationOperation {
    if (!named(caseId) || !Number.isFinite(now.getTime())) return fail("invalid_proposal");
    const b = this.backend.owned(scope, bookingId);
    if (b.status !== "confirmed") {
      const previous = this.storage.read().operations.find((op) => op.proposal.id === b.cancelledBy && op.proposal.caseId === caseId && op.proposal.tenant === scope.tenant && op.proposal.customer === scope.customer);
      if (previous) return previous;
      fail("not_cancellable");
    }
    if (stormClaim) fail("staff_required_for_claim");
    const policyDigest = this.currentRelease().components.policy?.digest;
    if (!policyDigest) return fail("missing_policy_identity");
    const proposal = this.proposal(scope, caseId, b, policyDigest, 1, null, now);
    if (!named(requestedBy)) return fail("invalid_actor");
    return this.storage.transact((state) => {
      const previous = state.operations.find((o) => o.proposal.id === proposal.id);
      if (previous) return previous;
      const op: CancellationOperation = { proposal, status: "proposed", consentAt: null, review: null, grantId: null, exception: null, events: [{ type: "proposed", at: now.toISOString(), actor: requestedBy, code: "quote_only" }] };
      state.operations.push(op); return op;
    });
  }

  renew(scope: CustomerScope, id: string, now = new Date(), requestedBy = scope.customer): CancellationOperation {
    if (!named(requestedBy) || !Number.isFinite(now.getTime())) return fail("invalid_actor");
    return this.storage.transact((state) => {
      const old = this.owned(state, scope, id);
      this.observedAt(old, now);
      if (old.status === "superseded") return state.operations.find((o) => o.proposal.supersedes === id) ?? fail("renewal_missing");
      if (now.getTime() < Date.parse(old.proposal.expiresAt)) fail("proposal_not_expired");
      if (!["proposed", "ready", "rejected"].includes(old.status) || this.backend.observe(old.proposal) !== "none") fail("cannot_renew_committed");
      const b = this.backend.owned(scope, old.proposal.bookingId);
      if (b.status !== "confirmed") fail("not_cancellable");
      const policy = this.currentRelease().components.policy?.digest;
      if (!policy) return fail("missing_policy_identity");
      const proposal = this.proposal(scope, old.proposal.caseId, b, policy, (old.proposal.generation ?? 1) + 1, old.proposal.id, now);
      old.status = "superseded"; old.events.push({ type: "quote-superseded", at: now.toISOString(), actor: requestedBy, code: "expired_quote_renewed" });
      const op: CancellationOperation = { proposal, status: "proposed", consentAt: null, review: null, grantId: null, exception: null, events: [{ type: "proposed", at: now.toISOString(), actor: requestedBy, code: "renewed_without_old_authority" }] };
      state.operations.push(op); return op;
    });
  }

  consent(scope: CustomerScope, id: string, now = new Date()): CancellationOperation {
    return this.storage.transact((state) => {
      const op = this.owned(state, scope, id);
      this.fresh(op, now);
      if (!["proposed", "ready"].includes(op.status)) fail("not_reviewable");
      op.consentAt = now.toISOString(); op.consentDigest = evidenceDigest(op.proposal); op.status = "ready";
      op.events.push({ type: "consent", at: now.toISOString(), actor: scope.customer, code: "exact_proposal" });
      return op;
    });
  }

  review(principal: CaseworkPrincipal, id: string, verdict: "approved" | "rejected", now = new Date()): CancellationOperation {
    if (!principal || !named(principal.id) || !named(principal.tenant) || !Array.isArray(principal.roles) || !principal.roles.includes("reviewer") || !["approved", "rejected"].includes(verdict)) return fail("review_forbidden");
    return this.storage.transact((state) => {
      const op = state.operations.find((o) => o.proposal.id === id && o.proposal.tenant === principal.tenant);
      if (!op) return fail("unknown_operation");
      this.fresh(op, now);
      if (op.review || !["proposed", "ready"].includes(op.status)) fail("already_reviewed");
      op.review = { reviewer: principal.id, verdict, proposalDigest: evidenceDigest(op.proposal), at: now.toISOString() };
      if (verdict === "rejected") op.status = "rejected";
      op.events.push({ type: "review", at: now.toISOString(), actor: principal.id, code: verdict });
      return op;
    });
  }

  execute(scope: CustomerScope, id: string, now = new Date(), fault?: ExecutorFault): CancellationOperation {
    const reserved = this.storage.transact((state) => {
      const op = this.owned(state, scope, id);
      if (op.status === "done") return { op, dispatch: false };
      this.fresh(op, now);
      if (op.status !== "ready" || !op.consentAt || op.consentDigest !== evidenceDigest(op.proposal)) fail("not_ready");
      this.approvedOperation(op);
      const b = this.backend.owned(scope, op.proposal.bookingId), current = this.currentRelease();
      if (b.status !== "confirmed" || b.version !== op.proposal.bookingVersion || this.amount(b, this.businessNow(now)) !== op.proposal.amountMinor || b.currency !== op.proposal.currency || (b.paymentKind ?? "card") !== (op.proposal.paymentKind ?? "card")) fail("booking_changed");
      if (op.proposal.calculationId && op.proposal.calculationId !== CANCELLATION_CALCULATION) fail("calculation_changed");
      if (current.components.policy?.digest !== op.proposal.policyDigest) fail("policy_changed");
      const grant = this.authority.authorize({ tenant: scope.tenant, intent: op.proposal.intent, scope: "synthetic", action: op.proposal.action, amountMinor: op.proposal.amountMinor, currency: op.proposal.currency }, current, now);
      if (grant.tier !== "transact") fail("tier_cannot_transact");
      op.grantId = grant.id; op.status = "dispatching";
      op.exception = { owner: this.options.exceptionOwner, code: "dispatch_pending_readback", openedAt: now.toISOString() };
      op.events.push({ type: "dispatch-reserved", at: now.toISOString(), actor: "executor", code: "synthetic" });
      return { op, dispatch: true };
    });
    if (!reserved.dispatch) return reserved.op;
    if (fault === "before-dispatch") throw new Error("synthetic_crash_before_dispatch");
    this.backend.cancel(reserved.op.proposal);
    if (fault === "after-cancel") throw new Error("synthetic_crash_after_cancel");
    if (fault === "refund-failure") return this.markUnknown(scope, id, "refund_backend_failed", now);
    this.backend.refund(reserved.op.proposal, now);
    if (fault === "after-refund") throw new Error("synthetic_crash_after_refund");
    return this.reconcile(scope, id, now);
  }

  reconcile(scope: CustomerScope, id: string, now = new Date()): CancellationOperation {
    return this.storage.transact((state) => {
      const op = this.owned(state, scope, id);
      this.observedAt(op, now);
      if (!["dispatching", "unknown", "done"].includes(op.status)) fail("not_dispatched");
      let observed: ReturnType<SyntheticCitywheelsBackend["observe"]>;
      try { observed = this.backend.observe(op.proposal); }
      catch (error) {
        const code = error instanceof Error && error.message === "audit_executor_readback_mismatch" ? "readback_mismatch" : "backend_evidence_unavailable";
        op.status = "unknown"; op.exception = { owner: this.options.exceptionOwner, code, openedAt: now.toISOString() };
        op.events.push({ type: "read-back-failed", at: now.toISOString(), actor: "executor", code });
        return op;
      }
      if (observed === "settled") { op.status = "done"; op.exception = null; }
      else if (observed === "none") {
        const b = this.backend.owned(scope, op.proposal.bookingId);
        if (b.status === "confirmed" && b.version === op.proposal.bookingVersion) { op.status = "ready"; op.exception = null; }
        else { op.status = "unknown"; op.exception = { owner: this.options.exceptionOwner, code: "booking_changed_after_reservation", openedAt: now.toISOString() }; }
      }
      else { op.status = "unknown"; op.exception = { owner: this.options.exceptionOwner, code: "cancelled_refund_unsettled", openedAt: now.toISOString() }; }
      op.events.push({ type: "read-back", at: now.toISOString(), actor: "executor", code: observed });
      return op;
    });
  }

  completeRefund(principal: CaseworkPrincipal, scope: CustomerScope, id: string, now = new Date(), fault?: "after-refund"): CancellationOperation {
    if (!principal || principal.tenant !== scope.tenant || !named(principal.id) || !Array.isArray(principal.roles) || !principal.roles.includes("operator") || !principal.roles.includes("reviewer")) return fail("resolution_forbidden");
    const reserved = this.storage.transact((state) => {
      const op = this.owned(state, scope, id);
      this.observedAt(op, now);
      if (op.status === "done") return { op, dispatch: false };
      if (op.status !== "unknown" || !op.exception) return fail("reconcile_before_resolution");
      const observed = this.backend.observe(op.proposal);
      if (observed === "settled") { op.status = "done"; op.exception = null; op.events.push({ type: "read-back", actor: principal.id, code: "settled", at: now.toISOString() }); return { op, dispatch: false }; }
      if (observed !== "cancelled-only") return fail("no_committed_cancellation");
      if (!op.consentAt || op.consentDigest !== evidenceDigest(op.proposal)) fail("consent_required");
      this.approvedOperation(op);
      const b = this.backend.owned(scope, op.proposal.bookingId), current = this.currentRelease();
      if (b.cancelledBy !== id || b.version !== op.proposal.bookingVersion + 1 || b.currency !== op.proposal.currency || (b.paymentKind ?? "card") !== (op.proposal.paymentKind ?? "card")) fail("booking_changed");
      if (!op.proposal.businessAt || this.amount(b, new Date(op.proposal.businessAt)) !== op.proposal.amountMinor) fail("original_facts_unverified");
      if (current.components.policy?.digest !== op.proposal.policyDigest || op.proposal.calculationId !== CANCELLATION_CALCULATION) fail("policy_changed");
      const grant = this.authority.authorize({ tenant: scope.tenant, intent: op.proposal.intent, scope: "synthetic", action: op.proposal.action, amountMinor: op.proposal.amountMinor, currency: op.proposal.currency }, current, now);
      if (grant.tier !== "transact") fail("tier_cannot_transact");
      op.grantId = grant.id; op.status = "dispatching";
      op.resolution = { reviewer: principal.id, at: now.toISOString(), proposalDigest: evidenceDigest(op.proposal), code: "complete_original_refund" };
      op.events.push({ type: "resolution-authorized", at: now.toISOString(), actor: principal.id, code: "complete_original_refund" });
      return { op, dispatch: true };
    });
    if (!reserved.dispatch) return reserved.op;
    this.backend.refund(reserved.op.proposal, now);
    if (fault === "after-refund") throw new Error("synthetic_crash_after_resolution_refund");
    return this.reconcile(scope, id, now);
  }

  list(scope: CustomerScope): CancellationOperation[] {
    if (!named(scope?.tenant) || !named(scope.customer)) return fail("invalid_scope");
    return this.storage.read().operations.filter((o) => o.proposal.tenant === scope.tenant && o.proposal.customer === scope.customer);
  }

  view(scope: CustomerScope, id: string): CancellationOperation { return this.owned(this.storage.read(), scope, id); }

  private amount(b: SyntheticBooking, now: Date): number {
    const ms = Date.parse(b.startsAt) - now.getTime();
    return b.depositMinor + (ms >= 48 * 3600000 ? b.rentalMinor : ms >= 24 * 3600000 ? Math.floor(b.rentalMinor / 2) : 0);
  }

  private businessNow(now: Date): Date {
    const business = this.options.businessClock ? this.options.businessClock(new Date(now.getTime())) : now;
    if (!(business instanceof Date) || !Number.isFinite(business.getTime())) return fail("invalid_business_clock");
    return business;
  }

  private proposal(scope: CustomerScope, caseId: string, b: SyntheticBooking, policyDigest: string, generation: number, supersedes: string | null, now: Date): CancellationProposal {
    const business = this.businessNow(now), amountMinor = this.amount(b, business);
    if (!Number.isSafeInteger(generation) || generation < 1) return fail("invalid_generation");
    const identity = { tenant: scope.tenant, customer: scope.customer, caseId, bookingId: b.id, bookingVersion: b.version, intent: this.options.intent, action: "cancel-refund" as const, amountMinor, currency: b.currency, policyDigest, generation, supersedes, calculationId: CANCELLATION_CALCULATION, paymentKind: b.paymentKind ?? "card" as const };
    return { ...identity, id: evidenceDigest(identity), businessAt: business.toISOString(), createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + (this.options.quoteTtlMs ?? 300000)).toISOString() };
  }

  private approvedOperation(op: CancellationOperation): void {
    if (op.review?.verdict === "rejected" || (op.proposal.amountMinor > this.options.autoApproveMinor && (op.review?.verdict !== "approved" || op.review.proposalDigest !== evidenceDigest(op.proposal)))) fail("operation_approval_required");
  }

  private owned(state: ExecutorState, scope: CustomerScope, id: string): CancellationOperation {
    if (!named(scope?.tenant) || !named(scope.customer)) return fail("invalid_scope");
    return state.operations.find((o) => o.proposal.id === id && o.proposal.tenant === scope.tenant && o.proposal.customer === scope.customer) ?? fail("unknown_operation");
  }

  private fresh(op: CancellationOperation, now: Date): void {
    this.observedAt(op, now);
    if (!Number.isFinite(now.getTime()) || now.getTime() < Date.parse(op.proposal.createdAt) || now.getTime() >= Date.parse(op.proposal.expiresAt)) fail("proposal_expired");
  }

  private observedAt(op: CancellationOperation, now: Date): void {
    if (!Number.isFinite(now.getTime()) || now.getTime() < Date.parse(op.events.at(-1)?.at ?? op.proposal.createdAt)) fail("clock_regressed");
  }

  private markUnknown(scope: CustomerScope, id: string, code: string, now: Date): CancellationOperation {
    return this.storage.transact((state) => {
      const op = this.owned(state, scope, id); op.status = "unknown";
      op.exception = { owner: this.options.exceptionOwner, code, openedAt: now.toISOString() };
      op.events.push({ type: "exception", at: now.toISOString(), actor: "executor", code });
      return op;
    });
  }
}
