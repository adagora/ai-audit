# 29. Pure functions with proved laws are written in Bend 2 and shipped as generated JavaScript
Status: Accepted (2026-10-23). Supersedes the "TypeScript only" part of [0001](0001-typescript-zero-runtime-deps.md) for the modules under `bend/`.
## Context
Some pure functions carry rules that the log's readers rely on: the token split of ADR 0017 must add up exactly to the provider total. Today such rules are tested on generated inputs (`test/laws.test.ts`) but not proved. Bend 2 checks proofs of stated laws and compiles a file to an ES module that Node imports without Bun or any runtime package. A spike on Bend 2.0.38 ported `scaleToProvider`:
- Three laws in `bend/LAWS.bend`, proved in `bend/PROOF.bend` (767 lines, checked in 0.2 s): the parts sum to the provider total; each part is the floor of its exact share, or one more only when that share is not whole; a segment with no bytes gets no tokens. Three mutated versions of the code fail the check.
- The module loads on Node 24 and 26 and is 1.5 µs per call (the float version was 1.6 µs). Lists and constructors cross as `{$: "Con", head, tail}`, `Nat` as a number.
- Limits found: a `Nat` above 2^48−1 throws a string; lone UTF-16 surrogates become U+FFFD on input; non-tail recursion over a 64 KiB string overflows the JS stack; building a string char by char is about 7× slower than a regex replace (132 ms per MiB).
## Decision
- A pure function moves to Bend only with its laws written first in `bend/LAWS.bend`. Its TS tests stay; whatever the laws leave open (here, which segments get the leftover tokens) keeps a differential test against a TS reference.
- The generated module is committed under `src/bend/` and never edited by hand. `npm run build`, the image and `npm install` do not need Bend.
- Bend is pinned to 2.0.38, installed with the official script (it checks the archive's sha256). `npm run verify:bend` refuses other versions, requires ALL PROOFS CHECK, requires the mutants to fail and the committed module to match the source. Upgrades are deliberate.
- TypeScript keeps I/O, parsing and range checks: it calls Bend only with non-negative integers whose products stay below 2^48.
- String-heavy code (scanning, masking, extraction) stays in TypeScript until a measured port shows the cost is acceptable.
## Consequences
- Exact arithmetic changes ties: a leftover token now goes to the earlier segment. The float version broke ties by rounding noise; 375 of 90,519 test inputs differ by one token between two segments.
- When provider tokens × text bytes exceeds 2^48−1, `tokenBasis` stays `"unknown"`. With the default 32 MiB body cap, up to 8,388,607 prompt tokens are still scaled.
- Reviewers read Bend for these modules. The generated file keeps the compiler's own section comments.
- `bend PROOF.bend --verdict` (the Lean-checked kernel) needs Lean v4.34.0, which is not installed yet; the gate skips it and says so.
- Bend 2 is young ("Expect bugs"); a proof covers the code as the checker reads it, not the compiler or the JS backend. The TS tests run against the generated module for that reason.
