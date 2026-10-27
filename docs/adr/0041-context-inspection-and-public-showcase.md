# 41. Context inspection stays client scoped; public showcase is recorded synthetic evidence
Status: Accepted (2026-10-27). Extends [0007](0007-log-stores-no-values.md), [0017](0017-context-composition-metadata.md), [0037](0037-offline-evidence-workbench.md), [0039](0039-synthetic-workflow-cockpit.md) and [0040](0040-real-workflow-client.md).
## Context
The workflow page needs to show exactly what entered a request and how context changed. Production audit records intentionally omit prompt values. A public interview demo must not expose the provider key, a live proxy or a real log.
## Decision
- The local real page returns the request context held in its own in-memory conversation and a scanner-derived forwarded preview for that request. These are labeled as client-held and scanner-derived, never as recovered audit-log content. The page does not read the real log.
- The synthetic page can show request and forwarded content because its data is disposable. It maps each feature to a runnable scenario, verification gate or offline tool and labels unavailable checks.
- A static export for public hosting contains only recorded synthetic scenario results and explicitly labels them as recorded. It has no proxy endpoint, provider key, writable audit log or live request path.
## Consequences
- Operators can compare exact current context with persisted metadata without weakening the log's privacy contract.
- The public page explains capabilities and evidence but cannot prove a deployment is live or process a visitor's OpenAI request.
