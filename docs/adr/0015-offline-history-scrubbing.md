# 15. Offline history scrubbing into separate exports
Status: Accepted (2026-10-21)
## Context
Agents and support systems retain conversation content outside the inference proxy. New detection rules should be usable on these histories without rewriting the append-only audit chain (ADR 0002).
## Decision
- `ai-audit scrub --input FILE --output FILE` sanitizes JSON or JSONL conversation exports with the shared scanner and immutable inspection profile.
- JSONL is streamed with a per-record byte limit; JSON is one bounded record. The command has no network access or database integration.
- Write only sanitized text to an owner-readable temporary file, re-scan each result, and publish a complete separate file atomically without replacing an existing path. Originals are opened read-only; detected source changes abort publication.
- Reject chained audit records, duplicate keys, invalid UTF-8/JSON, oversized records and findings in property names. Encoded JSON strings are inspected recursively; ambiguous nested JSON cannot be safely rewritten.
- Data URIs and Anthropic base64 attachment payloads remain opaque and unchanged. Attachment metadata is text and can be sanitized. No OCR or PDF/image rewriting occurs in this command.
- Print a receipt containing profile identity, record/change counts, per-rule counts, attachment exclusion and the sanitized output digest. Never retain plaintext findings, individual finding hashes, paths or originals in receipts/diagnostics.
## Consequences
- This cleans exported histories, not the source application's database or earlier copies sent to providers.
- Binary attachments require the proxy's attachment inspection path. Use an inactive export; concurrent edits fail rather than risk losing newer content.
- A crash can leave an owner-readable sanitized temporary file; source histories and anchored audit logs remain intact.
