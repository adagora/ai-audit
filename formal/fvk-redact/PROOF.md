# `/verify` result: unresolved

Status: **invalid/unresolved FVK proof attempt; no correctness proof constructed**.

The target's behavior is defined by JavaScript regular expressions. The kit requires a mini-language semantics faithful to the target and K reachability claims. This trial does not define those regex semantics, so the empty claim module is not a proof and cannot justify `redact` correctness. No `kompile` or `kprove` result is claimed. `kompile`/`kprove` are not installed in this environment.

## Findings and tests

See `FINDINGS.md`. Keep all existing `redact` tests, including the performance/fuzz case. There is no test-removal recommendation because no claim was proved.

## Next step to make this a proof

Use a verified JavaScript/K semantics with regex support, or isolate the regex recognizer behind a separately specified and verified implementation whose equivalence to JavaScript regex behavior is established. Clarify the intended PESEL boundaries and overlap/priority behavior from public requirements.
