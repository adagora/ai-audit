# 38. Detached signed attestations bind decisions to log checkpoints and reviews
Status: Accepted (2026-10-27). Extends [0002](0002-hash-chained-log-with-anchors.md), [0023](0023-decision-records-cli-and-outcomes.md), [0036](0036-portable-qdl-decision-receipts.md) and [0037](0037-offline-evidence-workbench.md).
## Context
Portable receipts reproduce a calculation but cannot authenticate their origin or a review. A hash-chain anchor held beside the log can be replaced with it. A reviewer name in a log record is not an identity check. Recipients need a narrow offline claim without receiving the full log or treating a self-declared timestamp as trusted time.
## Decision
- A separate Ed25519 key pair signs a detached, versioned attestation for one completed, replayable decision. The private key is created with exclusive 0600 permissions and stays outside the audit log. The public key must reach recipients through an independently trusted channel.
- Signing re-verifies one log snapshot, reproduces the portable decision package, requires the latest explicit review record to match the requested verdict, and binds package digest, decision and QDL step hashes, review record hash, full-log count, head hash and snapshot digest. It does not add a log record.
- The recipient verifies the signature with the supplied public key and independently replays the accompanying JSON or SVG receipt. The verifier reports a trusted-key signature and a signed review record. It does not infer the reviewer's legal identity, the truth of the review, or trusted time. Without a trusted public key, the result is only cryptographic consistency.
- Attestation files exclude reviewer name and note, prompts, outputs and policy source. The receipt still contains exact QDL source and inputs, so the owner reviews it before sharing. Existing unsigned receipts remain valid and continue to report origin and human approval as not verified.
## Consequences
- The key holder can independently witness a log checkpoint and recorded review without exposing the whole log. Key custody and distribution of the authentic public key are outside this program.
- A signer can falsely attest to fabricated evidence or a forged review in a log they control. The signature identifies the key, not a human or an external timestamp. Revocation and organizational identity mapping need a separate trust policy.
