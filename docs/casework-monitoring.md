# Monitoring, restriction and recovery

The local cockpit uses ADR 0065 to connect retained evidence to owned operational reviews. It never treats a score or alert as permission. Monitoring data stays outside the runtime audit chain.

Before activating a grant, a reviewer records a plan for its intent. The plan names an incident owner, human fallback owner, declared capacity, maximum pending queue, response deadline, observation window, signal thresholds and expiry. The plan must remain valid through the grant's expiry. The fallback queue must fit both the declared maximum and the capacity available within the response deadline. These are accountable declarations; the software does not manufacture a staffing measurement. The cockpit accepts synthetic plans only. Library integrations with production scope must provide explicitly measured capacity and install the operational activation gate at their own deployment boundary.

Signals include failed evaluations, independently published human failures, complaints, reopenings, rejected answers, delivery holds and uncertain execution. Expired grants, changed releases, expired plans and overloaded fallback each alert at their first observation. Other thresholds count distinct cases inside the observation window. Repeated attempts on one case do not become independent samples. Older outcome records without explicit event-state metadata use current-state observations, labeled with their observation time rather than an invented historical event time.

The workbench scans every thirty seconds while its server is running and scans on operator refresh. The monitoring page shows the last successful scan. A stopped server does not provide monitoring; deployment owners must supply a continuously running host and respond to scan-failure events. Counts describe retained evidence, not representative population prevalence.

An alert contains its original signal, evidence links, affected intent, package and grant, owner, deadline and proposed human fallback. Scanning does not revoke anything. The reviewer must explicitly record a reason to restrict the affected grant. That review is persisted before revocation, so a lock failure or crash leaves a retryable pending restriction. Retrying the same review causes one revocation. The executor's uncertain writes still need read-back; revocation does not reverse a settled refund or claim a customer handoff has been accepted.

Recovery is a separate review. It requires an applicable passing package whose evaluation report ran after the latest signal, a current fallback plan and enough declared capacity. Repackaging an old report cannot qualify recovery. Quality incidents also require actual passing reruns of independently reviewed regressions for each affected source case, against the candidate release. The original case, regression, rerun report, new qualification and reviewer remain linked. Newly observed evidence before recovery activation invalidates that recovery review and preserves it in history.

A recovered incident permits a separately approved grant to activate for its reviewed package. The old grant remains revoked. Later replacement grants must still have evaluation evidence newer than the incident. Recovering an incident does not mark its customer cases resolved or confirm an uncertain business outcome. Operators use the existing owned case handoff and executor reconciliation workflows for those steps.

The authenticated API exposes:

- `GET /api/casework/monitoring`: plans, incidents and scan time for the operator's tenant.
- `POST /api/casework/monitoring/plans`: reviewer-only synthetic plan configuration.
- `POST /api/casework/monitoring/scan`: scan retained host observations; request fields are refused.
- `POST /api/casework/monitoring/incidents/ID/restrict`: reviewer-only restriction, with `rationale`.
- `POST /api/casework/monitoring/incidents/ID/recover`: reviewer-only recovery, with `packageDigest` and `rationale`.

Customer credentials cannot read monitoring data. A different tenant cannot inspect or restrict an incident. Neither the request body nor a header selects tenant or role. External report origin, human independence, representative sampling and real fallback availability remain separate trust claims; hashes bind retained artifacts without proving those claims.
