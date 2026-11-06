# Deskhand → Auditline → IntentGauge

Recorded on 2026-11-06 using the current worktrees. The customer, email, booking, consent identities and payment ledger are synthetic. The main recording uses the hosted `gpt-4o-mini` model, the actual Python agent/tool loop, an Auditline CLI proxy with the encrypted vault enabled, a local Temporal server/worker and the real IntentGauge runner. It makes no real booking or payment change.

The [workflow GIF](../images/workflow-end-to-end.gif) has 21 scenes. The [feature GIF](../images/gateway-feature-tour.gif) covers the separate scripted gateway laboratory. Captions were added to browser screenshots and pauses were shortened. Screens, replies, consent, reviewer clicks, assertions and command results were captured from the running programs. The run was not regenerated to hide a failed check. [Scene descriptions](../images/walkthrough-scenes.json) and [content-free run evidence](three-app-run.json) accompany the recordings.

## Result

- Customer contact was tokenized before the hosted model request and restored in the delivered customer reply. Captured outbound payloads contain no literal synthetic customer email. This checks that particular value and path, not exhaustive PII detection.
- The customer confirmed the exact €340 quote. A separate staff identity approved it in the Deskhand cockpit. Temporal recorded cancellation and exactly one refund to the isolated sample ledger, read it back, then recorded success.
- The same audit series contains inference calls, the native policy decision, review and effect. Replay reproduced the decision. The downloaded SVG receipt passed `verify-receipt`. Chain verification and newly created local anchors passed. The anchors are local demo files, not independently retained evidence.
- The hosted eval passed **20/21** cases with **zero critical failures**. `hours-saturday` failed its required `search_policies` tool check; the answer itself said 08:00–20:00. Expectations were left unchanged. All 21 trials have matching request IDs/correlations and independently verified audit linkage. All report that the source booking fixture stayed unchanged.
- The scripted end-to-end control passed **21/21** eval cases and the same workflow/privacy/read-back checks. Scripted models establish integration behavior, not hosted-model quality.
- The separate gateway laboratory passed **33/33** checks. Its providers and keys are fake. Binary attachment processing is not demonstrated on this Mac; the attachment check proves refusal of an uninspectable remote reference.

The run exposed and fixed an integration break: Deskhand's refund policy still used the removed `qdl-intent` format. It now uses the native `auditline-policy` format and public rationale. Existing refund-band and half-cent conformance tests pass without changing expected amounts. The application also sends a PII scope, retains gateway request IDs, and omits its public-contact allowlist when starting vault mode. IntentGauge marks inference evidence recorded only after checking those IDs, correlation, use case, status and the chain. It continues to label quote-only policy approval as not recorded.

## Reproduce

Build Auditline and IntentGauge first. In a Deskhand checkout, install its existing Temporal requirements, then run:

```sh
.venv/bin/python -m demo.auditline_flow \
  --auditline /path/to/auditline \
  --intentgauge /path/to/evalLOL \
  --provider scripted --auto-complete --once
```

This creates a new private `live/auditline-flow-TIMESTAMP/` directory and runs the full 21-case suite through the HTTP gateway, plus a consent/review/refund workflow. It changes only that run's sample SQLite backend. It does not change the checked-in booking fixture or older runs.

For the hosted recording, use `--provider openai` and omit `--auto-complete --once`. The launcher reads an already configured provider key from the environment or local untracked `.env`, gives the provider key only to the proxy, and generates separate virtual/vault keys. Hosted runs make billable calls. Open the private `session.json` customer URL, confirm the quote there, then approve it in the linked cockpit. Stop the launcher with Ctrl-C. A failing evaluation remains failed and produces exit code 1; the workflow can still complete safely.

The recording source lives in Deskhand's `demo/record_walkthrough.mjs`, keeping application code out of Auditline (ADR 0067). Its README documents Playwright, ffmpeg and optional feature-bench setup. No provider key, live audit log, vault mapping or private session file is published with these GIFs. The customer portal in the first scenes is a labeled demonstration surface, not a production customer channel integration.

## Feature coverage index

“Hosted” means captured in the three-application run. “Lab” means one of the 33 scripted HTTP checks, not a live-provider claim. “Tests/reference” links to behavior outside the edited GIF.

