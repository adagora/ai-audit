# 59. A JSON receipt verifies only as ai-audit wrote it, like the SVG
Status: Accepted (2026-10-30). Supersedes, for JSON, "accepts bounded JSON" in [0036](0036-portable-qdl-decision-receipts.md); follows [0058](0058-log-lines-verify-only-as-written.md).
## Context
`verify-receipt` compares an SVG receipt with its regenerated presentation byte for byte, but it accepted any JSON spelling of a package. The digest, the replay and an attestation's signature all cover the canonical content, so `"rate": 4.50000000000000001`, `4.2e1`, compact JSON and extra spaces verified when `4.5`, `42` and the written layout were the replayed content. A reader that keeps decimal digits, such as jq 1.7, shows the other number on a verified, and possibly signed, receipt. ADR 0058 closed the same gap for log lines.
## Decision
- `verifyPortableReceipt`, and so `verify-receipt` and `verify-attestation`, accept a JSON receipt only if, without surrounding white space, it equals `packageJson` of the package it parses to: `JSON.stringify(package, null, 2)`, which `receipt --format json`, the HTML download and the workflow example write. Otherwise it fails with `audit_package_not_as_written`, after the digest, replay and output checks, so a changed value still reports those first.
- `parseDecisionPackage` keeps its shape and duplicate-key checks and stays lenient about layout, so tools that only read a package still can.
## Consequences
- Every byte of a verified receipt is fixed, in both forms; two readers see the same numbers.
- A JSON receipt that another tool reformatted no longer verifies. Regenerate it with `ai-audit receipt`, or verify the SVG.
