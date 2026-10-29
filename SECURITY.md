# Security

## Reporting a vulnerability

Report a vulnerability privately with **Report a vulnerability** on this repository's Security tab. Do not open a public issue for it. Do not put real API keys, prompts, tool results or audit logs in the report; describe the input shape or attach a synthetic one. Only the `main` branch is supported; there are no releases.

## What a result means

- A finding is a match of a fixed rule. It is not proof that a value was a secret. No finding is not proof that nothing sensitive left the machine: names, street addresses and formats without a rule are not detected. See [Limitations](README.md#limitations).
- `redact` and `no-go` act on findings. `advisory` forwards the original bytes and only records.
- Prompt-injection rules and the optional local model judge are advisory evidence for a person to review. They never block, and they are not a security boundary. Do not connect them to keys, payments, deletions or other irreversible actions.
- The tool-call gate checks only the tools listed in `actionGate` and the tools of keys with a `tools` list, and only destinations it can parse from their arguments. It does not see tools the provider runs itself.
- The audit log is tamper-evident, not tamper-proof. The hash chain shows an edited, removed or reordered record; a replaced or shortened file shows only against anchors stored somewhere the proxy cannot write. The log is not a compliance certificate.

## Credentials and data

- Provider keys come only from the proxy's environment (`AI_AUDIT_UPSTREAM_OPENAI_KEY`, `AI_AUDIT_UPSTREAM_ANTHROPIC_KEY`). Clients hold `aia-` virtual keys; `gateway.json` stores their SHA-256, not the keys.
- The log stores rule ids, JSON paths, hashes, sizes and counts. It never stores prompts or detected values. Response text is stored, redacted, only for a key with `logContent`.
- Keep these files private and out of Git: the audit log and its segments, `<log>.session-key`, the budget directory, `gateway.json`, anchors you rely on, and attestation private keys.
- `/metrics` has no authentication and binds to `127.0.0.1` by default. Block it in front of the proxy if you expose the port.
- The optional injection judge sends original tool-result text, before redaction, to an Ollama service on a loopback address. Turn it on only with a local service you trust.

## Untrusted input

Request bodies, tool results and attachments can come from an attacker. The proxy refuses bodies over 32 MiB, duplicate keys and nesting deeper than 256 before it scans. Text above 256 KiB is scanned in a worker with a deadline. Attachments are inspected in bubblewrap with no network, no capabilities and an empty environment; without a working sandbox, calls with files are refused. `--unsafe-no-sandbox` is for development only. `replay` of a JavaScript step uses `node:vm`, which is not a sandbox: run only code you trust.
