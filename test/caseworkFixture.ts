import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthorityStore, type CaseworkPrincipal, type GrantRequest } from "../src/authority.js";
import { COMPONENTS, evidenceDigest, QualificationStore } from "../src/qualification.js";

export function caseworkFixture() {
  const root = mkdtempSync(join(tmpdir(), "casework-")), qualifications = new QualificationStore(join(root, "qualifications"));
  const files = [{ path: "component.json", ...qualifications.put("synthetic-component") }];
  const components = Object.fromEntries(COMPONENTS.map((name) => [name, { files, digest: evidenceDigest(files) }]));
  const suite = { schemaVersion: 1, name: "quotes", version: "1", cases: [{ id: "one", intent: "refund", split: "holdout", input: { question: "What refund can I get?" }, assertions: [{ id: "amount" }] }] };
  const report = { schemaVersion: 1, suite: { hash: evidenceDigest(suite) }, target: { revision: "r1" }, options: { repetitions: 1 }, passed: true, gates: [], results: [{ caseId: "one", intent: "refund", split: "holdout", repetition: 0, status: "pass", output: { answer: "340 EUR, calculation only." }, checks: [{ id: "amount", status: "pass", severity: "critical" }] }] };
  const model = { name: "fake", provider: "scripted", immutableRevision: null };
  const p = qualifications.create({ intent: "refund", targetRevision: "r1", coverage: { maximumTier: "transact", actions: ["cancel-refund"] }, components, model, suite: qualifications.put(JSON.stringify(suite)), report: qualifications.put(JSON.stringify(report)), calibration: null,
    provenance: { kind: "synthetic", owner: "qa", sampling: "development", source: "test-fixture", independentReview: null } });
  const directory = join(root, "authority"), authority = new AuthorityStore(directory, qualifications);
  const actor: CaseworkPrincipal = { tenant: "shop-a", id: "alice", roles: ["reviewer", "deployer", "operator"] };
  const current = { targetRevision: "r1", components, model }, now = new Date("2026-11-03T12:00:00Z");
  const request: GrantRequest = { packageDigest: p.digest, scope: "synthetic", tier: "transact", limits: { actions: ["cancel-refund"], maxAmountMinor: 34000, currency: "EUR" }, expiresAt: "2026-11-03T13:00:00Z", acceptsMutableModel: true };
  const operation = { tenant: "shop-a", intent: "refund", scope: "synthetic" as const, action: "cancel-refund", amountMinor: 34000, currency: "EUR" };
  return { root, directory, qualifications, authority, actor, current, now, request, operation };
}
