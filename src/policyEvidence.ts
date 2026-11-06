import { fields, refuse, POLICY_LIMITS, type PolicyJson } from "./policyValue.js";

const kinds = ["observation", "testimony", "inference"];
const text = (value: unknown, max = 120) => typeof value === "string" && value.length > 0 && value.trim().length > 0 && value.length <= max;
const natural = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function validateEvidenceRecords(value: unknown, path: string): asserts value is Record<string, PolicyJson>[] {
  refuse(Array.isArray(value) && value.length <= POLICY_LIMITS.evidenceRecords, "policy_evidence", path);
  const ids = new Set<string>();
  for (const [i, raw] of (value as PolicyJson[]).entries()) {
    const record: unknown = raw;
    const at = `${path}[${i}]`;
    fields(record, ["id", "source", "claim", "value", "kind", "observedAt", "revision"], [], at);
    refuse(text(record.id, 64) && !ids.has(record.id) && text(record.source) && text(record.claim), "policy_evidence", at);
    refuse((record.value === null || typeof record.value === "boolean") && kinds.includes(record.kind), "policy_evidence", at);
    refuse(natural(record.observedAt) && natural(record.revision), "policy_evidence", at);
    ids.add(record.id);
  }
}

export function validateEvidenceClock(value: unknown, path: string): asserts value is Record<string, number> {
  fields(value, ["now"], [], path);
  refuse(natural(value.now), "policy_evidence_clock", path);
}

export function validateEvidenceParameters(value: unknown, path: string): { allowedKinds: string[]; allowedSources: string[]; maxAge: number; minRevision: number } {
  fields(value, ["allowedKinds", "allowedSources", "maxAge", "minRevision"], [], path);
  refuse(Array.isArray(value.allowedKinds) && value.allowedKinds.length > 0 && value.allowedKinds.length <= kinds.length
    && value.allowedKinds.every((kind: unknown) => typeof kind === "string" && kinds.includes(kind))
    && new Set(value.allowedKinds).size === value.allowedKinds.length, "policy_evidence_parameters", path);
  refuse(Array.isArray(value.allowedSources) && value.allowedSources.length > 0 && value.allowedSources.length <= POLICY_LIMITS.evidenceRecords
    && value.allowedSources.every((source: unknown) => text(source))
    && new Set(value.allowedSources).size === value.allowedSources.length, "policy_evidence_parameters", path);
  refuse(natural(value.maxAge) && natural(value.minRevision), "policy_evidence_parameters", path);
  return { allowedKinds: value.allowedKinds, allowedSources: value.allowedSources, maxAge: value.maxAge, minRevision: value.minRevision };
}

export function evaluateEvidence(records: PolicyJson, claim: PolicyJson, clock: PolicyJson, parameters: unknown): PolicyJson {
  validateEvidenceRecords(records, "$.evidence");
  validateEvidenceClock(clock, "$.clock");
  const params = validateEvidenceParameters(parameters, "$.params");
  refuse(text(claim), "policy_evidence_claim");
  const used: Record<string, PolicyJson>[] = [], skipped: PolicyJson[] = [];
  const sources = new Map<string, { support: boolean; refute: boolean }>();
  for (const record of records) {
    const reason = record.claim !== claim ? "claim"
      : !params.allowedSources.includes(record.source as string) ? "source"
      : !params.allowedKinds.includes(record.kind as string) ? "kind"
      : record.value === null ? "unknown"
      : (record.observedAt as number) > clock.now ? "future"
      : clock.now - (record.observedAt as number) > params.maxAge ? "stale"
      : (record.revision as number) < params.minRevision ? "revision" : undefined;
    if (reason) { skipped.push({ record, reason }); continue; }
    used.push(record);
    const source = record.source as string;
    const votes = sources.get(source) ?? { support: false, refute: false };
    if (record.value === true) votes.support = true;
    else votes.refute = true;
    sources.set(source, votes);
  }
  const votes = [...sources.values()];
  const support = votes.filter((v) => v.support).length, refute = votes.filter((v) => v.refute).length;
  const sourceConflicts = [...sources].filter(([, v]) => v.support && v.refute).map(([source]) => source);
  const state = support && refute ? "conflict" : support ? "supported" : refute ? "refuted" : "unknown";
  return { state, support, refute, sources: sources.size, sourceConflicts, used, skipped };
}

export function evidenceAllows(value: unknown, minSources: PolicyJson): boolean {
  fields(value, ["state", "support", "refute", "sources", "sourceConflicts", "used", "skipped"]);
  refuse(typeof minSources === "number" && Number.isSafeInteger(minSources) && minSources >= 1 && minSources <= POLICY_LIMITS.evidenceRecords, "policy_evidence_parameters");
  return value.state === "supported" && typeof value.support === "number" && value.support >= (minSources as number)
    && value.refute === 0 && Array.isArray(value.sourceConflicts) && value.sourceConflicts.length === 0;
}
