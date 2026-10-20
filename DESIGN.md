# AI Act – AI decision log (prototype)

> **Not legal advice. Unverified.** The mapping below is an engineering reading of Regulation (EU) 2024/1689
> (https://eur-lex.europa.eu/eli/reg/2024/1689/oj), written from memory. Check article wording and dates (including changes proposed in the "Digital Omnibus") against EUR-Lex and with a lawyer.

## What applies to whom

| Article | Summary | Scope | Feature here |
|---|---|---|---|
| Art. 12 | High-risk systems must technically allow automatic recording of events (logs) over their lifetime, for traceability and post-market monitoring. | **high-risk only** | `record()`: timestamp, system, use case, input hash, sources (doc/page), model + version, prompt template hash, parameters, output |
| Art. 19 (provider), Art. 26(6) (deployer) | Automatically generated logs are kept for at least **6 months**, unless other law (e.g. GDPR) says otherwise. | **high-risk only** | append-only JSONL + hash chain (`verifyChain()`); retention = file storage policy (todo) |
| Art. 13 | Transparency to the deployer: instructions, capabilities, limits, how to interpret output, logging mechanisms. | **high-risk only** | `report()`: models, sources, stats — input for documentation |
| Art. 14 | Human oversight: ability to understand, disregard, override or reverse the output. | **high-risk only** | `approve()`: reviewer, decision (approved/overridden/rejected), time; override rate in report |
| Art. 50 | Users must know they talk to an AI; generated content marked machine-readably; deepfakes/public texts disclosed. | **broad** — any chatbot / generator (from 2 Aug 2026) | outside the log; in middleware: "AI answer" banner + metadata flag |
| Art. 4 | AI literacy of staff. | **broad**, from 2 Feb 2025 | mention only — training, not code |

Most company RAG systems (docs, translation, quoting) are **not** high-risk (Annex III: e.g. HR/recruitment, credit, critical infrastructure; Annex I: safety components of products). Then mainly Art. 50 and 4 are mandatory, and the log is good practice (traceability, ISO/IEC 42001, readiness if the system becomes high-risk).

## GDPR
By default only `sha256(input)` is stored. Optionally `redactedInput` (masks e-mail, phone, PESEL — simple heuristic, no guarantee). Hashes of short data can be reversed with a dictionary — use a keyed HMAC in production.

## Quinelings (Apache-2.0)
**Gives:** the idea that a decision step is a bounded (step-limited), deterministic program with exact source, so it can be reproduced and re-run. Here: `step.sourceHash` + `replay()` in `node:vm` with step and time limits, plus the optional QDL path.
**Does not give:** logs, retention, integrity chain, human oversight, reports, transparency (Art. 50), or compliance out of the box.

## Prototype limits
- Local file: the hash chain detects edits/deletions; swapping the whole file needs anchors (`ai-audit anchor`, keep them elsewhere, e.g. WORM/S3 Object Lock).
- The `steps` registry for vm replay is in memory; QDL records are self-contained.
- `node:vm` is not a security sandbox — only for your own trusted step code.
- The deterministic step is reproducible, the LLM answer is not (it is only logged).
