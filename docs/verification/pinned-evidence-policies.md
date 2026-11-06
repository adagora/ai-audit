# Pinned implementation and evidence-rule verification

2026-11-06, based on `01c3520` plus the implementation/evidence worktree changes. Local host: macOS arm64, Node 26.8.1. This remains below the declared Node 26 package minimum; supported-version CI is separate evidence.

- `npm test`: 488 tests, 468 passed, 20 skipped, zero failed.
- `npm run verify:formal`: all 19 TLA+ configurations returned their expected outcomes and all 54 tied Node tests passed. The writer adds runtime-binding metadata without changing append order or lock/rotation/verdict actions, so no model action changed.
- The proxy driver passed all 14 selected non-attachment/non-sandbox scenarios. Linux bwrap and PDF prerequisites remain unavailable on this host; those scenarios were not claimed as passed.
- `node scripts/verify-native-install.mjs` created an isolated offline production install with zero packages and no SDK. Actual CLI processes recorded/reviewed/replayed a scalar decision, exported JSON/SVG/HTML, matched interpreter implementation pins, and checked all three current/stale/conflict evidence cases.
- `node examples/evidence-policy/run.mjs` exercised real CLI decision, replay, export and verification processes. Both JSON and SVG receipts verified for current, stale and contradictory synthetic observations. [Retained results](policy-gap-example-results.json) omit the temporary directory and contain no real traffic or keys. The evidence clock is an explicit synthetic input.

## Implementation identity

Tests check that the manifest covers the static local execution import closure, disallow untracked dynamic code loading in that closure, and confirm that returned manifest objects cannot mutate the retained identity. Two complete builds into different output directories produce byte-identical modules and match the active build's SHA-256 entries.

A copied runtime verifies an original receipt. Adding only a newline changes its implementation identity: the receipt and original log replay then fail, even though a newly recorded calculation under the modified build still returns the same output. A second mutation makes evaluation throw; receipt verification rejects the code mismatch before that evaluation can execute. Another process detects code changed after its startup manifest was captured.

Tests reject altered component hashes/digests, missing pins, unsupported old receipt versions, and path injection. Receipt-supplied paths are never loaded. Removing a historical decision's binding and rebuilding a valid local chain does not let export assign it the current interpreter: replay/export fail with `audit_policy_implementation_missing`, and HTML shows no recorded runtime or implementation pin.

## Freshness and conflict rules

Table cases cover inclusive age/revision boundaries, future observations, unknown values, disallowed claims/sources/kinds, stale observations, old revisions, duplicate record IDs, malformed clocks and invalid policy parameters. Repeated reports from one source cannot meet a distinct-source threshold. Opposite current reports remain conflicting even if one revision is newer. Expired negative reports are explicitly excluded by policy.

Changing the supplied decision time changes input identity and can hold an otherwise eligible proposal. A request cannot relax `maxAge` through the clock; changing the policy's limit creates a different source identity. Evidence guards require a derived result, supported state and the policy's positive quorum.

Boundary tests exercise 128 distinct sources, maximum safe-integer clocks, output expansion and trace exhaustion; computed limit failures publish no partial outputs. A 1,500-case seeded evidence campaign agrees with an independent set-based oracle; the separate 1,500-case native grammar mutation campaign remains. These deterministic campaigns are not a claim of coverage-guided or exhaustive fuzzing.

UBS reviewed the new value/evidence/interpreter/manifest modules and changed receipt/writer paths. The remaining critical flag is the existing intentional nullish check `nodeId != null`; two warnings parse JSON emitted by the internal canonical writer. No suppression comments were added. `git diff --check` passed.

Matching implementation bytes prove which local interpreter can reproduce the package's computation, not authenticated remote execution, source independence or factual truth. Freshness refers to the retained clock; the host owns authenticated collection and re-evaluation before a delayed real action. No new dependency, automatic interpreter download or real model call was introduced.
