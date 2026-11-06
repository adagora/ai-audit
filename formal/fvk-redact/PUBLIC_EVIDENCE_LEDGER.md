# Public evidence ledger

| Source | Evidence | Obligation | Status |
|---|---|---|---|
| `test/audit.test.ts` | `redact("mail jan.kowalski@firma.pl, tel +48 601 234 567")` equals `"mail [EMAIL], tel [PHONE]"` | Replace these email/phone examples and preserve surrounding text | Encoded as example only; does not define all matches |
| `test/fuzz.test.ts` | Long strings complete under one second; same email/phone example | Performance on listed inputs and example replacements | Keep; not covered by partial correctness |
| `src/audit.ts` | Three sequential `String.replace` calls for email, phone, PESEL | Implementation evidence for patterns and ordering | Candidate behavior only; regex matching semantics unresolved |
| User prompt | Requested trying FVK on ai-audit | Produce an experimental formalization/verification pass | Scope is this bounded representative target |
