# 73. Native policies classify fresh and contradictory evidence
Status: Accepted (2026-11-06). Extends the native language of [0070](0070-native-policy-runtime.md) and [0071](0071-native-only-development-reset.md).

## Context
Typed arithmetic cannot establish whether a supplied assertion is still current or conflicts with another source. Input basis labels are caller assertions. A replayable policy needs explicit observations and a recorded clock, rather than an ambient time lookup or a model deciding which contradictory fact to ignore.

## Decision
- Add native policy version 2 under registry `auditline-policy-2`; retain existing scalar version 1 policies unchanged. Version 2 adds exact `evidence` and `evidenceClock` input types, `evidenceFresh`, and `evidenceAllows`.
- Evidence is at most 128 records, each with exact fields `id,source,claim,value,kind,observedAt,revision`. IDs are unique; value is Boolean or null, kind is observation/testimony/inference, and time/revision values are nonnegative safe integers. The clock is exactly `{now}`, supplied and retained as input.
- `evidenceFresh` takes records, a claim string and the clock. Immutable policy parameters fix allowed sources/kinds, `maxAge` and `minRevision`; a request cannot relax those limits. Skip precedence is claim, source, kind, unknown, future, stale, revision. Age and minimum revision are inclusive boundaries. No source authentication or implicit clock is inferred.
- Return used records, skipped records with reasons, distinct-source support/refutation counts, source conflicts, and state unknown/supported/refuted/conflict. Count each source once per polarity. Preserve contradictions from the same source and across sources; never pick a convenient latest value or majority automatically.
- `evidenceAllows` takes only a derived evidence result and an explicit positive `minSources`. It returns true only for supported evidence meeting the threshold. Unknown, stale-only, refuted and conflicting evidence cannot allow the action. Actions remain simulated data; the application owns authorized execution.
- Apply existing byte, depth, value, node and trace limits to all inputs, intermediate results and outputs. Malformed records refuse before evaluation. Oversized computed evidence/trace fails without partial outputs.

## Consequences
Freshness means fresh relative to the decision's recorded clock, not still fresh when a receipt is opened later. Source labels and clocks require authenticated collection by the host application. A passing evidence rule proves consistency with supplied observations and policy, not factual truth or independence of named sources.
