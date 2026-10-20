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
