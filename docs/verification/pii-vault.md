# Scoped encrypted PII tokens

Implementation: [ADR 0074](../adr/0074-scoped-encrypted-pii-tokens.md). Verification performed on 2026-11-06 against the working tree. All traffic, client keys, provider keys and PII fixtures are synthetic. No real provider was called and no live vault was enabled.

## Evidence and limits

| Requirement | Evidence |
|---|---|
| Detected email, phone, PESEL and IBAN values become distinct random tokens | `test/pii.test.ts`: exact-format round trips for every supported kind, repeated-value identity and fresh tokens between requests |
| Tool results, nested JSON and split text use the same inspector | `test/pii.test.ts`: nested tool payload and split email; existing scanner/law/fuzz tests remain enabled |
| Credentials never become reversible because they overlap PII | `test/pii.test.ts`: password/email and database URI regressions; vault mode gives secret matches priority |
| Storage encrypts values and authenticates scope, token and expiry | `test/pii.test.ts`: file contents, owner permissions, authenticated tampering, key/conversation isolation, exclusive publication, restart and expiry |
| Refuse unsafe storage and unavailable vaults | Unit tests cover symlinks, tampered files and directory permissions; real CLI test makes the vault path unavailable and checks no upstream call |
| Default agent responses stay tokenized | Real CLI test checks response text and later reuse after restarting the proxy |
| Only authorized customer text is restored | Real CLI tests for Chat Completions, Responses and Anthropic Messages, JSON and SSE; every character is a separate delta; tool arguments remain tokens |
| Model output cannot restore a token absent from the request | Real CLI test returns another conversation's token from the mock and checks that it remains opaque |
| Customer restoration preserves action authorization | Real CLI test holds a forbidden tool call in every API/transport combination; customer text is restored, tool calls are removed |
| No partial restoration on failure | Real CLI tests malformed JSON, truncated SSE and response size overflow; only a fixed 502 is delivered |
| Inspection, counting and persistence precede model calls | Real CLI test covers worker offload and `count_tokens`, checks upstream bodies and verifies counting adds no audit row |
| PII, token references and scope header stay out of audit content | Real CLI checks log bytes and chain verification; unit test covers metadata and ambiguous strings; upstream never gets the scope header |
| No forward with a torn audit log | Real CLI checks 503 with no upstream call; existing lifecycle regression tests and model remain enabled |
| Expiry cleanup has a usable command | Unit test advances an injected clock and prunes expired mappings; real `vault-prune` command authenticates and preserves live mappings |

This proves behavior for the supported scanner patterns and API shapes. It does not prove exhaustive PII detection, arbitrary encodings, names/addresses in free text, customer authentication in an external channel, or integration with every incoming channel. Vault mode rejects known unsupported binary, remote, provider-held and provider-executed content. It does not provide automatic key rotation, key recovery, KMS integration, quotas or backup deletion. Customer SSE is buffered until completion.

## Checks

- `npm test`: 513 tests, 493 pass, 20 skipped, zero failures. Skips include unavailable attachment tooling/sandbox and optional external integration checks.
- `npm run verify:formal`: all 19 TLC configurations give their expected result; all 54 tied regression tests pass. The passing request lifecycle explores 240 distinct states after permitting the deadline to stay armed during buffered delivery. Known residual windows still fail their dedicated configurations as expected. This model verifies lifecycle accounting, not detector completeness or AES itself.
- `node .agents/skills/verify-proxy/drive.mjs`: 17 scenarios, 15 pass, one failure (this Mac has no working bwrap, contrary to the driver's sandbox assertion), one skip (PDF tooling). Other ordinary proxy scenarios pass. Evidence is outside the repository under `~/.ai-audit-verify/2026-11-06T13-50-41-324Z`.
- UBS on the three new production modules: zero critical findings, three warnings for `JSON.parse` outside a local try block. Vault parsing is caught by `get`/`prune`; delivery parsing is caught before any customer bytes are emitted. The malformed/tampered tests exercise those catches. No suppressing code comments were added.
- UBS on all nine changed/new production modules reports existing proxy warnings as well: nullish equality intentionally checks both null and undefined, configured upstream fetches are not caller-chosen URLs, response headers use fixed/validated values, mutations append to separate collections or iterate snapshots, and CLI output is intentional. The reported secret comparison is a comparison with the literal route `count`. The new regexes use fixed patterns or internal integer lengths. These findings were reviewed; the broader scan is not presented as a clean security certification.

Reproduce the vault HTTP tests with `npm run build && node --test dist/test/pii.test.js dist/test/piiProxy.test.js`. The test starts the real CLI and mocks only the provider boundary. It stores artifacts in temporary directories, never in `live/`.
