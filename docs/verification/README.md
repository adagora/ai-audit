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
Run: `npm run verify:bend` (needs Bend 2.0.38 on PATH). Code `bend/context.bend` (token split, ADR 0017), `bend/arena.bend` (arena ages, first change and runs, ADR 0020), `bend/usage.bend` (turn tokens, the provider-cache-drop signal and report totals, ADR 0012 and ADR 0020) `bend/spans.bend` (the merge of overlapping finding spans before redaction, ADR 0007) and `bend/parts.bend` (which spans are removed from the joined text when a message has several text parts, ADR 0007), laws `bend/LAWS.bend`, proofs `bend/PROOF.bend`, runner `bend/run.sh`. The committed `src/bend/*.mjs` must match the code; `bash bend/run.sh --write` regenerates them.

| Check | Expected | Result |
|---|---|---|
| Laws in LAWS.bend: the split sums to the provider total; each part is its floor, or one more only when the share is not whole; an empty segment gets 0; leftover tokens go to the largest remainders, ties to the earlier segment | pass | ALL PROOFS CHECK |
| Laws in LAWS.bend: the first change is where the hashes first differ inside the previous request, and its offset is the bytes before it; ages keep the unchanged prefix, the rest is the current turn; the runs keep every byte with its kind and age; the runs merge neighbours of one kind and age, and the first changed block starts a new run | pass | ALL PROOFS CHECK |
| Laws in LAWS.bend: unknown input stays unknown, never 0; a provider cache drop is reported only when the previous prompt and the current cache read are known, the expected prefix is at least 1,024 tokens and the cache read is below half of it; report totals add known counts and count unknown ones apart | pass | ALL PROOFS CHECK |
| Laws in LAWS.bend: when the finding spans are sorted by start, every byte inside a finding is inside a merged span; every byte inside a merged span is inside a finding; merged spans do not overlap | pass | ALL PROOFS CHECK |
| Laws in LAWS.bend: the result keeps every span in order; a span whose match crosses a part boundary is taken; no untaken match touches a taken span; nothing else is taken (the result is below every set with those two properties); the fast version gives the same marks | pass | ALL PROOFS CHECK |
| `--verdict` (Lean-checked kernel) | pass | skipped, Lean v4.34.0 not installed |

Each mutant must fail `PROOF.bend`, and its counterexample in `bend/stops/` must check against the mutant and fail against the real code. A failing proof alone can come from the proof's wording; the counterexample shows that a named law rejects the mutant's output.

| Mutant | Change | Counterexample breaks | At |
|---|---|---|---|
| leftover | one leftover token too many | `split_sums_to_provider` | p=1, sizes [1, 1] |
| double-bump | a raised share gets two tokens | `split_rounds_each_share` | p=1, sizes [1, 1] |
| empty-segment | an empty segment competes for a leftover token | `split_gives_empty_none`, `split_rounds_each_share` | p=1, sizes [0, 1, 1] |
| tie-to-later | a tie goes to the later segment | `split_leftover_to_largest_remainders` | p=1, sizes [1, 1] |
| smallest-first | the smallest remainder gets the leftover token | `split_leftover_to_largest_remainders` | p=1, sizes [1, 2] |
| first-shifted | a rewrite is reported one block late | `arena_first_change_is_the_first_difference` | previous [0], blocks [1] |
| offset-skips | the offset leaves out the unchanged blocks | `arena_first_change_is_the_first_difference` | previous [0, 0], blocks [0 (5 bytes), 1] |
| ages-reset | an unchanged block gets the current turn | `arena_ages_keep_the_unchanged_prefix` | previous [0 age 1], blocks [0], turn 2 |
| bytes-lost | merging two blocks keeps only the first one's bytes | `arena_runs_keep_every_byte_with_its_kind_and_age` | blocks [3 bytes, 4 bytes] of one kind and age |
| kind-lost | every run gets kind 0 | `arena_runs_keep_every_byte_with_its_kind_and_age` | one user block of 1 byte |
| age-lost | every run gets age 0 | `arena_runs_keep_every_byte_with_its_kind_and_age` | one user block of 1 byte, turn 1 |
| never-merge | every block gets its own run | `arena_runs_merge_neighbours_of_one_kind_and_age` | blocks [3 bytes, 4 bytes] of one kind and age |
| merge-across-change | the first changed block joins the run before it | `arena_runs_merge_neighbours_of_one_kind_and_age` | previous [0 age 2, 5 age 2], blocks [0, 1], turn 2 |
| unknown-as-zero | unknown input becomes 0 tokens | `usage_unknown_input_stays_unknown` | OpenAI, no counts |
| threshold-off | the 1,024-token minimum becomes 1,023 | `usage_cache_drop_only_from_evidence` | previous prompt 1,023, cache read 0 |
| half-wrong | "below half of the prefix" becomes "below the prefix" | `usage_cache_drop_only_from_evidence` | previous prompt 2,000, cache read 1,500 |
| unknown-not-counted | a billed call with unknown input is not counted as unknown | `usage_totals_count_unknown_apart` | one billed call without input |
| lost-extension | an absorbed span does not extend its group, so the tail of a secret survives | `spans_mask_every_finding_byte` | spans [0, 3) and [2, 6), byte 4 |
| over-mask | a new group masks one byte past its span | `spans_mask_only_finding_bytes` | span [0, 3), byte 3 |
| overlap-opens | a new group opens while the spans still overlap | `spans_groups_are_apart` | spans [0, 4) and [2, 6) |
| crossing-missed | the walk ignores the boundaries after a span's start | `parts_take_every_span_whose_match_crosses_a_part` | boundary 5, span [3, 8) |
| touch-ignored | the backward pass never takes a span | `parts_untaken_matches_touch_no_taken_span` | boundary 6, spans [0, 2) with match [0, 5) and [4, 8) |
| over-take | every span is taken | `parts_take_no_span_that_crossings_do_not_force` | no boundary, span [0, 2) |
| fast-skips-closure | the fast version never runs the closure | `parts_fast_version_gives_the_same_marks` | boundary 6, spans [0, 2) with match [0, 5) and [4, 8) |
| fast-backward-blind | the fast backward pass never takes a span | `parts_fast_version_gives_the_same_marks` | boundary 6, spans [0, 2) with match [0, 5) and [4, 8) |

