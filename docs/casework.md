# Casework integration boundary

The help desk is an application. It can remain Python. It sends model requests through ai-audit and emits observed application events through an adapter. ai-audit's inference proxy does not become a help-desk runtime, customer identity service or payment processor. ADRs 0062–0061 define the new optional casework boundaries.

## Implemented modules

| Module | Responsibility |
|---|---|
| `src/qualification.ts` | Retained snapshots, exact report linkage, capability declarations and an evidence inspector |
| `scripts/qualification.mjs` | Capture, list and inspect packages from the command line |
| `src/authority.ts` | Explicit grants, separate deployment activation, expiry, revocation and tenant/action/money limits |
| `src/caseworkStorage.ts` | Local exclusive transactions, atomic persistence and explicit dead-process lock recovery |
| `src/casework.ts` | Cases, delivery rules and outcomes. A host supplies its currency and context rules through `CaseworkOptions` |
| `examples/citywheels/src/executor.ts` | A synthetic booking/refund backend and executor with consent, review, reservation and read-back |
| `examples/citywheels/src/context.ts` | A synthetic read context for one owned booking |

The workbench retains qualification artifacts with runs; choose **Release qualification · evidence only** to inspect them. The cockpit provides cases, qualifications, explicit grants, activation/revocation, answer review, simulated delivery, owned handoffs, execution/reconciliation and observed outcomes. The separate customer session has an inbox and a requests page for exact-proposal consent. Remaining scope is tracked in `counting-house-implementation.md`.

## Open the cockpit

`npm run example:helpdesk` prints three separate URLs: the experiment workbench, operator cockpit and synthetic customer inbox. If another local instance already uses port 8799, choose a port with `HELPDESK_PORT=8800 npm run example:helpdesk`. Run a Python or JavaScript experiment, then follow its retained-case link into the cockpit. The customer credential cannot inspect cases, grants, evaluations or experiment APIs. The operator credential does not impersonate the customer inbox.

The default workspace binds both example applications to the synthetic `citywheels` tenant and `demo-customer` account. Hosts can supply separate server-configured casework identities to `startWorkbench`; the HTTP API never accepts a tenant or role override from request JSON. Credentials are random and process-local, while cases, outbox records and authority survive restart. Use the new URLs printed after each restart. This is a local synthetic workspace, not production customer authentication.

For reviewed delivery, record a synthetic `assist` grant allowing `deliver-answer`, activate it separately, open a case, approve its exact answer, and deliver to the local inbox. A shadow grant cannot deliver. Contain/transact permits answer delivery within the action grant, while an explicit rejection still holds the answer. All deliveries are simulated: no email, SMS, cancellation or payment is sent by these controls.

For synthetic execution, approve and activate a `transact` grant with `cancel-refund` and a sufficient per-operation EUR limit. Add `deliver-answer` too if the same grant should permit answer delivery. Open a refund case and prepare a proposal for an owned booking. Its amount comes from the backend's live booking facts, not the model's quote or an experiment price override. In the separate customer URL, open **Your requests** and consent to the exact proposal. An operation above €100 also requires an operator-session reviewer verdict. The operator can then execute, or select an interruption in the synthetic failure laboratory. A Python case uses this same executor but requires a grant matching the Python release; it receives no invented proxy evidence.

The default synthetic shop clock is 2026-06-10 09:00 Europe/Warsaw, matching the example bookings. Proposal expiry, authority expiry and event timestamps use system time. These clocks are separate and neither can be supplied in HTTP request JSON. The proposal records its shop calculation time. Voucher bookings settle as fake voucher credit, never as card cash. Customer responses omit backend payment references, grant IDs and private review identities.

Case content is linked to exact retained suite/report bytes; an altered answer cannot be imported under an unrelated evaluation result. Changing server/evaluator code on disk requires a restart before new experiments or authority checks, so files changed after module loading cannot silently become an evaluated deployment identity. A changed release requires reevaluation and a matching grant.

## Host responsibilities

The host application constructs `CaseworkPrincipal` from its configured authentication, including tenant, identity and roles. It supplies `CustomerScope` from authenticated customer identity and captures `CurrentRelease` from its actual deployment. Do not populate these objects from unverified request JSON or a model's tool arguments. A case id or booking id is a locator, not a credential.

`AuthorityStore.approve` takes the principal, grant request and current release. `activate` is a separate deployer action. `authorize` checks the trusted scope and current release on each new operation. The production path requires representative qualification and cannot exceed the package's declared actions or autonomy ceiling. Explicit synthetic grants can exercise the fake backend without claiming production qualification. Unknown provider model revision requires explicit acceptance by the reviewer.

