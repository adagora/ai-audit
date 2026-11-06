# FVK specification note: `redact`

Bounded target: `src/audit.ts::redact`. Intent evidence is summarized in `INTENT_SPEC.md` and `PUBLIC_EVIDENCE_LEDGER.md`. Candidate implementation uses three sequential JavaScript regex replacements. The public test supports one email/phone example; it does not specify the complete regex contract.

A credible mini-JavaScript semantics for regex is beyond the bundled FVK fast path. Accordingly `redact-spec.k` contains no claims, `SPEC_AUDIT.md` marks the key obligations unresolved, and `PROOF.md` records the run as invalid/unresolved. This is an experimental result, not a correctness proof.
