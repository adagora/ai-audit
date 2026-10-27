# 37. Offline evidence workbench from a verified log snapshot
Status: Accepted (2026-10-27). Extends [0007](0007-log-stores-no-values.md), [0017](0017-context-composition-metadata.md), [0018](0018-keyed-session-linking.md), [0019](0019-metrics-openmetrics.md) and [0036](0036-portable-qdl-decision-receipts.md).
## Context
Grafana can show bounded aggregate metrics but cannot investigate individual sessions, context composition, scan findings or QDL decisions. The CLI can produce separate reports, context maps and receipts, but operators need an index that links those artifacts and explains which claim each one supports. Adding session IDs or values to `/metrics` would violate its label and privacy contract. A live log API would add a new access-control surface.
## Decision
- `ai-audit workbench --log LOG --output FILE [--from ISO --to ISO]` creates one self-contained local HTML file from a single chain-verified log snapshot. It never writes to the log or exposes a network endpoint.
- The file contains only whitelisted metadata: timestamps, record IDs, status and rule codes, JSON paths, session links, context byte composition and token attribution basis, usage counts, QDL operation/status/hash identifiers and review verdicts. It omits prompts, detected values, stored outputs, QDL source, retained inputs, reviewer names and notes. All displayed strings are HTML-escaped.
- The workbench distinguishes a chain-consistent snapshot from independent origin proof. It links a decision to the existing `receipt` and `verify-receipt` commands; a portable receipt is exported separately after the owner reviews its exact contents.
- Tables cover the selected interval and cap displayed history; summary counts remain computed from every selected record. The page labels truncation and missing usage, and does not infer missing context or prompt content.
## Consequences
- Operators can browse local evidence and choose individual artifacts to share without adding sensitive metric labels or a log-reading HTTP service.
- The generated HTML is a private investigation artifact, not a portable origin proof. It should not be shared wholesale; the selected SVG/JSON receipt has its own narrower verification contract.
- A snapshot does not update as new requests arrive. Regenerate it for a later interval or after new log records.
