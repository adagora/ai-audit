# 67. ai-audit holds no help-desk application, and IntentGauge evaluates the Python one
Status: Accepted (2026-11-05). Supersedes [0066](0066-help-desk-repository-and-temporal-write-intents.md). Narrows [0060](0060-evaluation-evidence-and-isolated-workers.md), [0062](0062-casework-application-boundary.md) and [0063](0063-synthetic-execution-and-reconciliation.md).

## Context
ADR 0066 kept a synthetic JavaScript help desk in `examples/citywheels/` beside the Python application in `help-desk-agent`: executor, read context, workbench, scripts and tests. Two executors existed and rounded a half rental differently. The Python application now carries the casework rules and the Temporal workflow, and nothing outside the example used the example.

## Decision
**One application.** The help desk is `help-desk-agent`, in Python. ai-audit contains no help-desk application, executor, workbench or fixtures. The removed folder is kept at git tag `helpdesk-workbench-archive`.

**Generic modules.** Authority, qualification, case, learning, regression, economics and monitoring modules stay in `src/`. They have no operator interface here; a host application supplies its own, and tests in `test/` exercise them with fake hosts. `test/domainFree.test.ts` still enforces that `src/` and `scripts/` hold no help-desk terms.

**Evaluation.** IntentGauge remains a separate engine (0060, 0064). Its CityWheels target runs the Python application in a bridge process on a temporary copy of its data. Proxy and decision evidence are optional. Without them the target reports `not-recorded` and invents nothing.

**Links.** Unchanged from 0066. The application reaches ai-audit through the proxy base URL and the `decide`, `approve` and `effect` commands, and keeps its own grants until `AuthorityStore` has a command-line surface. Temporal stays in the application repository. ai-audit CI needs no sibling checkout, and a test that needs one is skipped when it is absent.

## Consequences
The cockpit, learning, monitoring, economics and qualification screens that ran from the example are not runnable from this repository. The documents say so and point to the tag. 0061 to 0065 keep describing the modules in `src/`, not those screens.

The Python `refund_for_booking` rounds half up and the QDL policy `policies/refund.json` does not round. For a rental price with an odd cent in the 24 to 48 hour band, `decide` and the application disagree and the case stops as `rule_disagreement` before any write. Nothing is paid wrongly. The fixture prices are even, so it has not occurred. Real prices need either a rounding step in the policy or a comparison within half a cent.
