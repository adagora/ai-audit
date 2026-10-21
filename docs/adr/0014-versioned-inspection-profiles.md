# 14. Content-addressed inspection profiles
Status: Accepted (2026-10-21)
## Context
A rule ID alone cannot explain a past redaction after rules or configuration change. The attachment cache used a manually maintained `rules-v1` identity.
## Decision
- Each proxy inspection decision records `inspectionProfile`: `scannerVersion`, `rulesDigest`, `configDigest`, and the combined `digest` (SHA-256).
- Rule identity includes ordered regexes, keyword filters, field rules and validators. Increment the scanner version when traversal or reconstruction semantics change.
- Configuration identity includes enforcement mode, page-redaction policy, request/history scope and the digest of a sorted, deduplicated exact-value allowlist. Never record allowlist entries or matched values.
- Snapshot policy when creating the proxy or starting a scrub. Text, attachment inspection, output logging and cache keys use that same snapshot; caller mutations cannot change it.
- Existing audit records remain valid without a profile. They cannot be retroactively assigned one.
## Consequences
- A profile identifies which policy ran; it is not evidence that detection is exhaustive.
- Rule/config changes invalidate attachment cache reuse. Historical exports can report the same identity format.
- The audit format gains an additive field; existing chains and external anchors are preserved.
