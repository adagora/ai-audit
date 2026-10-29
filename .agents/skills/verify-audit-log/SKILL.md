---
name: verify-audit-log
description: Formal check (TLA+/TLC + regression tests) of the audit log hash chain under several writer processes, with log rotation into segments, prune, anchors and crashes, and of the proxy request lifecycle (one record per request, fail closed when the log is unavailable, no write-after-end crash, every error counted or recorded, no refusal for a forwarded call, unknown usage never zero). Use before merging any change to AuditLog append/lastHash/rotate/startSegment, prune, anchor or verifyAnchors, to the createProxy request handler or its outer catch, or to code that writes log records (src/qdl.ts, src/console.ts, CLI decide/approve/effect/rotate/prune), and when a test or report shows a broken series, a false anchor alarm, a missing record or a proxy crash.
---

# Verify the audit log and request lifecycle

## What is verified
| Property (TLA+ name) | Plain sentence | Harm if broken |
|---|---|---|
| ChainIntact (`spec/AuditChain.tla`) | With several writer processes, rotation, one crash and one prune at any step, `checkSeries` accepts the files in `files()` order: each file chains from genesis, each file after the first starts with a `segment` record that links to the file before it, and a missing first predecessor is listed by a `prune` record. | `ai-audit verify` reports a broken series; the log stops being evidence. |
| NoLostEntries | Every appended record is in a present file or in a segment that prune deleted. | Records vanish without a prune record. |
| AnchorsConsistent | `verifyAnchors` accepts every anchor: it matches a record at its position in some file, or it is older than the first remaining segment after a prune. | Anchors falsely flag (or miss) a swapped log. |
| AtMostOneLog, NeverZeroWhenUnseen (`spec/RequestLifecycle.tla`) | A request writes at most one record, `llm-call` or `refusal`, and usage is recorded only when the provider sent it (ADR 0009, 0012, 0047). | Double counting, or totals that look complete but are not. |
| NoForwardOnBadLog | A request is never forwarded while the log is already unwritable or torn. | Calls go upstream with no audit record. |
| NoCrash, NeverSilent | A failed append never crashes the process; every request ends with a record or a counted failure, also when an error that is not a log failure is thrown before or after forwarding (e941677, fc88731). | Proxy dies (all clients drop); records lost without trace. |
| NoRefusalAfterForward | An error after the provider answered is counted as a lost record, never written as a refusal. | The log says "refused 500" for a call the provider answered. |
| NoForwardWithoutLog (residual cfg, expected to FAIL) | Strict: anything delivered is also logged. Not guaranteed: the log can break, or the disk can fill, after the last check (ADR 0016). | Known, counted by `metrics.logWriteFailures`. |

Bounds: AuditChain 2 writer processes x 2 appends, rotation when the current file holds 2 records, one crash of a writer or of prune, one prune of any oldest run of closed segments, 2 anchors (94,139 distinct states, about 3 s). At f6b1865 the same model also passed with 3 writer processes (28,157,528 distinct states, 471 s, run by hand, not in CI). RequestLifecycle: one request with client close, timeout, usage chunk, the log going bad, the disk filling, and one internal error at any step (148 distinct states). The laws in `test/laws.test.ts` add 90 generated requests through the proxy (three APIs, all modes, some with Quinelings tool calls and results) and 300 tampered logs.

Assumptions:
- AuditChain gives every timestamp its own millisecond and a clock that only moves forward, except in the two `clockback` configs. Findings 3 and 4 are what happens without it.
- AuditChain treats the write of the first `segment` record as one step, except in `AuditChain_emptysegment.cfg`. Finding 5 is what happens without it.
- The budget `count_tokens` call (ADR 0044) is not a forward. ADR 0009 scans `count_tokens` and does not log it, so it can reach the provider between the two `ensureWritable()` checks.

Not covered: the stale-lock takeover race (>10 s stall of a live holder; a dead holder is the `Crash` action), network filesystems, power loss without fsync, a lock-free `verify` that reads a partly written last line, the refusal rate limit (suppressed refusals are counted in one later record), attachments, routing, stats math, the order of a QDL decision's `program`, decision and `:qdl` records relative to other writers (each append is atomic; the group is not, which ADR 0026 accepts), and the decision loop of ADR 0055 (`approve`/`effect` read the log without the lock, then append; a prune between the two can leave an `effect` whose decision is gone).

## Open findings (not fixed; product code unchanged)
`spec/run.sh` prints these as `ok ... open finding`. When a fix lands, the config passes and `spec/run.sh` fails until its line says `pass`. Details and replays: `docs/verification/README.md`, findings 3 to 5.
- `AuditChain_clockback.cfg`: segment names come from `now()`; a clock step back makes `closedSegments()` order wrong and `startSegment` link to the wrong file.
- `AuditChain_clockback_anchors.cfg`: `verifyAnchors` reports `swapped` for an anchor of a pruned segment taken in the same millisecond as the rotation, or before a clock step back.
- `AuditChain_emptysegment.cfg`: a kill between the open and the write in `startSegment` leaves an empty current file, and the next append starts it without a link.

