# Inspection modes
## Sub-features
redact replaces findings with `[REDACTED:rule]`; no-go returns 409 and never calls upstream; advisory forwards the original and logs the finding.
## How to get to it (user POV)
`ai-audit serve --mode redact|no-go|advisory`, then send a prompt containing a secret, for example an AWS access key.
## Driving it with drive.mjs
`node drive.mjs redact no-go advisory`. Checks the status, the upstream body, `decision.action` and findings in the log, and that the secret is not in the log.
## Gotchas
The finding count is also in the `x-audit-finding-count` response header. Test keys are built by concatenation so that secret scanners do not flag the repo.
