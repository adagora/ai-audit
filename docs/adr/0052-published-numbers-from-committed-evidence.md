# 52. Published measurements are generated from committed evidence and checked by the tests
Status: Accepted (2026-10-29). Extends [0030](0030-ci-and-pinned-bend-archive.md) and [0045](0045-local-advisory-injection-judge.md).
## Context
Accuracy and speed figures in the docs were typed by hand from runs whose output was not kept. Nobody could check them, a rule change left them silently wrong, and the injection table mixed a threshold chosen on the same cases with held results. Recomputing the 2026-10-20 performance table from its own `results.json` found three cells off by 0.01 ms.
## Decision
- A table of measured results lives between `<!-- results:NAME -->` markers and is written only by `npm run results -- --write` (`scripts/results.mjs`). `npm test` fails when a block differs from what the script computes.
- Deterministic figures (regex rules on `cases.json` and the pinned `ordinary.json`) are recomputed from the data on every run. Measured figures come from files committed beside the page: `docs/performance/<date>/results.json`, and content-free harness reports under `docs/evidence/injection/` with case ids, labels, verdict enums and times, never case text or model output.
- Every saved run is shown, with the range over its repeats; none is chosen as the best. A run whose dataset digest no longer matches is labeled, not dropped. Figures that cannot be recomputed stay in the page under a heading that says so.
- A prose claim that repeats a measured figure is checked against the data by a test.
## Consequences
- A change to a rule, a case or a measurement shows up in the generated page in the same commit.
- Model runs need a local model and are not repeated in CI; their reports are evidence of one dated run, as the page says.
- The rules digest covers compiled function text, so the check expects `npm run build` (tsc), not `build:fast`.
