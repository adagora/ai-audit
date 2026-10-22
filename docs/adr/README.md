# Architecture decision records

## Policy
Write an ADR only for a non-trivial architectural decision. It qualifies if it is hard to reverse, affects module boundaries, data formats, security posture or external contracts, or a reasonable engineer would challenge it.

Not an ADR: bug fixes, flag tweaks, naming, dependency bumps, tuning. Put those in the commit message.

Format: Nygard (Status, Context, Decision, Consequences), at most ~40 lines, file `NNNN-kebab-title.md`. Accepted ADRs are never edited except their status. To change a decision, write a new ADR that supersedes the old one and mark the old one `Superseded by NNNN`.

## Index
- [1. TypeScript with zero runtime dependencies](0001-typescript-zero-runtime-deps.md)
- [2. Hash-chained JSONL audit log with external anchors](0002-hash-chained-log-with-anchors.md)
- [3. Fail-closed inspection of attachments](0003-fail-closed-attachments.md)
- [4. Quinelings/QDL is an optional adapter, not core](0004-quinelings-optional.md)
- [5. Default image is official Node, not pointer-compressed](0005-official-node-image.md)
- [6. Aliases stay within one API format](0006-aliases-same-format.md)
- [7. The log stores where a finding was, never what](0007-log-stores-no-values.md)
- [8. Virtual client keys, provider keys only in the proxy](0008-virtual-keys.md)
- [9. One decision per request, before forwarding](0009-inspect-whole-request.md)
- [10. Prompt injection is an advisory signal on untrusted content only](0010-advisory-prompt-injection-signal.md)
- [11. Response content is logged per key, off by default](0011-response-content-per-key.md)
- [12. Unknown token usage is never counted as zero](0012-unknown-usage-never-zero.md)
- [13. PDFs with findings are rasterized by default in redact mode](0013-rasterize-pdfs-by-default.md)
- [14. Content-addressed inspection profiles](0014-versioned-inspection-profiles.md)
- [15. Offline history scrubbing into separate exports](0015-offline-history-scrubbing.md)
- [16. Fail closed when the audit log cannot take a record](0016-fail-closed-when-log-unavailable.md)
- [17. Context composition is logged as sizes, never content](0017-context-composition-metadata.md)
- [18. Sessions are linked by keyed prefix digests of the message list](0018-keyed-session-linking.md)
- [19. /metrics is OpenMetrics text, unauthenticated, bound to localhost by default](0019-metrics-openmetrics.md)
- [20. Context arena: block positions, ages and first changed offset](0020-context-arena-and-cache-busts.md)
- [21. Attachment sandbox: fail closed, minimal mounts, explicit opt-out](0021-attachment-sandbox-hardening.md)
- [22. Produkcyjnie obecny sandbox, Rust tylko z konkretnego powodu](0022-produkcyjnie-obecny-sandbox.md)
- [23. Decision records: CLI decide, approve and replay; every QDL outcome is recorded](0023-decision-records-cli-and-outcomes.md)
