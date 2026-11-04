# CityWheels: one case from question to evidence

CityWheels is a synthetic bike-rental integration example. It demonstrates scoped reads, deterministic refund quotes, independent evaluation, reviewed authority and fake execution/reconciliation. It is not the production home of a help-desk service; see [the architecture proposal](../../docs/helpdesk-architecture.md).

For one offline question, build ai-audit and run:

```sh
npm run build
node examples/citywheels/run.mjs ask "What is my refund if I cancel CW-1002?"
```

The wrapper runs the actual agent, local scripted provider and proxy, prints the quote and retains its evidence. No API key or paid call is needed. It does not mark a simulated proposal as a completed business effect.

For the full interactive example, build the separate IntentGauge checkout and start:

```sh
npm --prefix ../evalLOL run build
npm run example:helpdesk
```

The server prints separate operator, customer and independent-reviewer URLs. [The workbench guide](workbench/README.md) covers the question/evaluation loop. [Casework](../../docs/casework.md), [independent review](../../docs/casework-learning.md) and [monitoring](../../docs/casework-monitoring.md) describe the synthetic operator journeys.

The business set and separate ambiguity/abstention set retain actual failures. Synthetic agent failures are not relabeled as green qualifications. Conflicting document fixtures remain isolated and are shown to independent reviewers. Customer delivery, staff handoff, transaction consent, execution and settlement are separate states.

Compare the existing applications with `node scripts/compare-helpdesks.mjs`. To hold the Python application, prompt, model path, tool schema, proxy and fixtures fixed while changing its refund tool implementation, use `node scripts/compare-components.mjs`. Both default to scripted providers and retained development evidence. The changed component includes the refund implementation and result adapter. Missing or mismatched telemetry invalidates the comparison; a requested model name cannot prove an immutable provider deployment. These experiments do not activate production authority.

Explicit live calls require `--live` and a server environment key. For the single-question wrapper, use `node --env-file=.env examples/citywheels/run.mjs ask "QUESTION" --live --model MODEL`. Customer fixtures and answers are retained under ignored `live/`; do not supply real customer content without a defined privacy/retention policy.

The JavaScript application and [fixtures](data/README.md) remain here as integration contracts. The separate Python application remains an independent target. Historical local runs and the superseded standalone evaluator were moved to ignored `live/archive/citywheels-before-curation/`; they are not current quality evidence.
