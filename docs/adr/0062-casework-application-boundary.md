# 62. The casework application owns customer work outside the inference proxy
Status: Accepted. Consolidated 2026-11-04 from the unpublished application/casework decisions at the user's request. Extends 0004, 0007, 0053, 0060 and 0061.

## Context
A proxy sees model traffic but cannot prove booking ownership, enforce actual customer delivery or own a multi-day business case. Embedding domain workflows and write credentials would compromise its independent role.

## Decision
Keep help-desk domain logic, authenticated customer intake, scoped reads, customer consent, channel delivery and business execution in an independent application. Python remains an application target; JavaScript CityWheels is a synthetic integration example. ai-audit supplies optional authority/evidence libraries and operator inspection. IntentGauge remains separate. Do not build a general workflow engine in the proxy.

Application adapters use opaque tenant-scoped case references and real observation links. Principals, roles, tenant and customer scope come from host authentication, never request JSON. Retained customer content has its own governed store; runtime logs stay content-minimal. The loopback cockpit is a synthetic workspace, not a production multi-tenant identity service.

A read-only question snapshot contains only the authenticated customer's selected booking, backend source/version, business/read times, expiry and pinned knowledge identity/validity. Customer claims remain unverified input. Operational observations are explicitly unevaluated and link prior release qualification separately; no passing evaluation or uniform proxy trail is invented.

Delivery enforces the active release grant: shadow never sends, assist needs exact-answer review, rejected answers never send. Recheck booking/context freshness and knowledge applicability before delivery. Separate generated text, dispatch, delivery and verified business outcome. Synthetic outbox writes are idempotent; real channels need durable idempotency and read-back.

Cases preserve assignments, accepted/resolved handoffs, reviews, outcomes, reopening, costs and evidence links across restart. A model response does not resolve a case. Broad economic formulas, UI views and adapter wiring belong in ordinary documentation.

## Consequences
A customer cannot inspect another tenant/customer's case. Business credentials and durable workflow ownership remain outside proxy forwarding. The proposed production placement, including Temporal, is described in [the help-desk architecture proposal](../helpdesk-architecture.md); it is not a claim that the synthetic local stores are production orchestration.
