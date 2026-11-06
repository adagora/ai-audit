# Native policies

Auditline evaluates `auditline-policy` versions 1 and 2 with Node's standard library. Policy programs have no network, filesystem, ambient clock, randomness or JavaScript execution capability. The session wrapper reads only its fixed implementation files to verify its identity. Actions are simulated output data; applications still follow the verdict/effect protocol.

```json
{
  "format": "auditline-policy",
  "version": 1,
  "name": "Review after two failures",
  "inputs": [
    { "id": "failures", "name": "failures", "type": { "kind": "number", "unit": "one", "integer": true, "min": 0 } }
  ],
  "steps": [
    { "id": "review", "op": "compare", "inputs": ["failures"], "params": { "operator": "gte", "value": 2 } }
  ],
  "outputs": ["review"]
}
```

Save the policy as `policy.json` and inputs such as `{"failures":2}` as `inputs.json`, then use the existing commands:

```sh
auditline decide --policy policy.json --inputs inputs.json --system-id example --use-case review
auditline replay --decision DECISION_ID
auditline receipt --decision DECISION_ID --format json --output receipt.json
auditline verify-receipt --input receipt.json
```

An input declares either a binding `name` or a constant `value`. Scalar types are `number`, `boolean`, `string` and `null`. Number types require a unit and may specify `integer`, `min` and `max`. A policy may include a public `rationale` string of up to 512 UTF-16 code units. Each input may include `basis`: `confirmed`, `testimony`, `suspected` or `open`. These labels are caller assertions, not independently verified provenance or private model reasoning. Integer values must be safe JavaScript integers. Units use products and signed integer exponents, for example `PLN*h^-1`; `one` is dimensionless. The compiler checks dimensions and operand kinds, including boolean guards. Multiplication and division combine dimensions. Nodes run in declaration order and can reference only earlier inputs/nodes. All nodes execute, including both branches feeding `choose`.

| Operation | Inputs | Parameters |
|---|---|---|
| `arithmetic` | Two numbers | `kind`: `add`, `sub`, `mul`, `div`, `floorDiv`, `min`, `max` |
| `compare` | One scalar | `operator` and literal `value` |
| `compareValues` | Two compatible scalars | `operator` |
| `choose` | Boolean guard, two compatible values | Empty object |
| `report` | Up to 16 values | Unique `labels`, one per value |
| `action` | Boolean guard, payload | Boolean `allowed`, string `action` |
| `evidenceFresh` (v2) | Evidence records, claim string, recorded clock | `allowedSources`, `allowedKinds`, `maxAge`, `minRevision` |
| `evidenceAllows` (v2) | A derived evidence result | Positive distinct-source threshold `minSources` |

