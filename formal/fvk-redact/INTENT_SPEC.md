# Intent specification: `redact`

Target: `src/audit.ts::redact(s: string)`.

- Given a string, redact email-shaped substrings as `[EMAIL]` and phone-shaped substrings as `[PHONE]` (public test evidence).
- Preserve surrounding text and punctuation around matches (public test evidence).
- The implementation also replaces eleven-digit word-bounded sequences with `[PESEL]`; the public evidence located in this pass does not independently establish that rule's exact boundaries or priority. Treat it as implementation-derived pending broader docs/tests.
- Expected order is email replacement, then phone replacement, then PESEL replacement as observed in source. No public evidence found here that makes replacement priority an external compatibility promise.
- Domain: JavaScript strings. Termination/performance is outside partial-correctness claims.

No external issue/prompt describing `redact` was present in the supplied task. This intent is inferred from public code names, docs and tests. That evidence is insufficient to specify the complete JavaScript regular-expression semantics.
