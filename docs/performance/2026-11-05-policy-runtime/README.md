# Policy interpreter measurement

This comparison was captured before the SDK was removed under ADR 0071. `npm run bench:policy` now measures the native interpreter only; it does not reinstall QDL. [results.json](results.json) retains the local measurement: Node 26.8.1, macOS, arm64. This Node version is below the repository's declared minimum for the Node 26 line; the supported Node matrix still needs CI validation.

Both real interpreters evaluate the same machining facts and must return the expected price of 394. Each uses recovered source in a fresh session, ten warmups and 100 unique request IDs. No model or mock interpreter participates. The measured scope excludes log writes, CLI startup and model calls. Runtime selection timing is not a cold-process startup benchmark.

| Runtime | Evaluation median | Evaluation p95 | Source bytes |
|---|---:|---:|---:|
| Vendored QDL v1 | 10.822 ms | 11.748 ms | 17,243 |
| Native policy v1 | 0.166 ms | 0.216 ms | 2,137 |

The native median was approximately 65 times faster on this policy in this run. This does not establish a general speedup for all policies or the proxy; QDL was never on the ordinary request path. Compile and recovery timings in the JSON are single observations, not distributions. No memory benchmark was performed.

After the native-only development cleanup, [native-only.json](native-only.json) records the current policy with public rationale metadata: median 0.182 ms and p95 0.322 ms over 100 measured runs. The SDK was absent during that measurement.