## Coverage record (sync commit: f6b1865)
- `src/audit.ts`: `AuditLog.withLock`, `AuditLog.lastHash`, `AuditLog.ensureWritable`, `AuditLog.append` (the `rotateBytes` check and the `startSegment` call for a missing current file), `AuditLog.rotate`, `AuditLog.rotateLocked`, `AuditLog.startSegment`, `AuditLog.closedSegments`, `AuditLog.files`, `checkSeries`, `prune`, `anchor`, `verifyAnchors`, `AuditLogUnavailable`
- `src/proxy.ts`: `createProxy` handler: `ensureWritable` checks before step 2 and step 3, `refuse`/`recordRefusal`/`appendRefusal`, `reject`, `write`, the block and budget-reject `write`, the fetch catch, `forwarded = true` after the fetch, the final `write(...)` after `pipe` or `pipeGated`, the outer `catch` (`AuditLogUnavailable || forwarded`, the refusal for an internal error, `res.writableEnded` guard), `logUnavailable`, and `observe(...)`, which adds Quinelings events to each of those records (ADR 0024)
- `src/extract.ts`: `extract` usage fields (only set when reported)
- Other writers of the chain, each a writer process in AuditChain, all through `AuditLog.append`: `src/qdl.ts` (`program`, decision and `:qdl` step records, ADR 0023 and 0026), `src/console.ts` (`approve`), and the CLI `decide`, `approve`, `effect`, `rotate` and `prune`
- Tests tied to the models: `test/logsafety.test.ts`, `test/audit.test.ts`, `test/qdl.test.ts` (new writers keep the chain), `test/laws.test.ts` (one record per request, also with Quinelings traffic; no planted secret in the log; any tampering fails verification), `test/segments.test.ts` (rotation, restart of a missing current file, prune, anchors across segments), `test/refusals.test.ts` (an internal error before forwarding leaves one refusal)

Does my change touch this? Run `git diff f6b1865 -- src/audit.ts src/proxy.ts src/extract.ts src/qdl.ts src/console.ts src/cli.ts`. If any listed function changed, or new code calls `append`/`record`/`approve`/`effect`/`rotate`/`prune`, run the check and re-read the matching model actions.

## Run
`npm run verify:formal` (needs Java 11+ on PATH or `JAVA=/path/to/java`; downloads tla2tools v1.8.0 to `~/.cache` on first run, or set `TLA2TOOLS_JAR`). About 20 s.
Expected: thirteen `ok` lines from `spec/run.sh` (2 pass configs, 8 configs that must FAIL on the invariant named in `spec/run.sh`, 3 `open finding` configs), then 42 node tests passing (the QDL tests skip below Node 22). Distinct state counts of failing configs change from run to run because TLC runs several workers; the verdict and the broken invariant do not.

Proof that the tied tests still bite, checked at f6b1865: no `startSegment` call for a missing current file in `append` fails `test/segments.test.ts`; an outer catch without `|| forwarded` fails the `logsafety` test "an error after forwarding that is not a log failure ..." (added at this check; before it, no test caught that break); an outer catch without the refusal for an internal error fails `test/refusals.test.ts`. A `prune` that unlinks before it appends its record passes every test; only `AuditChain_unlinkfirst.cfg` catches it. Checked at 9a3188e: a break where `observe(...)` writes an extra record per request fails the proxy law in `test/laws.test.ts`; a break where `src/qdl.ts` writes its `program` record around `append` fails `test/qdl.test.ts`.

## Reading a failure
- `FAIL spec/...cfg: expected pass, got fail`: TLC prints a trace. Map each AuditChain step to the code: `Acquire` = `withLock` takes the lock file; `Rotate` = the `rotateBytes` check and `renameSync` in `rotateLocked` (a name that exists is `Fail`); `Check` = the missing-file test before `startSegment` in `append`; `StartSegment` (and `Fill` in the emptysegment config) = `startSegment` reads the newest closed segment and writes the `segment` record; `ReadTail` = `lastHash()`; `Write` = `appendFileSync` and unlock; `Crash` = the process dies inside `withLock`, and the next writer takes the stale lock; `PruneRead` = `prune` lists the old segments without the lock; `PruneRecord` = its `log.append`; `PruneUnlink` = one `unlinkSync`; `AnchorRead`/`AnchorWrite` = `anchor()` reads the current file, then appends to the anchors file; `ClockStepBack` = the wall clock moves back. RequestLifecycle: `Start` and `Forward` = the two `ensureWritable()` checks; `BlockOrReject` = `reject()`, the block `write` or the budget-reject `write`; `FetchErr` = the fetch catch; `Headers` = `forwarded = true`; `Final` = the `write(...)` after the response; `InternalError` = any other throw; `Catch` = the outer `catch`; `LogGoesBad` = torn line or unwritable file; `DiskFills` = `appendFileSync` throws `ENOSPC`, which `ensureWritable()` cannot see. If the trace can happen in the code, it is a bug: write a failing test in `test/logsafety.test.ts` or `test/segments.test.ts` before fixing.
- `expected fail, got pass` on a mutant cfg: the model lost its teeth (an action changed so the bad variant no longer differs). Fix the model, not the cfg.
- `expected finding, got pass`: a fix for that open finding landed. Replay the old trace against the code, then change the line in `spec/run.sh` to `pass` and move the finding in `docs/verification/README.md` to the fixed list.
- `expected fail on X, got fail ... Y`: the mutant breaks another rule first. Read the trace before you change the expectation.
- `got error`: TLA+ syntax or a type error in the model. Modeling error, not a product bug.
- A node test failing: real-code regression; the model can still pass because it only abstracts the code. A law in `test/laws.test.ts` prints the generated counterexample (the request or log it used); the generators are seeded, so the same case comes back on every run.

## When the change is intended
Update the model action that mirrors the changed code. Keep one model step = one indivisible step in the code: within one Node process each `append` is synchronous; across processes only the lock makes read and write atomic; `prune` lists, deletes and the `verify` and `anchor` commands read without the lock. Keep the mutant cfgs failing. Rerun, then move the sync commit above to the new HEAD only after you have checked that every listed function still matches its model action.
