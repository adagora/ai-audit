# Where the help desk belongs

The help desk is the separate [help-desk-agent](https://github.com/adagora/help-desk-agent) repository. Its `docs/architecture.md` holds the application design: the agent, the Temporal workflow, the executor rules and the order of work. [ADR 0066](adr/0066-help-desk-repository-and-temporal-write-intents.md) records the decision.

| Component | Owns |
|---|---|
| help-desk-agent | Customer channels, identity, consent, human queues, booking and payment adapters, durable case progress on Temporal |
| ai-audit | Model-traffic protection, decision and effect evidence, qualification and authority modules, the operator console |
| IntentGauge | Independent evaluation, labels and calibration. It does not activate grants |
| `examples/citywheels/` | The synthetic JavaScript integration and its workbench. Not a production help desk |

ai-audit does not depend on Temporal or on the help-desk repository. The application reaches ai-audit through the proxy base URL and the `decide`, `approve` and `effect` commands.
