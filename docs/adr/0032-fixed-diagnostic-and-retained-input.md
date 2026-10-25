# 32. Quinelings diagnostics are a fixed set, and a retained decision input is scanned
Status: Accepted (2026-10-25). Supersedes diagnostic retention in [0024](0024-observe-quinelings-in-traffic.md). Extends [0025](0025-scan-decision-inputs.md).
## Context
ADR 0024 logs a Quinelings tool error's `code` and `path` when they match a character pattern. A path can satisfy that pattern and still carry a PESEL. ADR 0025 scans QDL inputs, the program, and the decision fields that are stored as given. It does not scan the optional free-text `input` kept when `storeRedactedInput` is set. `redact()` masks e-mail, phone, and an 11-digit PESEL. It does not mask a GitHub-shaped token, so that token would be stored verbatim while its hash was also kept.
The proxy still must not run the interpreter. Source and intent hashes are identities of the unsanitized program.
## Decision
- A retained tool-result code is one of an explicit set (`DIAGNOSTIC_CODES`). Anything else is `unreadable`. A path is kept only when it is a `$`-rooted structural path and `scanText` reports no finding. Otherwise the path is omitted. MCP plain-text errors stay `mcp` plus the parsed integer.
- `intentHash` and `sourceHash` are still computed from the unsanitized program. Sanitizing the observation does not change them.
- When `recordQdl` is asked to store `input` and `inspect` finds anything in it, the raw value is not stored. `inputHash` remains the SHA-256 of the raw string. A clean value is unchanged, including `redact()`. This does not refuse the evaluation: the QDL inputs were already scanned.
- The proxy forwarding path does not import the SDK, compile, run, replay, or draw a body.
## Consequences
- A hostile or sensitive tool result cannot write free text or a scanned secret into `quinelings[].error`. Operators lose the raw path on those events.
- A decision can keep a hash of a sensitive free-text input without keeping the text. Replay still uses the scanned QDL inputs, not that free text.
- Codes outside the set, including ones an older pattern would have kept, are stored as `unreadable`.
