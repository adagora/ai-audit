import { COST_KINDS, type CostKind } from "./casework.js";
import { evidenceDigest } from "./qualification.js";

export interface HandlingObservation {
  predictedIntent: string | null;
  outcome: "resolved" | "failed" | "unresolved" | "reopened" | "disputed" | null;
  criticalFailure: boolean | null;
  costs: { kind: CostKind; amountMinor: number; basis: "measured" | "estimate"; reference: string }[];
}
export interface EconomicsSample {
  family: string; intent: string; truthReference: string; sourceReference: string;
  kind: "representative" | "synthetic"; sampling: "random" | "risk-selected" | "development";
  human: HandlingObservation; candidate: HandlingObservation;
}
export interface EconomicsDataset {
  schemaVersion: 1; owner: string; currency: string; downstreamHarmExcludesClassification: true;
  trafficWeights: Record<string, number>; mistakeCosts: Record<string, Record<string, number>>;
  maxCriticalFailureRate: Record<string, number>; samples: EconomicsSample[];
}
const named = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 1000;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fail = (code: string): never => { throw new Error(`audit_economics_${code}`); };
const sumMoney = (values: number[]): number | null => { let sum = 0; for (const value of values) { sum += value; if (!Number.isSafeInteger(sum)) return null; } return sum; };
const final = (o: HandlingObservation) => o.outcome === "resolved" || o.outcome === "failed";
function validateObservation(o: HandlingObservation) {
  if (!o || !(o.predictedIntent === null || named(o.predictedIntent)) || ![null, "resolved", "failed", "unresolved", "reopened", "disputed"].includes(o.outcome)
    || !(o.criticalFailure === null || typeof o.criticalFailure === "boolean") || !Array.isArray(o.costs)
    || o.costs.some((c) => !c || !COST_KINDS.includes(c.kind) || !Number.isSafeInteger(c.amountMinor) || c.amountMinor < 0 || !["measured", "estimate"].includes(c.basis) || !text(c.reference)) || new Set(o.costs.map((c) => c.kind)).size !== o.costs.length) fail("invalid_observation");
}
function handling(dataset: EconomicsDataset, sample: EconomicsSample, o: HandlingObservation) {
  const classificationLoss = o.predictedIntent === null ? null : o.predictedIntent === sample.intent ? 0 : Object.hasOwn(dataset.mistakeCosts, sample.intent) && Object.hasOwn(dataset.mistakeCosts[sample.intent], o.predictedIntent) ? dataset.mistakeCosts[sample.intent][o.predictedIntent] : null;
  const complete = COST_KINDS.every((kind) => o.costs.some((c) => c.kind === kind));
  const total = complete && classificationLoss !== null && final(o) ? sumMoney([...o.costs.map((c) => c.amountMinor), classificationLoss]) : null;
  return { classificationLoss, total, measured: total !== null && o.costs.every((c) => c.basis === "measured"), final: final(o), missing: COST_KINDS.filter((kind) => !o.costs.some((c) => c.kind === kind)) };
}
function mean(values: number[]): number | null { const total = sumMoney(values); return values.length && total !== null ? total / values.length : null; }
function standardError(values: number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values); if (average === null) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1) / values.length);
}

