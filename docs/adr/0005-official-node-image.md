# 5. Default image is official Node, not pointer-compressed
Status: Accepted (2026-10-20)
## Context
V8 pointer compression (`platformatic/node-caged`) promises about half the memory for object-heavy Node apps.
## Decision
Default `BASE=node:26.10.0-slim`. `--build-arg BASE=platformatic/node-caged:26.10.0-slim` stays available; all tests pass on it.
Measured with `bench/memory.mjs 3000 100` (5×2 runs, `--cpus=2`, medians): heap after GC 6.3 vs 9.7 MB (−35%), RSS 179.8 vs 178.2 MB and peak RSS 186 vs 182 MB (no change), throughput 1130 vs 1227 req/s (−8%).
## Consequences
- The proxy keeps few JS objects alive (heap ≈ 4% of RSS), so compression shrinks nothing that matters and costs throughput.
- Revisit if the cache or stats start holding large object graphs.
