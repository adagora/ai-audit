import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCaseworkEconomics, type EconomicsDataset, type HandlingObservation } from "../src/caseworkEconomics.js";
import { COST_KINDS } from "../src/casework.js";
function observation(model: number, rework = 0): HandlingObservation {
  return { predictedIntent: "refund", outcome: "resolved", criticalFailure: false, costs: COST_KINDS.map((kind) => ({ kind, amountMinor: kind === "model" ? model : kind === "rework" ? rework : 0, basis: "measured", reference: "test-measurement" })) };
}
function fixture(): EconomicsDataset {
  return { schemaVersion: 1, owner: "qa", currency: "EUR", downstreamHarmExcludesClassification: true, trafficWeights: { refund: 1 }, mistakeCosts: { refund: { helpdesk: 5000 } }, maxCriticalFailureRate: { refund: 0 }, samples: [0, 1].map((n) => ({ family: `independent-${n}`, intent: "refund", truthReference: "independent-test-truth", sourceReference: "test-only", kind: "representative", sampling: "random", human: observation(100), candidate: observation(1, 200) })) };
}
test("cheap model loses after measured rework; paired uncertainty and sample counts stay explicit", () => {
  const result = analyzeCaseworkEconomics(fixture());
  assert.equal(result.comparisonSupported, true);
  assert.equal(result.weighted.humanMeanMinor, 100);
  assert.equal(result.weighted.candidateMeanMinor, 201);
  assert.equal(result.weighted.candidateMinusHumanMinor, 101);
  assert.equal(result.weighted.lowerObservedCost, "human");
  assert.equal(result.weighted.pairedStandardErrorMinor, 0);
  assert.equal(result.provenance.representativeRandomPairs, 2);
});
test("missing, estimated, unfinished and overflowing cost evidence cannot appear as measured zero", () => {
  for (const change of [
    (d: EconomicsDataset) => { d.samples[0].candidate.costs.pop(); },
    (d: EconomicsDataset) => { d.samples[0].human.outcome = "reopened"; },
    (d: EconomicsDataset) => { d.samples[0].candidate.costs[0].amountMinor = Number.MAX_SAFE_INTEGER; }
  ]) {
    const d = fixture(); change(d); const result = analyzeCaseworkEconomics(d);
    assert.equal(result.comparisonSupported, false);
    assert.equal(result.weighted.candidateMeanMinor, null);
    assert.equal(result.weighted.lowerObservedCost, null);
  }
  const estimated = fixture(); estimated.samples[0].candidate.costs[0].basis = "estimate";
  const result = analyzeCaseworkEconomics(estimated);
  assert.equal(result.weighted.candidateMeanMinor, 201);
  assert.equal(result.comparisonSupported, false);
  assert.equal(result.slices[0].measuredPairs, 1);
  assert.ok(result.reasons.includes("estimated-costs:refund"));
});
test("equal accuracy can carry different weighted mistake loss, with unpriced errors unknown", () => {
  const low = fixture(); low.samples[0].candidate.predictedIntent = "helpdesk";
  low.mistakeCosts.refund.helpdesk = 10;
  const high = structuredClone(low); high.mistakeCosts.refund.helpdesk = 10000;
  assert.equal(analyzeCaseworkEconomics(high).weighted.candidateMeanMinor, 5201);
  assert.equal(analyzeCaseworkEconomics(low).weighted.candidateMeanMinor, 206);
  delete low.mistakeCosts.refund.helpdesk;
  assert.equal(analyzeCaseworkEconomics(low).weighted.candidateMeanMinor, null);
});
test("risk-selected and synthetic samples cannot inflate representative prevalence or evade hard limits", () => {
  const d = fixture();
  d.samples.push({ ...structuredClone(d.samples[0]), family: "risky", sampling: "risk-selected" });
  d.samples[2].candidate.criticalFailure = true;
  const result = analyzeCaseworkEconomics(d);
  assert.equal(result.provenance.diagnosticPairs, 1);
  assert.equal(result.slices[0].pairs, 2);
  assert.equal(result.slices[0].criticalRate, 0);
  assert.equal(result.slices[0].hardLimitBreached, true);
  assert.equal(result.weighted.lowerObservedCost, null);
  const synthetic = fixture(); synthetic.samples.forEach((s) => { s.kind = "synthetic"; s.sampling = "development"; });
  assert.equal(analyzeCaseworkEconomics(synthetic).weighted.candidateMeanMinor, null);
  const repeated = fixture(); repeated.samples[1].family = repeated.samples[0].family;
  assert.throws(() => analyzeCaseworkEconomics(repeated), /repeated_source_family/);
});
test("external intent traffic weights control mixture cost instead of sample frequencies", () => {
  const d = fixture();
  d.trafficWeights = { refund: .1, helpdesk: .9 }; d.maxCriticalFailureRate.helpdesk = 0;
  for (const n of [0, 1]) {
    const sample = structuredClone(d.samples[0]); sample.family = `helpdesk-${n}`; sample.intent = "helpdesk";
    sample.human = observation(50); sample.candidate = observation(5);
    sample.human.predictedIntent = "helpdesk"; sample.candidate.predictedIntent = "helpdesk"; d.samples.push(sample);
  }
  const result = analyzeCaseworkEconomics(d);
  assert.equal(result.weighted.humanMeanMinor, 55);
  assert.equal(result.weighted.candidateMeanMinor, 24.6);
  assert.equal(result.weighted.lowerObservedCost, "candidate");
  d.trafficWeights.refund = .2;
  assert.throws(() => analyzeCaseworkEconomics(d), /invalid_weights/);
});

test("paired standard error uses independent differences and is unknown for one pair", () => {
  const d = fixture(); d.samples[1].candidate.costs.find((c) => c.kind === "rework")!.amountMinor += 20;
  assert.equal(analyzeCaseworkEconomics(d).weighted.pairedStandardErrorMinor, 10);
  d.samples.pop(); const result = analyzeCaseworkEconomics(d);
  assert.equal(result.weighted.pairedStandardErrorMinor, null);
  assert.equal(result.comparisonSupported, false);
});
