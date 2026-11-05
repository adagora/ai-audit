# QDL dependency review

Assessment: 2026-11-05. Recommendation for discussion, not an accepted architectural decision.

Current state: [ADR 0071](adr/0071-native-only-development-reset.md) removes the SDK, codecs and old receipt compatibility completely during development. The earlier review and migration notes below are historical.

Initial implemented follow-up: [ADR 0070](adr/0070-native-policy-runtime.md), [native policy format](native-policies.md), [verification](verification/native-policy-runtime.md) and [measurements](performance/2026-11-05-policy-runtime/README.md). The assessment below describes the original dependency state. The implementation uses an explicitly installed legacy SDK instead of extracting and maintaining a new legacy distribution; production native installs have zero runtime packages.

Auditline should own a small, versioned deterministic policy runtime eventually. The immediate opportunity is to reduce the installed SDK surface while preserving historical replay. A wholesale SDK rewrite would also take responsibility for semantics, validation, source recovery, diagnostics and presentation compatibility; dependency removal alone does not prove an improvement.

## What the project uses

| Path | QDL responsibility | Auditline responsibility |
|---|---|---|
| `src/qdl.ts`, CLI `decide` and `replay` | Compile an intent or recover exact source; evaluate typed inputs; return outputs, traces and refusals/failures | Scan retained material, record outcomes, store programs once, check replay and log linkage |
| `src/policies.ts`, console | Recover payloads and output names | Policy history, differences and operator reviews |
| `src/decisionPackage.ts`, `src/receipt.ts` | Runtime identity, source recovery, evaluation and visual frames | Portable package, hashes, evidence checks and exact SVG rendering |
| `src/lab.ts`, `src/labCompare.ts` | Recover and compare deterministic governor rules | Derive session observations, compare alternatives offline |
| `src/quoteEval.ts`, toolroom examples | Evaluate machining prices and review thresholds | Labeled evaluation, latency measurements and model comparison |
| `src/quinelings.ts`, proxy | No SDK execution: recognize tool traffic shapes and names | Record metadata about externally executed Quinelings |

The request path's action gate is ordinary TypeScript (`src/actionGate.ts`). It does not depend on QDL. Replacing QDL would not by itself improve injection detection, redact more secrets, strengthen approvals, or accelerate ordinary proxy requests. Those are separate mechanisms.

The useful QDL property is reproducible computation from retained source and inputs. Auditline supplies durability, integrity, oversight and effect records. A reproduced calculation does not prove that extracted facts were correct, that the policy was appropriate, or that an action was authorized.

## Supply chain evidence

`package.json` installs `@quinelings/agent-sdk` 1.0.0 as an optional local tarball. Its manifest declares MCP SDK, A2A SDK, Express and Zod dependencies. The committed lockfile contains 99 non-development package entries, all marked optional, excluding the root. This counts lockfile entries, not vulnerabilities, loaded modules or distinct maintainers.

The local tarball and lock integrity pin the SDK bytes, which already limits exposure to a moving SDK release. Its transitive dependencies still enlarge installation and maintenance scope. Optional means the proxy can operate without the package; it does not mean default `npm ci` omits it.

Auditline imports the `/v1` entry point. That entry loads the runtime, schema and bundled implementation chunks; MCP/A2A server dependencies being installed does not establish that their server code executes in the proxy. The runtime schema uses Zod. Removing server dependency declarations would therefore be a useful partial reduction, not proof of a dependency-free runtime.

`vendor/quinelings-qdl-v1-library.js` also exists, but no references were found in `src`, `scripts` or `test`. Its presence is not evidence that it can replace the SDK. Preserve upstream licensing and provenance if extracting upstream implementation code.

## Proposed destination

Introduce an Auditline-owned policy contract: versioned data, typed inputs and outputs, explicit operation semantics, canonical identity, deterministic trace and structured refusal/failure results. Keep evaluation pure: no filesystem, network, clock, randomness or executable JavaScript in policy data. Bound source bytes, nesting, nodes, collection sizes, intermediate values, work and trace size. Specify missing values, numeric overflow, rounding, sorting ties and unsafe property paths.

Start the new language with operations required by actual policies, including the machining quote and governor examples. Determine this set by inventorying policy nodes before implementation. Do not claim compatibility with all QDL programs on that basis. Money policies need an explicit numeric contract; fixed-point arithmetic would require new policy identity and cannot silently change historical floating-point results.

Keep runtime identity distinct from policy identity. Bind future receipts to both. Preserve the distinction between calculation replay, input provenance, log integrity, human verdict and recorded effect. Domain workflows and effect execution stay with the application, consistent with ADRs 0055 and 0066–0068.

## Migration sequence and acceptance gates

1. Capture synthetic legacy fixtures with exact intents, source, registry identity, inputs, outputs, input hashes, traces, failure diagnostics and portable JSON/SVG receipts. Cover completed, compile-refused, input-refused and computed-failed evaluations, malformed sources and boundary values. Use fresh sessions for recovery.
2. Introduce one internal runtime adapter around current SDK access. Include payload recovery, runtime description and frame generation, not only compile/run. Preserve the distinction between typed refusals and infrastructure errors. Keep SDK types behind the boundary.
3. Produce a pinned minimal legacy distribution from the exact vendored implementation, with reproducible provenance and licensing. Verify the installed dependency closure in a clean directory and differential results against the original. This can remove unused transport packages before a new language exists; it remains maintained third-party code.
4. Add the native runtime under a new explicit identity. Compare migrated policies against the legacy fixtures and independently specified expected outcomes, then fuzz validation and bounded execution. Unsupported operations must refuse explicitly. Compare latency and memory using the same cases before claiming gains.
5. Version new log and receipt contracts through an ADR. Keep legacy source and hashes unchanged. Dispatch old receipts to the frozen legacy interpreter and renderer; exact SVG verification makes the renderer part of that compatibility boundary. A translated policy gets a new identity and explicit migration relationship.
6. Make native policies the default only after decision, replay, receipt, policy history, lab and console paths pass. Remove the full SDK from default installation. If complete removal of upstream code is required, a separately verified legacy interpreter or explicit end of legacy support is still necessary; moving it to an optional verifier does not eliminate it everywhere.

Implementation requires a new ADR addressing the changes to ADRs 0004, 0023, 0033 and 0036, plus the exact-byte receipt contracts in 0059. Do not silently edit accepted semantics. Changes to decision writers must run the audit-log verification skill and its gates; proxy or CLI changes require the applicable proxy verification skill. Run `npm test` before pushing.

## Decision criteria

Success means fewer installed packages, a documented and bounded semantic core, preserved verification of historical evidence, and a smaller maintenance burden demonstrated by code and tests. Track installed closure, owned implementation size, conformance coverage, replay compatibility, evaluation latency and maximum resource use. Merely replacing imports with copied SDK code changes ownership of patching without necessarily reducing complexity.

The larger product opportunity is a durable evidence format that survives interpreter replacement. Own that contract first, then make interpreter choices replaceable. The quine and creature visualization can remain a legacy presentation feature; new policies need no such encoding to be reproducible.
