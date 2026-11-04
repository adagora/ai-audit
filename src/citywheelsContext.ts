import { evidenceDigest, type Snapshot } from "./qualification.js";
import { SyntheticCitywheelsBackend, type CustomerScope } from "./citywheelsExecutor.js";

export interface CitywheelsKnowledge {
  snapshot: Snapshot;
  validFrom: string;
  validUntil: string;
  owner: string;
}
export interface CitywheelsReadContext {
  source: "synthetic-citywheels-backend";
  bookingId: string;
  bookingVersion: number;
  observedAt: string;
  businessAt: string;
  expiresAt: string;
  knowledgeDigest: string;
  knowledgeValidFrom: string;
  knowledgeValidUntil: string;
  knowledgeOwner: string;
  claims: "unverified-customer-input";
  booking: { id: string; status: string; start: string; rental_price_eur: number; booking_fee_eur: number; deposit_eur: number; paid_with: "card" | "voucher"; bike_type: string; bikes: number; end: string; add_ons: string[] };
  digest: string;
}
const fail = (reason: string): never => { throw new Error(`audit_casework_${reason}`); };
const stamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function readCitywheelsContext(backend: SyntheticCitywheelsBackend, scope: CustomerScope, bookingId: string, knowledge: CitywheelsKnowledge, now = new Date(), businessAt = now, ttlMs = 300000): CitywheelsReadContext {
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(businessAt.getTime()) || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) fail("invalid_context_clock");
  if (!knowledge || !stamp(knowledge.validFrom) || !stamp(knowledge.validUntil) || !knowledge.owner?.trim()
    || Date.parse(knowledge.validFrom) > businessAt.getTime() || Date.parse(knowledge.validUntil) <= businessAt.getTime()
    || !knowledge.snapshot?.files.length || evidenceDigest(knowledge.snapshot.files) !== knowledge.snapshot.digest) fail("knowledge_unavailable");
  const b = backend.owned(scope, bookingId);
  if (!b.display || b.bookingFeeMinor === undefined || b.currency !== "EUR") return fail("booking_context_incomplete");
  const payload = { source: "synthetic-citywheels-backend" as const, bookingId: b.id, bookingVersion: b.version, observedAt: now.toISOString(), businessAt: businessAt.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    knowledgeDigest: knowledge.snapshot.digest, knowledgeValidFrom: knowledge.validFrom, knowledgeValidUntil: knowledge.validUntil, knowledgeOwner: knowledge.owner,
    claims: "unverified-customer-input" as const,
    booking: { id: b.id, status: b.status, start: b.startsAt, bike_type: b.display.bikeType, bikes: b.display.bikes, end: b.display.endsAt, add_ons: b.display.addOns, rental_price_eur: b.rentalMinor / 100, booking_fee_eur: b.bookingFeeMinor / 100, deposit_eur: b.depositMinor / 100, paid_with: b.paymentKind ?? "card" as const } };
  return { ...payload, digest: evidenceDigest(payload) };
}

export function validCitywheelsContext(context: any): context is CitywheelsReadContext {
  if (!context || typeof context !== "object" || !context.booking) return false;
  const { digest, ...payload } = context;
  return evidenceDigest(payload) === digest && context.source === "synthetic-citywheels-backend" && context.claims === "unverified-customer-input"
    && /^[a-f0-9]{64}$/.test(context.knowledgeDigest) && typeof context.knowledgeOwner === "string" && !!context.knowledgeOwner.trim()
    && [context.observedAt, context.businessAt, context.expiresAt, context.knowledgeValidFrom, context.knowledgeValidUntil].every(stamp)
    && Date.parse(context.expiresAt) > Date.parse(context.observedAt) && Date.parse(context.knowledgeValidUntil) > Date.parse(context.knowledgeValidFrom)
    && context.bookingId === context.booking.id && Number.isSafeInteger(context.bookingVersion) && context.bookingVersion > 0;
}

export function verifyCitywheelsContext(backend: SyntheticCitywheelsBackend, scope: CustomerScope, context: CitywheelsReadContext, knowledgeDigest: string, now = new Date(), businessAt = now): void {
  if (!validCitywheelsContext(context) || !Number.isFinite(now.getTime()) || !Number.isFinite(businessAt.getTime())
    || !stamp(context.observedAt) || !stamp(context.expiresAt) || now.getTime() < Date.parse(context.observedAt) || now.getTime() >= Date.parse(context.expiresAt)
    || businessAt.getTime() < Date.parse(context.businessAt) || knowledgeDigest !== context.knowledgeDigest || businessAt.getTime() < Date.parse(context.knowledgeValidFrom) || businessAt.getTime() >= Date.parse(context.knowledgeValidUntil)) fail("stale_context");
  const b = backend.owned(scope, context.bookingId);
  const expected = { id: b.id, status: b.status, start: b.startsAt, bike_type: b.display?.bikeType, bikes: b.display?.bikes, end: b.display?.endsAt, add_ons: b.display?.addOns, rental_price_eur: b.rentalMinor / 100, booking_fee_eur: b.bookingFeeMinor === undefined ? null : b.bookingFeeMinor / 100, deposit_eur: b.depositMinor / 100, paid_with: b.paymentKind ?? "card" };
  const band = (at: number) => { const hours = (Date.parse(b.startsAt) - at) / 3600000; return hours >= 48 ? 2 : hours >= 24 ? 1 : 0; };
  if (band(businessAt.getTime()) !== band(Date.parse(context.businessAt))) fail("stale_context");
  if (b.version !== context.bookingVersion || b.currency !== "EUR" || evidenceDigest(expected) !== evidenceDigest(context.booking)) fail("booking_changed");
}
