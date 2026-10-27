# 39. Loopback workflow cockpit uses synthetic traffic only
Status: Accepted (2026-10-27). Extends [0008](0008-virtual-keys.md) and [0037](0037-offline-evidence-workbench.md).
## Context
The offline workbench investigates a verified production log, but cannot send requests. A real chat client tests integration yet cannot reliably reproduce every proxy mode, failure or evidence path without provider cost.
## Decision
- The optional workflow example starts a loopback-only HTTP page, mock provider and proxy instances with generated fake virtual and upstream keys. It never accepts a production log path, provider URL or provider key.
- The page selects fixed scenarios or sends a bounded text prompt to the mock through the real proxy. It shows whitelisted record metadata and may download an offline workbench generated only from its disposable synthetic log.
- The existing proxy verification driver remains the exhaustive HTTP regression gate. Its pass, fail and skip results are displayed without converting skips to passes.
- Real-client validation uses the regular proxy and UniiChat's configurable API base. The cockpit is not placed in that path.
## Consequences
- A developer can demonstrate scanning, context, Quinelings observation, streams and audit evidence without network provider calls.
- The cockpit is a local example, not a production log API. The offline-only contract of ADR 0037 remains in force for real evidence.