export function analyzeCaseworkEconomics(dataset: EconomicsDataset) {
  if (!dataset || dataset.schemaVersion !== 1 || !named(dataset.owner) || !/^[A-Z]{3}$/.test(dataset.currency) || dataset.downstreamHarmExcludesClassification !== true
    || !object(dataset.trafficWeights) || !Object.keys(dataset.trafficWeights).length || !object(dataset.mistakeCosts) || !object(dataset.maxCriticalFailureRate) || !Array.isArray(dataset.samples) || !dataset.samples.length) fail("invalid_dataset");
  const weights = Object.entries(dataset.trafficWeights);
  if (weights.some(([intent, weight]) => !named(intent) || !Number.isFinite(weight) || weight <= 0 || weight > 1) || Math.abs(weights.reduce((sum, [, weight]) => sum + weight, 0) - 1) > 1e-9) fail("invalid_weights");
  for (const [intent, costs] of Object.entries(dataset.mistakeCosts)) if (!named(intent) || !object(costs) || Object.entries(costs).some(([predicted, cost]) => !named(predicted) || !Number.isSafeInteger(cost) || cost < 0 || predicted === intent && cost !== 0)) fail("invalid_mistake_costs");
  for (const [intent, limit] of Object.entries(dataset.maxCriticalFailureRate)) if (!named(intent) || !Number.isFinite(limit) || limit < 0 || limit > 1) fail("invalid_critical_limit");
  for (const sample of dataset.samples) {
    if (!sample || !named(sample.family) || !named(sample.intent) || !Object.hasOwn(dataset.trafficWeights, sample.intent) || !text(sample.truthReference) || !text(sample.sourceReference) || !["representative", "synthetic"].includes(sample.kind) || !["random", "risk-selected", "development"].includes(sample.sampling)) fail("invalid_sample");
    validateObservation(sample.human); validateObservation(sample.candidate);
  }
  if (new Set(dataset.samples.map((s) => s.family)).size !== dataset.samples.length) fail("repeated_source_family");
  const reasons: string[] = [], diagnostics = dataset.samples.filter((s) => s.kind !== "representative" || s.sampling !== "random");
  const slices = weights.map(([intent, weight]) => {
    const samples = dataset.samples.filter((s) => s.intent === intent && s.kind === "representative" && s.sampling === "random");
    const pairs = samples.map((sample) => ({ human: handling(dataset, sample, sample.human), candidate: handling(dataset, sample, sample.candidate), sample }));
    const complete = pairs.length > 0 && pairs.every((p) => p.human.total !== null && p.candidate.total !== null);
    const measured = complete && pairs.every((p) => p.human.measured && p.candidate.measured);
    const humanValues = pairs.flatMap((p) => p.human.total === null ? [] : [p.human.total]), candidateValues = pairs.flatMap((p) => p.candidate.total === null ? [] : [p.candidate.total]);
    const humanMean = complete ? mean(humanValues) : null, candidateMean = complete ? mean(candidateValues) : null;
    const difference = humanMean !== null && candidateMean !== null ? candidateMean - humanMean : null;
    const unknownHumanCritical = samples.some((s) => s.human.criticalFailure === null);
    const unknownCritical = samples.some((s) => s.candidate.criticalFailure === null), critical = samples.filter((s) => s.candidate.criticalFailure === true).length;
    const rate = samples.length && !unknownCritical ? critical / samples.length : null;
    const configuredLimit = Object.hasOwn(dataset.maxCriticalFailureRate, intent) ? dataset.maxCriticalFailureRate[intent] : null;
    const diagnosticCritical = diagnostics.filter((s) => s.intent === intent && s.candidate.criticalFailure === true).length;
    const hardLimitBreached = configuredLimit !== null && (rate !== null && rate > configuredLimit || configuredLimit === 0 && diagnosticCritical > 0);
    if (!samples.length) reasons.push(`missing-representative-samples:${intent}`);
    if (!complete) reasons.push(`incomplete-costs-outcomes-or-mistake-prices:${intent}`);
    else if (humanMean === null || candidateMean === null) reasons.push(`cost-overflow:${intent}`);
    if (complete && !measured) reasons.push(`estimated-costs:${intent}`);
    if (samples.length < 2) reasons.push(`insufficient-pairs-for-standard-error:${intent}`);
    if (configuredLimit === null) reasons.push(`missing-critical-limit:${intent}`);
    if (unknownHumanCritical) reasons.push(`unknown-human-critical-outcomes:${intent}`);
    if (unknownCritical) reasons.push(`unknown-critical-outcomes:${intent}`);
    if (hardLimitBreached) reasons.push(`critical-limit-breached:${intent}`);
    return { intent, trafficWeight: weight, pairs: pairs.length, completePairs: pairs.filter((p) => p.human.total !== null && p.candidate.total !== null).length,
      measuredPairs: pairs.filter((p) => p.human.measured && p.candidate.measured).length,
      humanMeanMinor: humanMean, candidateMeanMinor: candidateMean, candidateMinusHumanMinor: difference,
      pairedStandardErrorMinor: complete ? standardError(candidateValues.map((value, i) => value - humanValues[i])) : null,
      allCostsMeasured: measured, humanCriticalFailures: samples.filter((s) => s.human.criticalFailure === true).length, humanCriticalRate: samples.length && !unknownHumanCritical ? samples.filter((s) => s.human.criticalFailure === true).length / samples.length : null, criticalFailures: critical, criticalRate: rate, configuredCriticalLimit: configuredLimit, hardLimitBreached, diagnosticCriticalFailures: diagnosticCritical,
      resolved: { human: samples.filter((s) => s.human.outcome === "resolved").length, candidate: samples.filter((s) => s.candidate.outcome === "resolved").length },
      missing: pairs.filter((p) => p.human.total === null || p.candidate.total === null).map((p) => ({ family: p.sample.family, human: p.human, candidate: p.candidate })) };
  });
  const covered = slices.every((s) => s.humanMeanMinor !== null && s.candidateMeanMinor !== null);
  const weighted = (key: "humanMeanMinor" | "candidateMeanMinor" | "candidateMinusHumanMinor") => covered ? slices.reduce((sum, s) => sum + (s[key] ?? 0) * s.trafficWeight, 0) : null;
  const errorsKnown = slices.every((s) => s.pairedStandardErrorMinor !== null);
  const comparisonSupported = covered && reasons.length === 0;
  const delta = weighted("candidateMinusHumanMinor");
  return { format: "ai-audit-paired-economics", version: 1, datasetDigest: evidenceDigest(dataset), currency: dataset.currency, owner: dataset.owner,
    provenance: { operatorAttested: true, attestedSourceFamilies: dataset.samples.length, independenceVerified: false, representativeRandomPairs: dataset.samples.length - diagnostics.length, diagnosticPairs: diagnostics.length },
    diagnostics: diagnostics.map((sample) => ({ family: sample.family, intent: sample.intent, kind: sample.kind, sampling: sample.sampling, human: handling(dataset, sample, sample.human), candidate: handling(dataset, sample, sample.candidate) })),
    slices, reasons, comparisonSupported, weighted: { humanMeanMinor: weighted("humanMeanMinor"), candidateMeanMinor: weighted("candidateMeanMinor"), candidateMinusHumanMinor: delta,
      pairedStandardErrorMinor: errorsKnown ? Math.sqrt(slices.reduce((sum, s) => sum + (s.pairedStandardErrorMinor ?? 0) ** 2 * s.trafficWeight ** 2, 0)) : null,
      lowerObservedCost: comparisonSupported && delta !== null ? delta < 0 ? "candidate" : delta > 0 ? "human" : "equal" : null },
    note: "Paired descriptive estimates from attested samples and external traffic weights. Standard errors are not confidence bounds or causal proof. Observed critical rates do not prove population safety. No authority or routing changes follow." };
}
