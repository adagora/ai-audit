# 72. Decision evidence binds the interpreter implementation
Status: Accepted (2026-11-06). Supersedes the receipt version 2 contract of [0071](0071-native-only-development-reset.md) and extends [0059](0059-json-receipts-verify-only-as-written.md).

## Context
The native registry digest covers a semantic description and limits, but a code edit can leave that description unchanged. Output equality alone cannot distinguish implementations that agree on one input. Export must not assign the current implementation to an older execution that did not record it.

## Decision
- Hash the exact built JavaScript bytes of the pure value layer, interpreter, evidence rules, session adapter and implementation-manifest code. Use sorted module-relative paths and SHA-256, with no absolute paths, timestamps or host-specific metadata. Build with LF newlines.
- Snapshot this local manifest at module initialization and refuse if its files change during the process. The manifest covers all local execution dependencies; a regression test checks the compiled import closure.
- Every newly evaluated decision companion records its semantic registry and implementation digest. Replay requires that binding to match before evaluating. Missing bindings are unpinned evidence, not successful implementation verification.
- Portable receipt version 3 carries the complete implementation manifest. Verification checks its structure, digest and equality to the local trusted implementation before source recovery/evaluation. Receipt paths are data only; the verifier never loads code or paths supplied by a receipt.
- Export requires the recorded binding and current implementation to match. Receipt version 2 is unsupported: it cannot be silently relabeled as a pinned execution. Source identities and original logs are never rewritten.
- Implementation equality, calculation replay, origin, log integrity and human approval remain separate claims. A manifest does not authenticate the producer, the Node binary, the operating system or outside facts.

## Consequences
A source or compiler-output edit changes implementation identity even if the version label and outputs stay the same. Recipients need the matching trusted build to replay its receipts. Reproducibility checks compare repeated builds in different output directories. Historical verification requires retaining an appropriate release; there is no automatic interpreter downloader or fallback.
