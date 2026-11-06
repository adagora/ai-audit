# Fresh and uncontradicted evidence

`npm run example:evidence` drives actual CLI processes through three synthetic cases, records decisions in a temporary audit log, replays them, and exports/verifies both JSON and SVG receipts. The command prints the output directory so you can inspect and share the synthetic receipts.

The policy requires two named sources reporting that a release is eligible. It accepts observation records only, with age at most 100 ticks and revision at least 2, relative to the explicitly supplied clock at tick 1000.

| Case | Evidence result | Two-source guard | Simulated action |
|---|---|---|---|
| current | Two current positive sources | true | simulated |
| stale | One current positive source; the other is too old | false | skipped |
| conflict | One current positive and one current negative source | false | skipped |

The result retains used observations, skipped observations with reasons, per-source support/refutation counts and same-source contradictions. An unknown value is not a negative vote. Repeated reports from one source do not count as two independent sources. Contradictions are preserved rather than resolved by a majority.

The policy is version 2. Its receipts are version 3 and bind the exact compiled interpreter implementation. A matching trusted build is required for verification. A code change is rejected even when it would return the same result for this case.

The clock, source names and observations are supplied by the host application; the interpreter does not authenticate them. Freshness is evaluated at the recorded decision time, not when someone opens the receipt later. Actions are data only and release nothing. Authenticated collection, approvals and actual execution remain application responsibilities.
