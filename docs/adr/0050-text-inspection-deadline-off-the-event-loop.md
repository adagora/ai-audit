# 50. Large request texts are inspected in a worker with a deadline
Status: Accepted (2026-10-29). Extends [0009](0009-inspect-whole-request.md) and [0016](0016-fail-closed-when-log-unavailable.md).
## Context
`inspect()` runs on the proxy's only event loop. Ordinary text costs about 26 ms per MiB on an M1, so a 32 MiB body holds every other request for about 0.8 s. Some repeated shapes cost far more, all linear but with a large constant: `a` repeated before ` @` (email rule) 365 ms per MiB, `%` before ` @` 239 ms, `a:` before `@tcp(` (Go DSN rule) 468 ms, and up to 743 ms when the same text is split into two content parts. A 32 MiB body of one of them stops the proxy for 8 to 24 s. Every rule tries a bounded window (64 or 256 characters) at each start position; rewriting rules one by one would need a proof of equal matches for each. A JavaScript regular expression cannot be stopped once it runs. The fuzz speed rule accepted up to 1 s per 64 KiB, which allows this.
## Decision
- When the strings to scan in a request add up to more than 256 KiB, `inspect()` runs in a pool of `node:worker_threads` workers, at most `min(4, CPUs - 1)`. Smaller requests stay on the main thread; at the measured worst of 743 ms per MiB, 256 KiB costs at most about 0.2 s on an M1.
- Each worker inspection has a deadline, `--inspect-timeout-ms`, default 5,000. At the deadline the worker is terminated and replaced. The request is refused before forwarding with 422 `audit_inspection_timeout` and recorded as an `llm-call` with decision `reject`, like an attachment that cannot be inspected (ADR 0003). If no worker is free, the request waits in a bounded queue; a full queue refuses with 503 `audit_inspection_busy`.
- The worker receives the parsed body and the allowlist digests, and returns the masked value and the findings. It holds no keys, no log and no network access beyond what Node gives a worker thread.
- The fuzz speed rule becomes absolute as well as linear: 1 MiB of any pumped shape, in any scanner, must scan within half the default deadline. The CI runner is about twice as slow as an M1, where the worst shape takes 0.74 s.
## Consequences
- A crafted body costs one worker for at most the deadline; other requests keep their latency.
- A legitimate text that needs longer than the deadline is refused, not forwarded. At 26 ms per MiB ordinary text, 32 MiB needs about 0.8 s.
- Copying a large body to a worker costs a few milliseconds per MiB. Response-side redaction for keys with `logContent` stays on the main thread and is bounded by the response size.
- A new failure mode, a crashed worker, refuses that one request and is replaced.
