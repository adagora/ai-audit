# 66. The help desk is its own repository, Temporal runs its write intents, and domain code stays out of `src/`
Status: Accepted (2026-11-05). Extends [0062](0062-casework-application-boundary.md) and [0063](0063-synthetic-execution-and-reconciliation.md), and decides the Temporal placement that 0062 left as a proposal.

## Context
Commit 77e2952 put the synthetic CityWheels executor and read context in `src/`, 21 help-desk scripts in `scripts/`, and made `src/casework.ts` depend on the CityWheels context. `src/` was meant to stay free of any one industry. CI failed on `main` because two tests needed sibling checkouts that CI does not have.

A first Temporal workflow in the `help-desk-agent` checkout passed its nine tests, but failure runs showed a refund reported as missing while the ledger held it, a failed workflow after a transient read-back error, and an approval wait that ended after 60 seconds. It also duplicated the refund rule and used neither the agent nor ai-audit.

The Counting House essay asks for one saga definition per write-intent type and a mechanical orchestrator around the engine. It scopes that weight to large casework volumes and accepts a hosted engine for a first handful of intents.

## Decision
**Domain code.** `src/` and `scripts/` hold no help-desk terms, and `test/domainFree.test.ts` enforces it. Authority, qualification, case, learning, regression, economics and monitoring modules stay in `src/` because they serve any casework. A host supplies its currency and context rules through `CaseworkOptions`.

**Synthetic example.** `examples/citywheels/` holds the whole JavaScript integration: application, workbench, executor, context, scripts and tests. It is one folder that can leave the repository as one folder. It is not the production help desk.

**Application.** The help desk is the separate `help-desk-agent` repository, in Python. Its `citywheels/` package stays the agent and the only money rule. A model issues a write intent and never writes.

**Durable execution.** Temporal runs one workflow per write-intent type in that repository. Question answering stays out of Temporal. ai-audit gains no Temporal dependency and no saga runtime, and its CI does not need that repository.

**Links.** The application reaches ai-audit in two optional ways: model traffic through the proxy base URL, and evidence through the `decide`, `approve` and `effect` commands. Without them, the application reports evidence as `not-recorded` and never invents it. The application keeps its own grant store until `AuthorityStore` has a command-line surface.

**Tests.** A test that needs a sibling checkout is skipped when the sibling is absent.

## Consequences
0062 and 0063 stay in force, and the executor they describe now lives in `examples/citywheels/src/`. Two executors exist on purpose: the JavaScript one is the synthetic conformance path, the Python one is the application. They round a half rental differently, down in JavaScript and half up in Python, which is accepted while both run only on synthetic data. The generic casework modules have no caller outside that example until an application needs them through a CLI. Real identity, channels, payment credentials and operational approval remain later work.
