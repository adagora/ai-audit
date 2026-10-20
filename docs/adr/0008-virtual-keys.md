# 8. Virtual client keys, provider keys only in the proxy
Status: Accepted (2026-10-20)
## Context
Clients and agents should not hold provider keys, and per-client limits and stats need an identity.
## Decision
Config holds only the SHA-256 of virtual keys, each with allowed models/providers. `keygen` prints a key once. Real provider keys live only in the proxy environment. `/audit/stats` requires `AI_AUDIT_ADMIN_KEY`.
## Consequences
- A leaked config reveals no usable key; a lost virtual key must be regenerated.
- Requests rejected with 401/403 are not written to the audit log yet.
