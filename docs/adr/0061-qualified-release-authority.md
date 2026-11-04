# 61. Authority binds a qualified release and requires separate approval and activation
Status: Accepted. Consolidated 2026-11-04 from the unpublished qualification/authority decisions at the user's request. Extends 0038, 0053 and 0060.

## Context
A passing report does not identify a deployed application's dependencies, establish representative quality or authorize a business operation. Evaluating replies cannot justify granting payment authority.

## Decision
Optional qualification packages bind immutable content snapshots, application/dependency/prompt/tool/SOP/policy/gateway identities, dataset and rubric identities, evaluator/judge identities and exact report/calibration bytes. Paths are root-relative regular files; snapshots do not follow symlinks or discover credentials/traffic. Capture coverage is the application's responsibility. Provider model identity explicitly records unknown or mutable revisions.

Inspection verifies integrity, report/dataset/target linkage, missing evidence and applicability to a trusted current release. Representative sampling and independent human review remain accountable provenance claims. Integrity, origin, correctness and approval are distinct claims. QDL stays optional; evaluation stays outside forwarding.

A separate authority store records explicit reviewer approval, deployment activation, expiry and revocation. Grants bind tenant, intent, qualified package, synthetic/production scope, autonomy tier, permitted actions, money limits, owner/reviewer and human fallback. Trusted application configuration supplies current release and authenticated principal; request headers and model proposals cannot select authority.

Every authorization rechecks release, grant, scope, action, limits, expiry and revocation. Production permission cannot exceed the package's declared tier/actions, and synthetic evidence cannot qualify production. Mutable models require explicit acceptance. A new package or passing report never activates permission by itself.

Local state uses exclusive locks and fsynced atomic replacement. Live locks are never stolen by age; dead-process recovery is explicit and host/PID checked. Busy/corrupt state and clock regression fail closed. This is a single-host contract, not distributed consensus.

## Consequences
Changed bound artifacts invalidate applicability. Revocation stops new covered actions; in-flight effects still need reconciliation. Protecting the store and configuring real identity/operational review remain deployment responsibilities. [Qualification](../qualification.md) and [casework operation](../casework.md) document the implementation.
