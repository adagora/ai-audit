# Examples

Start with the question you want to investigate. Examples use synthetic data; live provider calls are always explicit and can be billable.

| Example | What it demonstrates | Start |
|---|---|---|
| [Workflow](workflow/README.md) | Runtime controls, decisions and the operator console | `npm run example:workflow` |
| [Monitoring](monitoring/README.md) | Proxy metrics, traffic scenarios and Grafana | Follow the Compose guide |
| [Quote evaluation](evaluation/README.md) | A reproducible rule against labeled cases | `npm run example:evaluate` |
| [Prompt-injection evaluation](injection-evaluation/README.md) | Advisory detection with attack and ordinary-text controls | `npm run example:injection` |
| [Toolroom quotes](quineling-wycena/README.md) | A larger domain rule and human verdict/action flow | `npm run example:wycena -- --console` |
| [Context map](context-map/README.md) | Context composition and prefix/cache changes | `node examples/context-map/generate.mjs` |

[Incident export](evaluation/incident-regression/README.md) and the policy comparison lab live under evaluation. The [multi-process live-mail walkthrough](quineling-wycena/live-mail/README.md) extends the toolroom example rather than introducing another top-level application. Test-only floor-quote data is in `test/fixtures/floor-quote.json`.

The help-desk application is the separate [help-desk-agent](../docs/helpdesk-architecture.md) repository, which runs write intents on Temporal. ai-audit provides controls and evidence, and IntentGauge provides independent evaluation. The local examples do not assert that a production deployment or real-payment integration exists.

The four `example:*` package commands are the supported starting points. Specialized policy comparisons, live workflow launch, browser smoke checks and showcase export remain documented direct commands in their respective guides.