Comparison operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`; ordering comparisons require numbers. Step types are optional scalar result refinements and must agree with the inferred kind/dimension. There are no implicit conversions. Finite IEEE-754 arithmetic preserves the existing examples' numeric outputs; this is not a decimal-money interpreter. Division by zero, nonfinite results and unsafe integer arithmetic fail explicitly.

Policies and bindings are each limited to 64 KiB, nesting to 24, traversed values to 8,192, collections to 512, strings to 16,384 UTF-16 code units, nodes including inputs to 64, outputs to 16 and trace JSON to 256 KiB. Each intermediate value and the combined output also obey the value limits. A native adapter session retains at most 128 program sources. Unknown fields, unsafe keys, duplicate identifiers, forward references and unsupported operations refuse. Limits are part of runtime identity.

Policy source is canonical JSON with sorted object keys. `decide` accepts an ordinary JSON policy file and compiles it to canonical source. Recovery of stored source requires exact canonical spelling. Source identities start with `ap_`, input identities with `ai_`. Receipt version 3 binds the semantic registry and the exact interpreter implementation. The `qdl` log field names remain a storage convention. Replay, implementation identity, chain integrity, origin and human approval remain separate claims.

Existing scalar version 1 examples remain in [machining-policy.json](../examples/evaluation/machining-policy.json) and [policy.json](../examples/quineling-wycena/policy.json). Version 2 adds [freshness and conflict rules](../examples/evidence-policy/README.md). The SDK and its codecs remain removed. Portable receipt versions 1 and 2 are unsupported; an unpinned old execution cannot be relabeled as a pinned one.

A built production deployment using `npm ci --omit=dev` installs zero packages. Development dependencies contain no Quinelings package either. The existing `qdl` audit field names remain a storage convention, not a dependency or interpreter fallback. The proxy can still observe external Quinelings tool metadata without executing it.

Run `npm run verify:native-install` to check decisions, review, replay, policy history and JSON/SVG/HTML receipts in an isolated production install. `npm run bench:policy` measures the actual native interpreter. The earlier QDL/native comparison is retained as a historical measurement; the benchmark no longer reinstalls the removed SDK.

See [cleanup verification](verification/native-policy-cleanup.md) for the checks and [useful Quinelings ideas](quinelings-ideas.md) for the distinction between reversible source codecs, creature rendering, and the concepts retained in the native engine.

## Interpreter implementation identity

Every evaluated decision stores a binding containing `registry`, `registryDigest` and `implementationDigest`. Replay requires that binding to match the local interpreter. A missing binding returns `audit_policy_implementation_missing`; a different implementation returns `audit_policy_implementation_mismatch`. Neither is repaired by recomputing the same output.

Version 3 receipts include `program.implementation`: a manifest of SHA-256 hashes for the built `policyAdapter.js`, `policyEvidence.js`, `policyImplementation.js`, `policyRuntime.js` and `policyValue.js`. Paths are fixed module-relative names, not locations to fetch or execute. The manifest digest covers its ordered file list, format and version. Files must remain unchanged while the process runs; mutation returns `audit_policy_implementation_changed`.

Builds use LF newlines. Tests build into two different directories and compare the emitted bytes, and check that the manifest covers the complete static local interpreter import closure. A compiler or source change that emits different implementation bytes creates a different pin, even if its semantic version label was left unchanged. Keep matching trusted release artifacts for future replay; the verifier does not download interpreters from a receipt. This identifies Auditline's implementation, not the Node binary or an authenticated remote execution.

## Fresh and contradictory evidence

Version 2 inputs can have type `{"kind":"evidence"}` or `{"kind":"evidenceClock"}`. Evidence is an array of at most 128 exact records:

```json
{"id":"review-1","source":"review-a","claim":"release-eligible","value":true,"kind":"observation","observedAt":900,"revision":2}
```

IDs are unique. `value` is Boolean or null; null means unknown. Kind is `observation`, `testimony` or `inference`. Source/claim names are nonempty strings of at most 120 UTF-16 code units; IDs are at most 64. Times and revisions are nonnegative safe integers in consistent host-defined tick/revision units. The clock is exactly `{"now":1000}`.

Policy parameters fix the allowed sources and kinds, maximum age and minimum revision. Requests cannot change those rules through the clock input. A record is skipped for the first matching reason: different claim, disallowed source, disallowed kind, unknown value, future observation, stale age or old revision. Age equal to `maxAge` and revision equal to `minRevision` are accepted.

The result retains used records and skipped records with reasons, distinct-source support/refutation counts, same-source conflicts, and state `unknown`, `supported`, `refuted` or `conflict`. Multiple positive records from one source count once. Opposite current reports remain contradictory even when one has a newer revision; no majority or latest-value rule silently resolves them. Expired negative reports do not conflict with current evidence because the policy explicitly excludes them.

`evidenceAllows` accepts only a derived evidence result. It returns true for supported evidence meeting `minSources`; unknown, refuted and conflicting results cannot pass. All existing byte/value/depth/output/trace limits apply. Overflow publishes no partial outputs.

`npm run example:evidence` drives real CLI processes through current, stale and conflicting cases and exports verified JSON/SVG receipts. The facts are synthetic. Freshness is relative to the retained decision clock, not the time a recipient opens the file. The host must authenticate collection, provide an honest clock, and re-evaluate if execution is delayed. Source labels do not prove independence or truth.

See [verification evidence](verification/pinned-evidence-policies.md) for repeated-build, changed-code, stale/conflict, resource-bound and isolated CLI checks.
