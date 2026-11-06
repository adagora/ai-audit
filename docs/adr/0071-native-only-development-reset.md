# 71. Remove the legacy policy runtime during development
Status: Accepted (2026-11-05); receipt version 2 superseded by [0072](0072-pinned-interpreter-receipts.md), language extended by [0073](0073-freshness-and-conflict-evidence.md). Supersedes the legacy replay and SDK retention decisions in [0070](0070-native-policy-runtime.md), [0004](0004-quinelings-optional.md) and the QDL input/runtime contracts in [0023](0023-decision-records-cli-and-outcomes.md) and [0036](0036-portable-qdl-decision-receipts.md).

## Context
The project is in development. The owner explicitly authorizes removing old policy compatibility rather than maintaining an SDK solely to verify disposable development receipts. The native runtime already covers the machining and governor policies.

## Decision
- Remove the SDK from every dependency section, its vendored implementation and codecs, the runtime fallback, and old executable QDL policy fixtures. No default, development or peer installation includes it.
- Accept native policy format version 1 and native portable receipt version 2 only. QDL policies and version 1 receipts are unsupported; reject them explicitly. Do not translate or silently authenticate old evidence.
- Migrate examples and regression tests to the native interpreter. Retain fixed expected numeric outcomes captured during the original differential comparison, as test data without SDK source or encoded artifacts.
- Preserve the external Quinelings traffic observer: it parses third-party tool metadata without executing code or installing a package. Its protocol fixtures describe external wire data, not a local runtime.
- Keep existing audit record linkage and storage field names to avoid an unrelated log rewrite. Replace creature rendering names with a policy step index. Do not retain a legacy renderer or source codec.
- Native policies may carry a bounded public rationale and per-input declared basis (`confirmed`, `testimony`, `suspected`, `open`). These are caller assertions, never proof of provenance or private model reasoning. Inspection, source recovery and rendering remain passive.

## Consequences
Old development QDL receipts cannot be replayed by this checkout. Existing signatures, log hashes and external anchors are never rewritten. The native semantic core, boundary tests and fixed expected outcomes become the maintained contract. Historical performance comparisons remain recorded measurements, not benchmarks that require reinstalling the removed SDK.
