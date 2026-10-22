# 28. Credentials without a shape are found by their name
Status: Accepted (2026-10-22)
## Context
Shape rules (Gitleaks patterns, checksums) find provider keys, tokens, PESEL and IBAN. A public breach write-up (October 2026) listed credentials that have no shape: a console private key and a server salt in env files, passwords in Terraform state and config JSON, SQL password literals, and passwords pasted into tickets. The scanner missed all of them. The proxy fronts coding agents, so much of its traffic is source code, where variables named like secrets are common.
## Decision
- One rule, `named-credential`, anchors on a name that ends in password, passwd, passphrase, secret, private key, API key, access key or token. Page, next, cursor, continuation and sync tokens and the plural "tokens" are not names of secrets.
- In text it matches `NAME = value` and `NAME: value`, case-insensitive, with an optional quote after the name (HTTP headers, YAML, env files, SQL). A quoted value needs at least 6 characters and no whitespace. An unquoted value needs at least 8 characters and a digit, so type names and identifiers (`token: string`, `apiKey: undefined`) are not flagged.
- As a JSON field it matches a key ending in one of those names, with a string value of at least 6 characters and no whitespace.
- References are never values: dotted identifiers (`process.env.X`), anything containing `(` or `[`, and values starting with `$`, `<` or `{`.
- Specific rules keep their IDs where they overlap (AWS, database, OAuth fields, private keys). Prose ("the root password is X") is not covered: nothing anchors a value there.
## Consequences
- Measured on 7.9 MB of the OpenAI and Anthropic SDK sources: 2 hits, both example tokens in docs; on this repository, only the fake credentials in tests.
- Redact mode masks more, including placeholders such as `YOUR_API_KEY`. No-go mode blocks requests that carry such placeholders; the 409 lists `named-credential`, and an allowlist hash (ADR 0014) exempts a known value.
- A name is a heuristic: a credential under an unusual name (`creds`, `pw1`), an unquoted all-letter password, or a password with spaces still passes; a non-secret value under a secret's name is masked.
- The rules digest changes (ADR 0014), so new records carry a new inspection profile; older records keep theirs.
