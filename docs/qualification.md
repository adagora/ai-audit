# Release qualification evidence

Run `npm run example:helpdesk`, execute a question, then open **Release qualification · evidence only** beneath the evaluation. Each intent receives a versioned package binding the retained suite, report, application files and available policy, prompt, tools, knowledge, dependency and evaluator snapshots.

The workbench captures release identities before and after execution. Changed files make the evaluated release inapplicable. Blob hashes are checked when evidence is reopened. Package files never grant permission or write to the proxy audit chain.

The JavaScript adapter snapshots built ai-audit code, application and worker, lockfile, vendored dependencies and Node version metadata. This is not an OS image. The Python adapter snapshots its application, tools, prompts, refund rules and knowledge files. Its interpreter/environment and gateway are not captured, so the inspector reports those components missing. It does not invent proxy evidence for Python.

Inspect a retained package after restarting the process:

```sh
node scripts/qualification.mjs list live/helpdesk-workbench/qualifications
node scripts/qualification.mjs inspect STORE PACKAGE_DIGEST
node scripts/qualification.mjs inspect STORE PACKAGE_DIGEST CURRENT_RELEASE.json
```

`CURRENT_RELEASE.json` has `targetRevision`, `components` and `model`, as generated in a workbench run's `release.json`. Omitting it leaves current applicability unchecked. Supplying a historical file compares to that file, not to a live deployment. The application adapter must capture the actual deployed release when using applicability as an enforcement condition.

For another application, `node scripts/qualification.mjs capture STORE SPEC.json` accepts:

```json
{
  "intent": "refund",
  "targetRevision": "the-exact-evaluator-target-revision",
  "coverage": { "maximumTier": "contain", "actions": ["deliver-answer"] },
  "model": { "provider": "example", "name": "candidate", "immutableRevision": null },
  "components": {
    "application": { "root": ".", "files": ["dist"] },
    "dependencies": { "root": ".", "files": ["package-lock.json"] }
  },
  "suiteFile": "suite.json",
  "reportFile": "report.json",
  "provenance": {
    "kind": "synthetic",
    "owner": "local-operator",
    "sampling": "development",
    "source": "synthetic business fixtures",
    "independentReview": null
  }
}
```

Paths in the spec resolve relative to the spec file. The remaining component names are `prompt`, `sop`, `tools`, `policy`, `gateway`, `rubric` and `evaluator`. Missing components remain visible rather than receiving placeholder hashes. Select every executed dependency and configuration artifact. Files are retained in the private evidence store, not just hashed; select sanitized artifacts and keep credentials and real customer traffic outside snapshots. Symlinks, path traversal, `.env` files, private-key files and JSONL traffic files are refused.

The command exits 0 for intact passing measurement evidence, 1 for failed/incomplete evidence, and 2 for invalid input or unavailable artifacts. Exit 0 does not mean qualification or approval. `assessment.readyForApproval` also requires a matching current release, all components, representative random holdout cases and independent review metadata. Review metadata records the owner's claim; the software cannot establish that people were actually independent or that a sample represents customer traffic.

If a report uses a judge, `calibrationFile` must identify a JSON envelope with `datasetDigest` (the suite blob digest), `rubricDigest` (the rubric snapshot digest), and `report` (IntentGauge's calibration result). The judge name/revision and eligible intent slices must match. A changed dataset or rubric invalidates calibration applicability. Deterministic checks need no judge calibration.

Synthetic workbench cases remain synthetic even when their checks all pass. Repeats do not turn them into independent customer samples. Unknown immutable model revision and runtime coverage are shown as limitations. A local content store proves consistency of retained bytes, not trustworthy origin, honest labels, business correctness or production authority.
