# 60. Evaluations use isolated workers and separately retained evidence
Status: Accepted. Consolidated 2026-11-04 from the unpublished evaluation/workbench decisions at the user's request. Extends 0007, 0038 and 0043.

## Context
Metadata audit logs cannot reconstruct a customer conversation, and a replayed answer does not prove business correctness. Evaluating applications requires independent expectations, isolated fixtures and durable source references without coupling evaluation to proxy forwarding.

## Decision
IntentGauge remains a separate evaluation engine. Application workers receive case input without expected assertions, execute the actual application against private fixture copies, and return observations plus available evidence. The Python and JavaScript applications remain distinct targets. Scripted results do not establish live-model quality; live calls require explicit mode and server-held credentials.

Incident exports require an explicitly supplied sanitized fixture, independent expectations and a chain-verified source record. Provenance binds their hashes without claiming the proxy captured the fixture, the assertions are correct or the log has independently authenticated origin. Recorded-output replay tests assertions; actual application reruns test behavior.

Retain inputs, fixture revisions, observations, manifests, events, reports, policies and available audit/receipt artifacts in private ignored storage. Failed and interrupted runs remain inspectable; completion is never inferred from partial output. Provider/client secrets are not retained. Evaluation results never enter runtime audit chains.

An optional authenticated loopback workbench exposes only its synthetic experiment artifacts. Draft compilation and passing scores remain development evidence, never approval or transaction permission. Business outcomes and runtime-integrity checks are reported separately; missing Python proxy evidence stays explicit.

## Consequences
Applications and the proxy remain independently usable. Experiments need privacy and retention rules before customer data is introduced. Retention, comparisons, provider flags and UI operation are documented in [the workbench guide](../../examples/citywheels/workbench/README.md); they do not need separate ADRs.
