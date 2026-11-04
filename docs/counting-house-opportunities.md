# From audited calls to accountable agent work

Research proposal, 2026-11-03. No new architecture is accepted by this document.

Source: Steve Yegge, [The Counting House](https://yegge.ai/essays/the-counting-house/), 2026-10-27. Repository findings below describe inspected source, including the existing uncommitted work. They are not runtime verification or production readiness claims.

## Direction

Build ai-audit into an operator's answer to three questions: What work may this agent do? Why may it do it? What actually happened?

Keep three independently useful products connected through evidence contracts:

- **ai-audit:** runtime controls, policy identity, decision evidence, reviews, investigations, and the operator cockpit.
- **IntentGauge (evalLOL):** independent cases, evaluations, judge calibration, statistical summaries, and qualification evidence.
- **Applications such as CityWheels:** business context, customer identity, tool execution, and business outcomes. A separate executor owns write credentials when transactions are introduced.

The opportunity is the connection from measured capability to narrowly granted authority to observed outcome. Adding another score dashboard would leave that connection incomplete.

## What the essay changes

Yegge's proposal emphasizes narrow casework, per-intent autonomy, human-calibrated evaluation, cost-sensitive mistakes, and mechanical execution outside the model. Its useful implication here is that a successful model response is only one stage of successful customer work. [Essay](https://yegge.ai/essays/the-counting-house/)

My recommendation goes beyond a gateway: make every grant of authority inspectable and bounded, and make every business outcome traceable to that grant. This is a proposed product direction, not a claim that a valid audit chain establishes correctness or that an evaluation authorizes an action.

## Existing foundations and actual gaps

| Area | Evidence already present | Remaining gap |
|---|---|---|
| Outbound privacy and evidence | Scanning, virtual keys, fail-closed logging, anchors; ADRs 0007–0009 and 0016 | Masking does not provide reversible customer identity handling or authorized access to a booking |
| Per-job controls | `src/useCases.ts`, ADR 0053: model/tool limits, tier and row digest | Only `off` is enforced as a tier; customer delivery and transaction authority belong outside the proxy |
| Tool safety | `src/actionGate.ts`, ADR 0046: deterministic destination checks and tool allowlists | A permitted tool/destination is not proof of customer consent, record ownership, eligibility, or correct amount |
| Deterministic decisions | Optional QDL, replay, program identity, receipts and attestations | A correct replay reproduces the computation; input truth and business suitability still need evidence |
| Human review and action evidence | `src/verdict.ts`, ADRs 0055 and 0057 | Application execution and effect recording are separate; timeout and check/action windows are documented; 0057 remains Proposed |
| Evaluations | IntentGauge `src/types.ts`, `src/calibration.ts`: per-intent metrics, mistake costs, repeats, independent human labels and judge eligibility | Representative independently reviewed data, operational approval, drift response and execution remain separate responsibilities |
| Cross-project experiments | ADR 0060; `examples/citywheels/workbench/README.md` | Export, isolated workers, retained runs, repeated comparisons and interactive drafts already exist; qualification and production connection are unfinished |
| CityWheels behavior | Both help desks calculate quotes; `examples/citywheels/helpdesk.mjs` explicitly forbids booking changes | Neither cancellation nor payment is implemented; a quote experiment cannot validate transaction safety |

The inspected Python application is the separate `help-desk-agent` checkout selected by `CITYWHEELS_PYTHON_ROOT`. IntentGauge is the separate evaluation checkout selected by `INTENTGAUGE_ROOT`. This assessment does not generalize to the rest of EternalChat.

## Five highest-value improvements

### 1. Bind authority to a qualified release

**Value:** answer why a specific deployment has permission to handle a specific intent. This is the central missing connection between IntentGauge and ai-audit.

Propose a qualification package binding the application artifact, prompt, SOP, tool schemas, QDL program, gateway configuration, dataset, rubric, judge and evaluator identities to evaluation reports. Record unknown or mutable provider model identity explicitly. A model name alone cannot identify immutable behavior.

Keep qualification evidence, an accountable person's approval, and deployment activation as distinct artifacts. The approval names the intent, permitted tier, limits, owner, expiry, fallback and package digest. Trusted configuration supplies the active identity; a request header does not confer authority. Existing detached attestation machinery is a possible building block, subject to its documented trust limits.

First implement an offline inspector that displays missing evidence and produces a policy change proposal. Do not let `report.passed` or `calibration.eligible` modify a production row. Later, an application/executor can require a valid active grant at its own action boundary. Preserve optional QDL and keep evaluation off the forwarding path.

**Acceptance:** changing any bound policy, prompt or tool contract makes the old qualification inapplicable; expiry and revocation prevent new covered actions; a report passes while approval remains absent; a spoofed header cannot select an unauthorized grant. Pin the whole executed artifact, including dependencies, rather than only the entry file.

### 2. Introduce typed action proposals and an executor boundary

**Value:** move from detecting an unauthorized effect after it happened to controlling the point where credentials are used.

A model proposes a narrow business operation. The application/executor authenticates the customer, loads current state, checks ownership and eligibility, recomputes amounts, validates the active grant, and obtains any required review. QDL can evaluate deterministic business rules over these verified facts. A model-provided value or a quote from text is not authoritative business state.

Bind approval to the exact operation, customer scope, record version, amount and currency, rule identity and validity window. Use integer minor units for money. Expire a quote or reauthorize when the underlying facts change.

The proxy remains a defense on model traffic; it cannot prevent a client holding independent backend credentials from bypassing it. Put credentials and final enforcement in the executor. The console shows proposal, authorization, dispatch, read-back and reconciliation evidence without becoming the payment service.

**Acceptance:** another customer's booking is refused; changed state invalidates a quote; a larger amount cannot reuse a smaller approval; rejected and expired approvals cause no dispatch; user-supplied destinations do not establish payment eligibility.

Start with a synthetic executor and fake ledger. Durable workflows for multiple real systems should use an established workflow engine when required; do not build a general saga runtime inside ai-audit. A refund already settled may require manual resolution rather than a fictitious rollback.

### 3. Measure customer resolution and total cost per intent

**Value:** demonstrate whether automation helps the business, including expensive mistakes and displaced human work.

Connect cases to outcomes: answered correctly, handed off, resolved, reopened, transaction settled, disputed, or unresolved. Distinguish a proposed tool call from execution, and execution from a verified business result. Unknown settlement remains pending or unknown.

Use IntentGauge's existing confusion matrix and mistake-cost support. Extend the operating view with representative traffic weights, human baseline, escalation burden, repeat contacts, settlement delay and measured provider cost. Keep missing cost coverage visible. Separate classification harm from downstream execution harm to avoid double counting.

For each intent, compare expected total cost: model use + review + execution + rework + weighted harm. High-severity outcomes also get hard limits; low average cost cannot excuse them. Report sampling source, uncertainty and unresolved outcomes beside the estimate. Repetitions assess stability, not independent population size.

**Acceptance:** a cheap model that creates enough rework loses to a more expensive model; unmeasured cost cannot appear as zero; identical classification accuracy can produce different risk estimates; reopened cases remain linked to the original handling.

### 4. Close the learning loop with independent labels and expiring evidence

**Value:** prevent a polished experiment workspace from becoming a collection of stale green reports.

IntentGauge already calculates human agreement, kappa, adjudication and judge eligibility. Build on that with a labeling workflow: independent blind reviews, third-person adjudication, rubric versions, provenance and explicit holdout access. A file labeled `holdout` does not prove independence.

Sample both random traffic and risk-selected cases. Preserve selection metadata; do not use the risk-enriched sample to estimate population prevalence without adjustment. Treat overrides, unsupported answers, gate holds, complaints, reopened cases and execution exceptions as candidates for independently labeled regressions.

Complete the existing incident export loop: original evidence → reviewed sanitized fixture → independent expected outcome → actual target rerun → qualification package. Keep adversarial regression cases separate from representative quality estimation. A reviewer decision is not automatically a correct gold label.

Define demotion triggers, expiry, affected intents and a safe destination before activation. Initially produce alerts and reviewed policy changes. Any later automatic restriction requires a defined authority boundary and tests; repeated restrictions must be idempotent. Recovery requires fresh evidence and review.

**Acceptance:** a changed rubric invalidates affected calibration; unresolved labels cannot qualify a judge; a failed development case cannot silently enter a hidden holdout; a regression opens an owned incident and produces a rerun linked to the original evidence.

### 5. Give operators a case-centered cockpit

**Value:** make the existing controls, evaluations and help desk understandable as one operational system.

The ai-audit UI should cover the help desk through an adapter, while the help desk retains its domain logic. Use the existing workbench as the development surface, and add these views incrementally:

| View | Operator question |
|---|---|
| Cases | What happened to this customer's work, and who owns the next step? |
| Intents | Which work is enabled, under which limits, with what fallback? |
| Qualifications | What evidence and approval support this release, and what changed? |
| Exceptions | Which cases need review, reconciliation, customer contact or infrastructure repair? |
| Experiments | Did this candidate improve outcomes, and can I inspect the original evidence? |

A case timeline links requests, tool observations, QDL decisions, reviews, executor events, customer delivery and evaluations. It can say “no proxy evidence available” for the original Python application. Never fabricate a uniform audit trail.

Use opaque application-issued case references with tenant scoping; avoid customer emails or booking identifiers as metric labels. Define access controls before exposing customer casework: the current loopback console is not a multi-tenant help-desk service. Keep retained customer content in a separately governed store with explicit access, deletion and retention; the metadata log remains content-minimal.

**Acceptance:** an operator can navigate from an unresolved case to the exact grant and evaluation, assign a next action, and distinguish generated text, dispatched action and confirmed outcome. A user cannot inspect another tenant's case. Restarting the UI preserves case links and pending work.

## Ten complementary improvements

| Priority | Improvement | Why / concrete completion condition |
|---|---|---|
| 6 | Authenticate booking access | A booking id is a locator, not authorization. Test cross-customer and cross-tenant lookups at the backend adapter |
| 7 | Reconcile uncertain actions | A crash after backend commit but before effect recording yields `unknown`, then read-back resolves it without blindly repeating the write |
| 8 | Derive stable operation identities | Retries of the same operation reuse a key; legitimate later operations get a new identity. Backend deduplication or reconciliation handles dispatch ambiguity |
| 9 | Enforce shadow and assist at delivery | Shadow cannot send customer replies; assist requires review. Implement in the application delivery adapter, as the proxy cannot observe delivery |
| 10 | Make escalation a complete handoff | Include safe summary, reason, evidence links, owner and deadline; track acceptance and resolution rather than merely printing a staff email |
| 11 | Separate observed facts from assertions | Customer claims such as storm warnings remain claims until checked; record source/version/freshness for facts used to authorize an action |
| 12 | Version the knowledge snapshot | Bind retrieved document revisions and their validity periods to a release; changed refund terms trigger focused reevaluation |
| 13 | Test abstention and ambiguity | Add mixed intents, missing identity, conflicting policies and unsupported requests; abstention must hand off without claiming a completed action |
| 14 | Add controlled component comparisons | For causal questions, hold model, fixtures, prompt and loop fixed and vary one control; retain current whole-application comparisons for product questions |
| 15 | Govern experiment retention | Show partial/running/failed manifests, storage size, sensitivity and retention owner; interrupted runs never count as completed evidence |

These complement the top five. They are not fifteen new independent subsystems; several are acceptance conditions for the executor, qualification and cockpit work.

## First pilot and order of work

Use CityWheels cancellation quotes as the first narrow intent. Keep it read-only initially. The first useful result is a case view that shows the customer question, verified calculation, applicable policy, evaluation result, missing approval and explicit “quote only; no cancellation performed.”

1. **Read-only evidence connection:** add a versioned package inspector and case index over retained runs. Reuse existing report and console artifacts. Done when a package can be reopened after restart and all evidence links and digests verify, with missing components listed. This needs no paid model calls.
2. **Qualification workflow:** add independently reviewed cases, rubric/calibration provenance, approval proposal and expiry. Done when a prompt or policy change invalidates applicability and a passing score cannot activate a grant.
3. **Synthetic action pilot:** add a fake booking/ledger executor outside the proxy. Test duplicate delivery, concurrent attempts, changed eligibility, late approval, crash before dispatch, crash after commit, partial refund failure and reconciliation. Done when each operation ends in a verified result or an owned unresolved exception, with no unverified success claim.
4. **Representative shadow operation:** define a privacy/retention policy and lawful source of user-owned cases, measure the human baseline and validate fallback capacity. No customer delivery or real payment authority follows from synthetic success.
5. **Narrow activation:** only after explicit operational approval, enable one bounded intent through the executor, with expiry, monitoring, rollback of routing and manual reconciliation. Introduce a durable workflow engine if actual business steps need it.

Dependency order: evidence identities → qualification review → active grant; authenticated facts + grant → executor; executor observations → reconciliation and outcome measurement. Cockpit navigation can start immediately over existing artifacts.

## Decisions to preserve

- Keep QDL optional and outside the proxy forwarding path (0004, 0043, 0046).
- Preserve content-minimal audit logs and distinguish integrity, origin, correctness and approval claims (0007, 0036, 0038).
- Keep IntentGauge a separate engine; do not append evaluation results to runtime chains under the existing experiment contract (0060).
- Preserve the distinction between common business checks and ai-audit-specific controls (0060).
- Treat draft policy compilation and evaluation as development evidence, never approval (0060).

New persisted qualification/grant contracts, executor boundaries, authorization semantics, case-linkage formats and privacy changes require ADR review under `docs/adr/README.md` before implementation. This proposal deliberately leaves their schemas unaccepted.

## What to avoid first

Do not build a universal agent framework, generic workflow engine, automatic cheapest-model router, reversible PII vault or compliance certification feature to start. Each adds substantial obligations before demonstrating the missing evidence-to-authority connection. Reversible tokenization may be useful later, but needs its own threat model, tenant isolation, deletion and authorized detokenization boundary.

The distinguishing product claim to work toward is concrete: for this kind of work, show the evidence that supports the agent's permission, the checks made on current facts, and the verified outcome or unresolved exception.