The empty-segment counterexample fails against the earlier quota law, which allowed one more token for a whole share. The tie-to-later and smallest-first mutants satisfy the first three laws; only the fourth rejects them. An earlier `zero-remainder` mutant added 1 to every remainder; it changed 0 of 28,125 outputs and has no counterexample, so it was removed.

The four laws together fix the split: the sum fixes how many segments get one more token, the quota law limits them to shares that are not whole, and the fourth law makes them the largest remainders. `test/laws.test.ts` still compares the generated JavaScript with an exact-integer reference, because a proof covers the Bend code, not the JS backend.

The arena laws fix the first change and the ages (a TypeScript translation of the first-change law accepts exactly one answer on 10,360 small inputs) and the kind and age of every byte in the runs. A first version of the runs law counted bytes only and accepted runs with a wrong kind or age (the kind-lost mutant passed it on 5,004 of 5,004 inputs). The per-byte law cannot see where runs split or a run of 0 bytes (a message with content `""`): the never-merge and merge-across-change mutants gave wrong runs on 4,515 and 60 of 20,004 inputs and passed it. `arena_runs_merge_neighbours_of_one_kind_and_age` closes that: `ExpectedRuns` walks the blocks with one open run, adds a block of the same kind and age unless it is the first changed block, and otherwise closes the run; it gives the original runs on 20,004 of 20,004 inputs. With it the laws fix the whole arena output. `test/arena.test.ts` still checks the generated JavaScript with 504 goldens captured from the TypeScript arena (`test/fixtures/arena-goldens.json`, written once by `test/fixtures/capture-arena-goldens.ts`) and with the TypeScript arena kept as a reference in `test/arenaReference.ts`. In the generated JavaScript, a call that is not in tail position overflows the stack below 10,000 list elements, so every loop in `arena.bend` is a tail call; the reference test includes a request of 200,000 blocks.

The usage laws are mostly the ADR 0012 and ADR 0020 rules written out; `CacheDropped` states the rule in the ADR's order, so its proof is not a computation of both sides. Before the port, `ai-audit report`, `stats` and the session view counted any finite number as a known token count: a record with input `-400` lowered the total and was reported complete. They now use the log writer's rule (`tokenCount`). At the Bend boundary a count above 2^48-1 (281 trillion tokens, which no provider reports) is unknown; the TypeScript counted it. `test/usageCore.test.ts` replays 300 goldens captured from the repaired TypeScript (`test/fixtures/usage-goldens.json`), compares with the TypeScript kept in `test/usageReference.ts` on 20,000 generated inputs and a log of 200,000 calls, and pins the 2^48-1 limit.

The span laws cover the step between the regex rules and `redactText`: `mergeSpans` in `src/scan.ts` sorts the spans with JavaScript's stable sort (start ascending, end descending) and Bend merges them. Only the first law needs the sorted order, and it states it as a premise; the other two hold for any order. The regex rules and the text assembly stay in TypeScript, and no string enters Bend. For the first two laws, each counterexample in `bend/stops/` also proves the law's premises for the bad case, so it refutes a whole instance of the law. `test/spans.test.ts` replays 404 goldens captured from the TypeScript merge (`test/fixtures/span-goldens.json`), compares with the TypeScript kept in `test/spanReference.ts` on 20,000 generated inputs and on 50,000 spans of one string, and the fuzz harnesses for masking still pass. The merge costs about 0.05 µs more per string without findings, under 1% of `inspect()`.

The cross-part laws cover `takenAcrossParts` in `src/scan.ts`. When an array has two or more text parts, the scanner joins them and scans the joined text; a span whose match crosses a part boundary is removed from the parts directly, and so is any span whose match touches a removed span (its regex context is gone after the removal, so a scan of one part could miss it). The other spans are left to the scan of each part. The four laws fix the result: the spans that cross are taken, the taken set is closed under "touches", and it is the smallest such set. The premises are that the boundaries are sorted and that the spans are apart and each inside its match, which `mergeSpans` and the regex groups give. Bend finds the crossing spans in one merge walk over the boundaries, with no search; the closure runs a backward and a forward pass until a round takes nothing, and the count of untaken spans bounds the rounds. In the worst case (a chain where each span touches only the one taken before it) this needs one round per span, as the TypeScript loop did: 2,000 such spans take about 60 ms in both. `test/crossParts.test.ts` replays 405 goldens captured from the TypeScript closure (`test/fixtures/cross-goldens.json`) and compares with the TypeScript kept in `test/crossReference.ts` on 20,000 generated inputs, 100,000 spans and a 300-span chain.