The library's supplied clock is a host dependency for deterministic testing, not a client input. Production hosts use their clock. An observed clock regression fails closed. Authorization observed at reservation does not undo a business operation already in flight when a grant is later revoked.

`SyntheticCancellationExecutor.propose` receives authenticated customer scope, an opaque case reference and a booking locator. It reads the owned live booking and computes the proposal. `consent` binds the customer to that proposal. `review` records one reviewer verdict; an amount above the configured automatic cap requires approval. `execute` verifies the current facts, exact policy, active synthetic transaction grant and review before reserving dispatch.

The fake backend refunds to its stored original payment reference. There is no model-selected payment destination. Refunds are in integer minor units. Rental refund is full at 48 hours, half at 24 hours with a floor to the minor unit, and zero below 24 hours; deposit is returned for confirmed bookings. A storm claim goes to staff instead of becoming verified eligibility.

## Recovery semantics

Reservations are durable before dispatch. An operation in `dispatching` or `unknown` is not blindly rerun. `reconcile` reads backend booking and ledger state:

- Neither write observed: return to `ready`; a subsequent explicit execution rechecks authority and facts.
- Booking cancelled and exact refund settled: mark `done` without sending another refund.
- Booking cancelled but refund unobserved: keep an owned exception. Do not claim rollback or settlement.

For a confirmed partial cancellation, a supervisor with operator and reviewer roles can **Authorize remaining synthetic refund**. This separately records authorization, rechecks current transaction authority and the original consent/review, verifies the exact booking version and facts, and refunds only the original amount and payment method under the original idempotency key. It does not accept a replacement amount or destination. An expired quote cannot start a new cancellation; an already committed cancellation can have its original settlement separately authorized. Inconsistent or unavailable read-back remains unknown and does not enable a settlement shortcut.

An expired uncommitted quote can be explicitly renewed. The replacement has a new generation and requires new consent and review; old evidence is not transferred. A repeated proposal request after cancellation returns the existing operation, and retries after settlement do not create another refund.

The executor supports fault injection at `before-dispatch`, `after-cancel`, `after-refund` and `refund-failure`. The tests restart both stores after interrupted work and inspect the actual fake ledger. Operation and backend state are distinct files, so the tests exercise the ambiguity between a committed backend write and a missing executor completion record.

This implementation has no real payment connector or distributed workflow runtime. A production backend adapter must provide its own durable idempotency and reconciliation contract. Library state is protected by local filesystem access; its digest detects accidental corruption and is not independent evidence against a malicious store owner.

## Verification

`npm test` includes casework and existing local proxy/help-desk integration. The latest run passed 433 tests, failed none and skipped 20 environment-dependent tests. Attachment namespace tests cannot run on this host. Three actual executor processes tested concurrent dispatch against one booking. Chrome checks covered separate-session consent, an interrupted cancellation, read-back, supervisor settlement and the customer's settled status. The customer request view was checked at 390 pixels without horizontal page overflow. Other browsers and real mobile devices were not tested. Static findings and dispositions are in `docs/verification/casework-review.md`. No paid model calls, external messages or real payments were used.


Customer questions use `POST /api/casework/questions` with `requestId` (a client UUID), `bookingId` and `question`. The configured customer credential supplies tenant and ownership. The active synthetic refund grant selects the release; its permitted actions must include `deliver-answer`. The pilot accepts scripted releases only. A question creates a draft case and never delivers an answer by itself. Repeating the same request UUID returns the existing case; changing its question or booking is refused. One question per customer and four total may generate concurrently in one server process.

The backend must contain the booking fee and display fields, in addition to executor facts. Older synthetic stores without those fields fail with `booking_context_incomplete`; they are not silently populated from stale fixture data. Fresh workspaces seed them from the synthetic example. There is no production data migration or customer-data import.

Each operational case is `not-evaluated`: its own immutable observation links the actual answer and tool results, and its qualification links the prior independent release evaluation. Operators can inspect `GET /api/casework/cases/CASE_ID/evidence`; customer credentials cannot read that endpoint. `GET /api/casework/requests` shows only the authenticated customer's question status, without draft answers. Replies still appear exclusively through the governed outbox.

The source snapshot includes exactly one owned booking, its version, business and observation times, a five-minute expiry and the pinned knowledge identity. `examples/citywheels/knowledge.json` declares the synthetic document owner's validity window and is included in the release's SOP snapshot for both applications. A changed booking, refund time band, expired quote, expired knowledge or changed release prevents new delivery. Payment references never enter the model's data snapshot. The adapter labels customer claims as unverified; the executor continues to check live facts and consent independently. Operational observations and snapshots are retained in the private local workspace until operator deletion, separately from runtime audit logs.
