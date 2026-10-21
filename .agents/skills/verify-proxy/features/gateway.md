# Gateway: keys, aliases, stats, metrics
## Sub-features
Virtual client key (`AI_AUDIT_CLIENT_KEY` or config `keys`), upstream key swap, model aliases from `--config`, `ai-audit stats` and `GET /audit/stats` with `x-admin-key`, and `GET /metrics` as OpenMetrics.
## How to get to it (user POV)
Set env keys on the proxy, point the client at the proxy with the virtual key, and use `model: "<alias>"`.
## Driving it with drive.mjs
`node drive.mjs keys aliases stats metrics`. Checks 401 for a wrong key, the upstream auth header, the upstream model, admin-only stats and metrics text ending in `# EOF`.
## Gotchas
Requests rejected with 401 are not logged, so do not wait for a record after a wrong key.
