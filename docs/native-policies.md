# Native policies

Auditline evaluates `auditline-policy` version 1 with Node's standard library. The interpreter has no network, filesystem, clock, randomness or JavaScript execution capability. Actions are simulated output data; applications still follow the verdict/effect protocol.

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

Comparison operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`; ordering comparisons require numbers. Step types are optional scalar result refinements and must agree with the inferred kind/dimension. There are no implicit conversions. Finite IEEE-754 arithmetic preserves the existing examples' numeric outputs; this is not a decimal-money interpreter. Division by zero, nonfinite results and unsafe integer arithmetic fail explicitly.

Policies and bindings are each limited to 64 KiB, nesting to 24, traversed values to 8,192, collections to 512, strings to 16,384 UTF-16 code units, nodes including inputs to 64, outputs to 16 and trace JSON to 256 KiB. Each intermediate value and the combined output also obey the value limits. A native adapter session retains at most 128 program sources. Unknown fields, unsafe keys, duplicate identifiers, forward references and unsupported operations refuse. Limits are part of runtime identity.

Policy source is canonical JSON with sorted object keys. `decide` accepts an ordinary JSON policy file and compiles it to canonical source. Recovery of stored source requires exact canonical spelling. Source identities start with `ap_`, input identities with `ai_`; native receipt version 2 also binds the runtime registry and digest. The legacy `qdl` log field and record names stay for compatibility. Replay, chain integrity, origin and human approval remain separate claims.

The examples use native policies in [machining-policy.json](../examples/evaluation/machining-policy.json) and [policy.json](../examples/quineling-wycena/policy.json). The SDK, its codecs, old executable policies and version 1 receipt verifier have been removed during development. Only native policy version 1 and portable receipt version 2 are supported. Old artifacts are rejected, never silently translated or rehashed.

A built production deployment using `npm ci --omit=dev` installs zero packages. Development dependencies contain no Quinelings package either. The existing `qdl` audit field names remain a storage convention, not a dependency or interpreter fallback. The proxy can still observe external Quinelings tool metadata without executing it.

Run `npm run verify:native-install` to check decisions, review, replay, policy history and JSON/SVG/HTML receipts in an isolated production install. `npm run bench:policy` measures the actual native interpreter. The earlier QDL/native comparison is retained as a historical measurement; the benchmark no longer reinstalls the removed SDK.

See [cleanup verification](verification/native-policy-cleanup.md) for the checks and [useful Quinelings ideas](quinelings-ideas.md) for the distinction between reversible source codecs, creature rendering, and the concepts retained in the native engine.
