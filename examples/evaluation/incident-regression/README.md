# An incident becomes a regression case

Build ai-audit, then select an existing request, decision or refusal ID from your log:

```sh
npm run build
node scripts/incident-regression.mjs /path/to/audit.jsonl RECORD_ID examples/evaluation/incident-regression/fixture.json examples/evaluation/incident-regression/expectations.json /tmp/refund-regression
```

The fixture is deliberately wrong synthetic output: 342 EUR rather than 340 EUR. Replace it with your explicitly sanitized input and observed output. Review the independent expectations yourself. `sanitized: true` is your confirmation, not an automatic privacy guarantee. Do not put customer data or credentials in committed fixtures.

Run IntentGauge separately (replace its checkout path):

```sh
node /path/to/evalLOL/dist/src/cli.js validate /tmp/refund-regression/suite.json
node /path/to/evalLOL/dist/src/cli.js run /tmp/refund-regression/suite.json --replay /tmp/refund-regression/observations.json --out /tmp/refund-failing-run
```

The second command must exit 1 for the wrong amount. For a negative-control demonstration, make a separate copy of observations.json and change 342 EUR to 340 EUR; replay that file into a new output directory and expect exit 0. Editing recorded output only proves the check detects this difference. It does not prove an application fix.

To verify an actual fix, use IntentGauge's `--module` target interface to rerun your application against the exported suite. The target receives case input without expected assertions. Supply booking and policy fixtures through a target-specific adapter; the small sample input alone does not reconstruct the application state. The existing IntentGauge CityWheels adapter is the starting point for that integration.

`provenance.json` binds the selected audit record hash, fixture and expectations. It does not copy log payloads, prove the supplied fixture matches the incident, authenticate the log independently, or prove QDL replay. The original log is left unchanged. Existing output directories are refused.

Exporter checks:

```sh
node --test scripts/incident-regression.test.mjs
```
