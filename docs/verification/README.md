# Formal verification (TLA+ / TLC, Bend 2)

Run: `npm run verify:formal`. Procedure, coverage and sync commit: `.agents/skills/verify-audit-log/SKILL.md`.
Specs `spec/AuditChain.tla`, `spec/RequestLifecycle.tla`; configs `spec/*.cfg`; runner `spec/run.sh` (tla2tools v1.8.0).
Statecharts: `audit-chain.mmd/.png`, `request-lifecycle.mmd/.png` (code after ADR 0016).

## Why TLA+
The questions were about the order of steps between processes and between a request and its environment (client close, timeout, log breaking). That is a model checker's job. Each model is paired with regression tests that run the real code, so a code change that breaks a property fails `verify:formal`.

## Findings (both fixed)
1. Chain fork with two writer processes. Trace: A reads tail, B reads tail, A appends, B appends with the same prevHash. Reproduced: 2 processes x 300 appends, `verifyChain` = prevHash mismatch at line 83. Fixed by a lock file (commit 17ca7c9).
2. Torn last line: the response was delivered, nothing was logged, and `fail()` after `res.end()` crashed the process. Fixed by fail-closed checks and a write-after-end guard (commit 15b9985, ADR 0016).

## Results at 15b9985
| Config | Expected | Result |
|---|---|---|
| AuditChain.cfg (3 writers x 2, lock) | pass | pass, 36,969 distinct states |
| AuditChain_nolock.cfg | fail | ChainIntact violated |
| RequestLifecycle.cfg | pass | pass, 48 distinct states |
| RequestLifecycle_noguard.cfg | fail | NoCrash violated |
| RequestLifecycle_noprecheck.cfg | fail | NoForwardOnBadLog violated |
| RequestLifecycle_residual.cfg | fail | NoForwardWithoutLog violated (known window, ADR 0016) |

Real-code mutations caught by `verify:formal`: append without `withLock` (multi-process test fails), outer catch without `res.writableEnded` (late-failure test fails), both `ensureWritable()` checks removed (torn-tail 503 test fails).

Not modelled: attachment cache vs inspection profile (reviewed: key includes `profile.id`, profile frozen per instance; no stale path).

## Proofs in Bend 2 (ADR 0029)
Run: `npm run verify:bend` (needs Bend 2.0.38 on PATH). Code `bend/context.bend`, laws `bend/LAWS.bend`, proofs `bend/PROOF.bend`, runner `bend/run.sh`. The committed `src/bend/context.mjs` must match the code; `bash bend/run.sh --write` regenerates it.

| Check | Expected | Result |
|---|---|---|
| Laws in LAWS.bend: the split sums to the provider total; each part is its floor, or one more only when the share is not whole; an empty segment gets 0 | pass | ALL PROOFS CHECK, 0.2 s |
| Mutant: one leftover token too many | fail | fail |
| Mutant: a raised share gets two tokens | fail | fail |
| Mutant: an exact share gets a remainder | fail | fail |
| `--verdict` (Lean-checked kernel) | pass | skipped, Lean v4.34.0 not installed |

Not proved: which segments get the leftover tokens (largest remainder, ties to the earlier segment). `test/laws.test.ts` checks it against an exact-integer reference.
