# Useful ideas from Quinelings

Quinelings combines a bounded computation graph with a mathematical creature used for inspection. These are separate functions:

- The body is a visual index: regions belong to operations, and recorded values can be displayed on them. Similar-looking bodies do not establish identical code.
- Exact harmonic coefficients or RGB genome records reversibly encode the full program source. A normal screenshot or compressed video cannot recover it. Encoding preserves data; it is neither encryption nor proof of who ran it.
- A constructor quine emits its own exact source. That is a reproducibility check, not evidence that an external fact is true or a real-world action occurred.

These distinctions come from the upstream [README](https://github.com/CharlesHoskinson/quinelings/blob/main/README.md) and [QDL 1 contract](https://github.com/CharlesHoskinson/quinelings/blob/main/docs/QDL-V1.md).

Auditline keeps canonical source and inputs in a portable receipt, so additional harmonic/RGB codecs add little to its auditing use case. A named step index makes calculation navigation available without creature geometry or a self-reproducing constructor.

| Idea | Value for Auditline | Current state |
|---|---|---|
| Typed, bounded executable rules | Reject wrong units, invalid inputs and unlimited computation | Native runtime implements this |
| Source and input identity are separate | Run different facts through the same policy; distinguish a rule edit from a new observation | Native source/input hashes and receipts implement this |
| Public declarations, distinct from private model reasoning | Explain assumptions without pretending to expose an LLM's internal reasoning | Native rationale and per-input declared basis are retained; labels are assertions |
| Step-linked recorded values | Inspect the exact calculation that produced a result | Native trace and named SVG step index implement this |
| Passive inspection and recovery | Looking at a policy should never dispatch an action or rerun it | Native recovery/indexing are passive; receipt export explicitly replays for verification |
| Registry pins include implementation hashes | Detect interpreter changes even when a version label was accidentally left unchanged | Recommended next: bind a reproducible implementation manifest to receipts. The current native registry digest covers its declared semantic profile and limits, not every source byte |
| Freshness and conflict-aware evidence | Refuse decisions based on expired rates or contradictory facts | Recommended when a real policy needs it. Supply the clock and evidence as explicit inputs; never read an ambient clock during replay |
| Request-key conflict checks | Retried transport requests must not create duplicate work | Apply at durable recording/execution boundaries. Pure policy replay alone does not prevent duplicate external effects |

The next priorities should be a reproducible runtime manifest and explicit evidence freshness for a concrete business policy. Array kernels, routing, scheduling, social/ranch behavior, creature animation and genomes should wait for an actual Auditline requirement. The application still owns authenticated observations, authorization, idempotent writes and reconciliation.
