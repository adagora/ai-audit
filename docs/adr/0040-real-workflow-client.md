# 40. Real workflow page is a client of the ordinary proxy
Status: Accepted (2026-10-27). Extends [0008](0008-virtual-keys.md), [0037](0037-offline-evidence-workbench.md) and [0039](0039-synthetic-workflow-cockpit.md).
## Context
Synthetic scenarios prove proxy behavior but cannot establish that a real OpenAI response reaches a person through the proxy. A browser should not receive the provider key, and a live log-reading HTTP API would break the offline evidence boundary.
## Decision
- A separate loopback-only real workflow example launches the ordinary `ai-audit serve` process with a provider key supplied through its local environment. The page server holds only a generated virtual client key and forwards bounded chat or Responses requests to that proxy.
- The page shows provider responses, proxy response headers and request IDs. It never reads or serves the real audit log. Verification, context maps and workbench exports remain CLI and offline operations.
- The virtual key and proxy URL may also be passed to UniiChat as a real client. Its own conversation store remains outside the proxy audit log.
## Consequences
- A real paid request demonstrates the integration from browser or UniiChat through the same proxy used in production.
- The operator must provide an OpenAI API key locally and choose a model available to that key. Proxy logs and page session data need normal local protection.
