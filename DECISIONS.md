# Decisions (short)
1. **TypeScript.** Target users write TS/Node; both OpenAI and Anthropic wire formats plus an audit log were needed.
2. **Zero runtime deps** — node:http + fetch. `openai`/`@anthropic-ai/sdk` are devDeps for e2e tests only.
3. **One decision per request**: scan every string leaf (incl. tool results, arguments, object keys) before forwarding. A finding in a key name → 409 even in `redact`.
4. **Clean request = original bytes.** Re-serialize only when something was masked.
5. **Placeholder `[REDACTED:<rule>]`**, unnumbered — simple and deterministic.
6. **Findings in the log = rule + JSON path**, never the value or its hash (a hash of a short PESEL/phone can be brute-forced).
7. **Model output in the log is masked** by the same scanner; the client gets the stream unchanged.
8. **PII with checksums** (PESEL, IBAN mod-97); phone only with separators/prefix — fewer false positives on numbers in code.
9. **Duplicate JSON keys rejected** — scanner and upstream could see different values.
10. **Chain: `lastHash` read from the end of the file**, not by loading the whole log — O(1) per write and safe when CLI `approve` writes concurrently with the proxy.
11. **Report**: separate `llm` section; old `stats` unchanged.
12. **Quinelings is optional**, not a replacement for vm `replay()`: needs Node 22 and a very young SDK. A QDL record holds the full quine source + inputs, so replay is self-contained.
13. **count_tokens** is scanned too (content goes to Anthropic) but not logged.
14. **Deadline** covers inspection + waiting for upstream headers; streaming has no limit after that.
15. **Attachments: worker = Node script + CLI tools** (tesseract, poppler, python3-PIL for pixel blackout/PDF rebuild). Sandbox = bwrap + prlimit; process killed after 60 s. Worker never returns stderr or content on failure.
16. **PDF with a finding → 409 by default.** Text layers can't be edited safely; `--allow-page-redaction` rebuilds a raster-only PDF (OCR boxes blacked out, unmappable text-layer pages blanked) and re-inspects it.
17. **Cache in memory only** (bounded 1000), keyed by sha256(profile, mime, bytes). Persistence was left out on purpose.
18. **Wrapped JWT continuation chunks must be ≥ 8 chars**, so a short word on the next line doesn't get joined.
19. **Anchors** = separate append-only `{ts,count,head}` file. `verify --anchors` catches a recomputed (swapped) chain and truncation. The anchors file must live elsewhere.
20. **Virtual keys replace the single client key**: config holds only SHA-256 of keys; `keygen` prints a key once. Real provider keys only in proxy env.
21. **Aliases route model + optional upstream base URL** within the same wire format. No OpenAI↔Anthropic translation (too big, lossy).
22. **Stats computed from the audit log** (single source of truth); `/audit/stats` needs an admin key (`AI_AUDIT_ADMIN_KEY`).
23. **Worker limit is `prlimit --data` (RLIMIT_DATA), not `--as`.** Pointer-compressed Node (`platformatic/node-caged`) reserves a multi-GiB virtual cage and dies with SIGTRAP at start under RLIMIT_AS ≤ 8 GiB, which made every attachment fail closed (422). RLIMIT_DATA still kills a 6 GiB allocation on both runtimes.
24. **Pointer compression (node-caged): not recommended as the default image.** Measured 5×2 runs, `bench/memory.mjs 3000 100` (3000 text requests with secrets, 100 unique images ×2 for cache hits, `/audit/stats`), Node 26.10.0-slim, `--cpus=2`, medians: heapUsed after GC 6.3 vs 9.7 MB (−35%), but RSS 179.8 vs 178.2 MB and peak RSS 186 vs 182 MB (no change, within spread), throughput 1130 vs 1227 req/s (−8%). The proxy keeps almost no JS objects alive (heap ≈ 4% of RSS); RSS is the Node binary/code, V8 reserved-but-free heap pages, malloc arenas and I/O buffers, which pointer compression doesn't shrink. Revisit if the in-memory cache or stats ever hold large object graphs. Build with `--build-arg BASE=platformatic/node-caged:26.10.0-slim` if you want it; all 36 tests pass on it.