| Available feature or option | Evidence / where to inspect it |
|---|---|
| Real agent tools and scoped cancellation intent | Hosted: customer request, agent reply, case and model-call tables |
| Customer consent, quote digest, separate reviewer, read-back | Hosted: customer portal and Deskhand approval/timeline; 34 Temporal/audit integration tests |
| Reversible PII, encrypted scope-bound mappings and customer delivery | Hosted: tokenized provider request and restored reply; [vault verification](pii-vault.md) covers expiry, tamper, isolation, agent keys and fail-closed storage |
| `keygen`, virtual keys, provider-key substitution | Hosted: configured virtual delivery key; Lab: invalid key refused; [configuration](../../README.md#configuration) |
| Per-key models/providers/tools | Hosted: key limits shown; Lab: wrong model and out-of-list tools held |
| Use-case tiers and tool limits | Hosted: assist row; Lab: shadow, off, missing use case and tool-list behavior; [use cases](../../README.md#use-cases) |
| `redact`, `no-go`, `advisory` | Lab: mask, refuse without upstream, forward original with findings; vault mode permits redact only |
| OpenAI Chat/Responses and Anthropic Messages | Hosted: Chat; Lab: Responses and Anthropic streams; [proxy verification](../../.agents/skills/verify-proxy/SKILL.md) covers transport details |
| Streaming PII restoration | Tests/reference: all three APIs, including character-split tokens; customer restoration currently buffers the complete response |
| Alias routing | Lab: alias resolves within the same API format |
| Daily/monthly token budgets and reservations | Lab: exhausted budget returns 429; [budget setup](../../README.md#optional-employee-token-budgets) and regression tests cover durable accounting |
| Tool action gate: observe, enforce and user-origin pass | Lab: held call delivered in observe, removed in enforce, user-supplied destination passes |
| Prompt-injection signals, deduplication | Lab: advisory signals and resent tool result counted once. Optional auxiliary model judge is documented, not exercised here and forbidden in vault mode |
| Attachments and sandbox | Lab: uninspectable remote reference refused. Real OCR/PDF rewriting is not demonstrated here; vault mode rejects attachments |
| Fail closed on a torn/unwritable log | Lab: 503 and no upstream call; [formal lifecycle checks](README.md) |
| Unknown usage remains unknown | Lab: provider omits usage; counters do not silently count it as zero |
| `context`: sessions, block sizes/ages and cache evidence | Hosted: session/context view; Lab: a five-turn growing context; no prompt values retained |
| `console`: overview, decisions, use cases, flow, requests, keys, integrity, counters | Hosted console plus feature lab. The workflow review goes through Deskhand, not the read-only audit console |
| Metrics, latency, findings, refusals and gate counters | Hosted console; Lab: health, metrics, alerts and telemetry |
| `decide`, `approve`, `await`, `effect`, `replay` | Hosted: native decision, staff review, effect and replay; lifecycle/decision-loop tests cover waiting and refusals |
| `receipt`, `verify-receipt` | Hosted: downloaded native SVG receipt verifies; Lab: portable receipt check |
| `attest-keygen`, `attest`, `verify-attestation` | Lab: signature verifies; [signed evidence reference](../../README.md#sign-a-reviewed-decision-and-checkpoint) explains separate origin/approval claims |
| `verify`, `anchor` | Hosted: chain and fresh local anchor; Lab: intact chain and anchor. Local files are not WORM storage |
| `rotate`, `prune`, anchor verification after retention | Tests/reference: segment, crash, prune and clock-step laws/TLC; [retention](../../README.md#rotation-and-retention). No live evidence is deleted for this recording |
| `vault-prune` | Vault tests/reference: authenticated expiry cleanup; the hosted run uses an ephemeral vault and does not expose its key |
| `scrub` | Lab: export copy is cleaned, original retained; [history export](../../README.md#scrub) |
| `check-quotes` | Lab: wrong value and missing quote detected; [quote checks](../../README.md#check-quotes) |
| `stats`, `report`, `profile`, `policies` | Tests/reference: [command reference](../../README.md#commands); recorded hashes/profile identify the policy that ran |
| `workbench`, `lab` | Tests/reference: offline evidence navigation and counterfactual policy comparison; no claim that a counterfactual policy controlled the hosted run |
| IntentGauge assertions, tool checks, money checks, interventions and relations | Hosted: all 21 development trials and retained failures; the scripted control also runs the suite |
| IntentGauge human scoring, classification and comparisons | Available in IntentGauge. No human labels, classifier outputs, production qualification or baseline comparison were invented for this hosted run; [IntentGauge reference](https://github.com/adagora/IntentGauge) |
| Advanced qualification, authority, learning and monitoring modules | Programmatic host APIs with separate regression tests (ADRs 0061–0065), not additional controls demonstrated by the inference proxy GIF |

Names/addresses in free text, arbitrary encodings, voice and all incoming channel adapters remain uncovered. This recording is not an exhaustive “a model never sees any PII” certification or a production deployment.
