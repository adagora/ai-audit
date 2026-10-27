# 42. Offline request investigation from verified metadata
Status: Accepted (2026-10-27). Extends [0037](0037-offline-evidence-workbench.md) and [0041](0041-context-inspection-and-public-showcase.md).
## Context
The workbench lists calls, sessions, findings and decisions separately. Investigating one request requires following those links while keeping observed facts distinct from inferred relationships and missing evidence. The audit log deliberately omits prompt values.
## Decision
- The offline workbench adds a per-request fact sheet and expandable path through client metadata, inspection, forwarding, provider response, tool observations and linked QDL decisions or reviews.
- The view is derived solely from the same verified snapshot and uses a whitelist of metadata fields. It does not retain or display prompt content, detected values, model output, decision inputs or reviewer notes.
- Each stage labels its evidence basis: observed record, derived relationship, or unknown. Missing usage, unlinked decisions, absent provider responses and unchecked anchors remain explicit. A linked review is not presented as independently authenticated.
- Investigation cards are capped to the latest displayed calls. Older calls require a narrower export interval.
## Consequences
- One request can be inspected without joining several tables by hand. The existing chain verification and sharing boundaries remain unchanged.
- This is a record navigator. It does not reconstruct unretained content or prove that an observed tool result or reviewer identity is true.
