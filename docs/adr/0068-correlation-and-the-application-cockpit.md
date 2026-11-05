# 68. Records carry an optional correlation id, and the operator cockpit lives in the application
Status: Accepted (2026-11-05). Extends [0067](0067-no-help-desk-application-in-ai-audit.md) and [0007](0007-log-stores-no-values.md).

## Context
One customer case leaves three traces that nothing joins: the proxied model calls, the QDL decision with its review and effect, and the application's own case. In a real log the six model calls carried no use case and the decision named no case, so an operator could not go from a case to its conversation, decision and refund. A UX audit of the management surfaces also found no single place that says what needs a human.

## Decision
**Correlation id.** The proxy reads the header `x-audit-correlation` and stores it on the `llm-call` record. `decide` takes `--correlation` and stores it on the decision record. A value must match `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. The proxy drops any other value and does not forward the header. `decide` refuses it with `audit_invalid_correlation` and writes nothing. The id is an identifier the application chooses, never customer content, and it is never a metric label (0019).

**Join.** An application sends one id per conversation on its model calls and gives the same id to the case it opens, so a reader can list the calls and the decision of one case by that id. `review` and `effect` records reach the id through their decision.

**Cockpit.** The operator cockpit is part of the application, not of ai-audit. The application owns identity, consent and human queues (0066, 0067). The cockpit reads Temporal, the application's own stores, this log and IntentGauge reports, and writes only through the application's gateway. The ai-audit console and the IntentGauge dashboard stay the detail views it links to.

## Consequences
The log format gains one optional field on two record kinds. Old records and applications that send no id keep working. The field is covered by the record hash like any other. The cockpit and the application's other write paths stay outside this repository, and ai-audit gains no dependency on Temporal or on the application.
