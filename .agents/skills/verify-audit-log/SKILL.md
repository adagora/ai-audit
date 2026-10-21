---
name: verify-audit-log
description: Formal check (TLA+/TLC + regression tests) of the audit log hash chain under several writer processes and of the proxy request lifecycle (one record per request, fail closed when the log is unavailable, no write-after-end crash, unknown usage never zero). Use before merging any change to AuditLog append/lastHash/anchor or to the createProxy request handler, and when a test or report shows a forked chain, a missing record or a proxy crash.
---

# Verify the audit log and request lifecycle

## What is verified
| Property (TLA+ name) | Plain sentence | Harm if broken |
|---|---|---|
| ChainIntact, NoLostEntries (`spec/AuditChain.tla`) | With any number of writer processes, every record's `prevHash` is the hash of the line before it and no append is lost. | `ai-audit verify` reports a broken chain; the log stops being evidence. |
| AnchorsConsistent | Every anchor `{count, head}` matches the record at that position. | Anchors falsely flag (or miss) a swapped log. |
| AtMostOneLog, NeverZeroWhenUnseen (`spec/RequestLifecycle.tla`) | A request writes at most one record, and usage is recorded only when the provider sent it (ADR 0009, 0012). | Double counting, or totals that look complete but are not. |
| NoForwardOnBadLog | A request is never forwarded while the log is already unwritable or torn. | Calls go upstream with no audit record. |
| NoCrash, NeverSilent | A failed append never crashes the process; every request ends logged or counted as a failure. | Proxy dies (all clients drop); records lost without trace. |
| NoForwardWithoutLog (residual cfg, expected to FAIL) | Strict: anything delivered is also logged. Not guaranteed: the log can break after the last check (ADR 0016). | Known, counted by `metrics.logWriteFailures`. |

Bounds: AuditChain 3 writer processes x 2 appends + 2 anchors (~37k distinct states). RequestLifecycle: one request with client close, timeout, usage chunk and the log breaking at any step (48 distinct states). Not covered: the stale-lock takeover race (>10 s stall), network filesystems, attachments, routing, stats math.

## Coverage record (sync commit: 15b9985)
- `src/audit.ts`: `AuditLog.withLock`, `AuditLog.lastHash`, `AuditLog.ensureWritable`, `AuditLog.append`, `anchor`, `AuditLogUnavailable`
- `src/proxy.ts`: `createProxy` handler: `ensureWritable` checks before step 2 and step 3, `reject`, `write`, the final `write(...)` after `pipe`, the outer `catch` (`res.writableEnded` guard), `logUnavailable`
- `src/extract.ts`: `extract` usage fields (only set when reported)
- Tests tied to the models: `test/logsafety.test.ts`, `test/audit.test.ts`

Does my change touch this? Run `git diff 15b9985 -- src/audit.ts src/proxy.ts src/extract.ts`. If any listed function changed, run the check and re-read the matching model actions.

## Run
`npm run verify:formal` (needs Java 11+ on PATH or `JAVA=/path/to/java`; downloads tla2tools v1.8.0 to `~/.cache` on first run, or set `TLA2TOOLS_JAR`). About 15 s.
Expected: six `ok` lines from `spec/run.sh` (2 pass configs, 4 configs that must FAIL: `AuditChain_nolock`, `RequestLifecycle_noguard`, `RequestLifecycle_noprecheck`, `RequestLifecycle_residual`), then the node tests all passing.

## Reading a failure
- `FAIL spec/...cfg: expected pass, got fail`: TLC prints a trace. Map each step to the code: `ReadTail` = lock + `lastHash()`, `Write` = `appendFileSync` + unlock, `Check` = `ensureWritable()`, `DoWrite` = `o.log.append` in `write`, `LogGoesBad` = torn line/disk full. If the trace can happen in the code, it is a bug: write a failing test in `test/logsafety.test.ts` before fixing.
- `expected fail, got pass` on a mutant cfg: the model lost its teeth (an action changed so the bad variant no longer differs). Fix the model, not the cfg.
- `got error`: TLA+ syntax or a type error in the model. Modeling error, not a product bug.
- A node test failing: real-code regression; the model can still pass because it only abstracts the code.

## When the change is intended
Update the model action that mirrors the changed code (keep one model step = one indivisible step in the code: within one Node process each `append` is synchronous; across processes only the lock makes read+write atomic). Keep the mutant cfgs failing. Rerun, then move the sync commit above to the new HEAD only after you have checked that every listed function still matches its model action.
