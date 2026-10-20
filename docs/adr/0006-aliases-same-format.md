# 6. Aliases stay within one API format
Status: Accepted (2026-10-20)
## Context
Users want to switch model or upstream without touching clients.
## Decision
Config `aliases` map a name to a model and an optional upstream base URL within the same wire format. No OpenAI↔Anthropic translation.
## Consequences
- Translation would be large and lossy (tools, streaming, content blocks), so it is left out.
- A client that speaks OpenAI can only be routed to OpenAI-compatible upstreams.
