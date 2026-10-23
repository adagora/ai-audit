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
| Laws in LAWS.bend: the split sums to the provider total; each part is its floor, or one more only when the share is not whole; an empty segment gets 0; leftover tokens go to the largest remainders, ties to the earlier segment | pass | ALL PROOFS CHECK |
| `--verdict` (Lean-checked kernel) | pass | skipped, Lean v4.34.0 not installed |

Each mutant must fail `PROOF.bend`, and its counterexample in `bend/stops/` must check against the mutant and fail against the real code. A failing proof alone can come from the proof's wording; the counterexample shows that a named law rejects the mutant's output.

| Mutant | Change | Counterexample breaks | At |
|---|---|---|---|
| leftover | one leftover token too many | `split_sums_to_provider` | p=1, sizes [1, 1] |
| double-bump | a raised share gets two tokens | `split_rounds_each_share` | p=1, sizes [1, 1] |
| empty-segment | an empty segment competes for a leftover token | `split_gives_empty_none`, `split_rounds_each_share` | p=1, sizes [0, 1, 1] |
| tie-to-later | a tie goes to the later segment | `split_leftover_to_largest_remainders` | p=1, sizes [1, 1] |
| smallest-first | the smallest remainder gets the leftover token | `split_leftover_to_largest_remainders` | p=1, sizes [1, 2] |

The empty-segment counterexample fails against the earlier quota law, which allowed one more token for a whole share. The tie-to-later and smallest-first mutants satisfy the first three laws; only the fourth rejects them. An earlier `zero-remainder` mutant added 1 to every remainder; it changed 0 of 28,125 outputs and has no counterexample, so it was removed.

The four laws together fix the split: the sum fixes how many segments get one more token, the quota law limits them to shares that are not whole, and the fourth law makes them the largest remainders. `test/laws.test.ts` still compares the generated JavaScript with an exact-integer reference, because a proof covers the Bend code, not the JS backend.
