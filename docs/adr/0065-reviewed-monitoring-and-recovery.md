# 65. Monitoring proposes restrictions and requires reviewed recovery
Status: Accepted. Consolidated 2026-11-04 from the unpublished monitoring decision at the user's request. Extends 0061, 0062, 0063 and 0064.

## Context
Expiry and revocation alone do not connect observed regressions to owners, safe fallback or reviewed recovery. Alerts must not silently become authority, and repackaging old evidence must not restore a restricted intent.

## Decision
A reviewer records an expiring tenant/intent/scope monitoring plan with signal thresholds, owner, response deadline and human fallback/capacity evidence. The cockpit requires a current plan and sufficient declared fallback capacity before activation; plan validity must cover the grant. Production capacity must be explicitly measured. Declarations are accountable evidence, not measurements manufactured by software.

The host derives signals from actual cases, independent published failures, executor exceptions and grant applicability/expiry. Count distinct affected cases within the observation window, not population prevalence. Stable identities deduplicate observations and owned incidents. Preserve source links and affected release/grant. Scanning never changes authority.

A reviewer may explicitly approve restriction. Persist the review before idempotently revoking the exact grant, then record completion. An interrupted restriction remains retryable. Revocation neither reverses settlement nor claims a human accepted a handoff; executor read-back and owned case handoffs remain separate.

Recovery requires a new applicable passing qualification with a report executed after the latest signal, a current fallback plan/capacity and independently reviewed successful regression reruns for affected quality cases. New evidence invalidates unconsumed recovery while preserving its history. Recovery permits separately approved activation for the reviewed package; it never revives the revoked grant. Later grants still need evidence newer than the incident.

## Consequences
This introduces reviewed restriction and recovery, not automatic cheapest-model routing or an automatic demotion engine. The application must install equivalent gates at its deployment boundary. A running scan host, real staffing and operational response remain deployment responsibilities. See [monitoring operation](../casework-monitoring.md).
