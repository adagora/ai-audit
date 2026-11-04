# Casework review evidence

2026-11-03. Scope: `src/casework.ts`, `scripts/casework-api.mjs`, `scripts/helpdesk-workbench.mjs`, `scripts/helpdesk-qualification.mjs`, and `examples/citywheels/workbench/casework.js`.

## Executed checks

- Full `npm test`: 445 tests, 425 passed, no failures, 20 environment-dependent skips.
- Casework unit tests: source-observation linkage, idempotent import, restart persistence, shadow/assist restrictions, review/rejection, grant expiry/revocation, changed releases, tenant/customer isolation, handoff acceptance/resolution, reopening, unknown costs, measured versus estimated costs and safe-integer overflow.
- Workbench HTTP journeys: actual Python and JavaScript workers, retained qualification/case links, separate customer/operator credentials, cross-origin rejection, grants/activation, held delivery, reviewed outbox delivery, cross-tenant refusal and persistence after restart. A separate copied evaluator tree is mutated after startup; the next experiment returns 503 with the restart-required code.
- Chrome UI: explicit synthetic approval remains inactive until activation; assist holds delivery until answer review; approved delivery appears in the separate customer inbox. Desktop and 390-pixel layouts were visually inspected. The mobile document width equalled the viewport width; navigation was adjusted to expose every section. The temporary viewport override was reset.
- JavaScript syntax and CSS brace checks passed. No paid provider call, external message or real payment occurred.

## Static scan disposition

The final expanded UBS scan exited 1 with 9 critical, 6 warning and 192 informational findings across five files. This is not a clean/zero-finding scan. Findings were reviewed against the actual data flow:

| Finding group | Count | Disposition |
|---|---|---|
| Secret-comparison rule in casework API | 6 critical | One match is the `typeof credential` type check; the others compare route names such as `session`, `cases` and `authority`. None compares a secret's value. Credentials are looked up by SHA-256 digest; conflicting credential headers use timing-safe digest comparison |
| Secret-comparison rule in worker orchestration | 2 critical | Matches compare the provider mode to `live` and the worker exit code to zero. The same lines mention environment credentials or redaction, causing overbroad matching; they do not compare key values |
| Prototype-pollution rule in workbench handler | 1 critical | Match points to the request handler's try block. Static asset lookup uses a fixed table and an own-property check. Model/policy inputs are not merged into a prototype; typed grant limits now reject extra fields |
| Header-injection rule | 2 warning | Matches are literal `cache-control` and `referrer-policy` response headers. No request value reaches these headers |
| Startup JSON parsing | 2 warning | Trusted local suite/policy files are parsed before the server starts. Invalid JSON rejects startup; it does not continue with an authority default |
| Open-redirect rule | 2 warning | Navigation changes only the query of the current URL with `history.pushState`; case links pass opaque IDs to that same function. This does not perform an external redirect. Unknown view names are checked against own properties |

Actual issues corrected during review included non-constant-time credential conflict comparison, direct workbench credential comparison, missing fetch cancellation, ambiguous implementation names in the grant selector, mobile navigation clipping, a skip link that could overwrite the token fragment, and missing current-release validity in displayed grant status. The renderer uses text nodes, not user-supplied HTML; its owned element handlers use DOM event properties and document-scoped handlers do not accumulate across renders. Informational parser/date/range and filesystem findings were checked against input validation, exclusive storage locks and atomic persistence.

No scanner suppressions or code comments were added. Static analysis does not prove security, and these dispositions do not cover unimplemented production identity, real messaging channels, customer-data retention or the pending executor/learning UI.

## Executor follow-up

The follow-up full suite passed 433 of 453 tests, with zero failures and 20 platform-dependent skips. Fourteen executor tests cover expired quote renewal without transferred authority, separate business/system clocks, voucher settlement, consent digest binding, supervisor settlement after quote expiry, crashes during resolution, read-back mismatches and three actual concurrent writer processes. The HTTP journey restarts the server after a refund commit and checks the actual ledger; it also runs the original Python application and proves an audited-application grant cannot execute the Python case. A matching synthetic Python grant can.

Chrome exercised an operator-created proposal, customer-only consent, separate review, an explicit crash after cancellation, unresolved read-back and supervisor-authorized completion. The separate customer page showed the settled status without receiving private reviewer or backend payment metadata. Its 390-pixel viewport had a 390-pixel document width. The viewport override was reset; real-device and cross-browser execution are not claimed.

The scan of `src/citywheelsExecutor.ts`, `scripts/casework-api.mjs` and `examples/citywheels/workbench/casework.js` exited 1 with 8 critical, 2 warning and 149 informational findings. Seven critical matches are the credential type check, literal route-name comparisons, and the public case-ID equality inside an already customer-scoped list. None compares a credential value. The remaining critical match points to the operation-route branch as a potential object merge: it destructures a regex match, looks up a scoped stored case and validates exact body fields before calling the executor; it does not merge request objects into a prototype. The two redirect warnings remain the same-origin history navigation described above. The executor module itself has no critical or warning finding in this scan.

The follow-up UI and API now cover executor consent and reconciliation. Independent learning, real backend adapters, real customer authentication and data retention remain outside this verification record.

## Independent learning follow-up (2026-11-04)

`CaseworkLearning` and the authenticated API now separate blind human labels, third-person adjudication and frozen judge observations from operational reviews. Retained-case imports use exact stored answers and SOP blobs, force synthetic development provenance, and exclude evaluator results, expected assertions and target identity. Operator-supplied facts and external source metadata remain attestations. Source families cannot supply multiple independent calibration rows or become holdouts after development exposure. Publishing or exporting gold blocks fitting a new judge on that family. Tests consume the export with the separate IntentGauge engine, without treating synthetic acceptance as production qualification.

Chrome exercised first-label lock, a second session without visibility of that verdict, conflicting second-label lock and resolution by the third identity. The operator authoring page was added afterward; its HTTP import passed, but its browser check was interrupted when Chrome changed and remains unverified. No screenshot artifact was saved, and no current live-preview availability is asserted.

The final four-file UBS scan (`caseworkLearning.ts`, API, casework UI and reviewer UI) completed with 12 critical, seven warning and 163 informational findings. Every critical/warning was inspected:

- Ten credential-comparison findings are type checks, fixed route strings and tenant-scoped opaque case-ID comparisons near credential access. Actual conflicting credentials compare fixed-size SHA-256 digests with `timingSafeEqual`; token lookup uses hashed keys.
- Two prototype-pollution findings point at route branches, not unsafe merges. POST bodies reject unknown fields and duplicate keys. Learning input is projected to explicit stored fields. Existing grant input is whitelisted and validated by AuthorityStore.
- Two redirect warnings are same-origin history navigation and a button routing to a local case. Neither accepts a destination origin.
- Four listener lifecycle warnings refer to buttons owned by replaceable DOM cards and the single page-lifetime refresh button. Detached cards and their listeners have no retained external references.
- One async-listener warning refers to the reviewer submit callback. The callback catches request failures and restores the button; refresh handles its own failures.

An earlier scan also warned about two non-null assertions in calibration projection. Those were replaced by explicit failing guards. The scanner initially could not write its cache within the sandbox; `ubs doctor --fix` verified the environment, and the complete scan ran with approved cache access. No suppression comments were added.

## Reviewed regression follow-up (2026-11-04)

The regression store binds original fixture input, independently reviewed human evidence and explicit deterministic expectations. A separately assigned labeler locks expectation approval before the workbench can launch an actual application rerun. Unit tests cover self-review refusal, tenant boundaries, immutable review, changed suite refusal, duplicate run linkage and conflicting duplicate records. The HTTP journey changes the QDL half-refund rule, observes €360 instead of €340, labels that answer incorrect, publishes the review, independently approves a €340 expectation, and reruns the changed JavaScript policy (fails), baseline JavaScript application (passes) and separate Python application (passes). The old case stays open. Reruns retain their own reports, qualifications and opaque case references. The new operator forms and regression reviewer controls have not yet received browser verification.

The six-file static scan reported 17 critical, 15 warning and 241 informational findings. Both new stores were free of critical/warning findings. Fourteen critical findings are credential-adjacent type/route/opaque-ID comparisons or live-mode/subprocess-exit branches; actual credential equality uses fixed-size timing-safe digests. Three prototype-pollution findings refer to whitelisted route branches/static assets, with no unsafe object merge. Of the warnings, two identify fixed response headers, three identify trusted startup JSON parsing that intentionally fails startup on malformed configuration, and two identify same-origin local navigation. Six listener lifecycle findings cover DOM-owned buttons and one page-lifetime refresh listener; two async-listener findings are callbacks with explicit failure handling. These are triaged findings, not a clean zero-finding scan. No suppression comments were added.

The completed regression milestone full suite passed 441 tests, failed zero and skipped 20 platform-dependent checks (461 total). A prior run was correctly stopped by host-change detection because API source was edited during verification; the successful final run held application sources fixed.

## Paired economics follow-up (2026-11-04)

Six pure-analysis tests verify measured rework overturning model-call savings, missing/estimated/unfinished/overflow costs, asymmetric mistake loss at equal accuracy, excluded risk/development sampling, severe-outcome limits, external traffic weights and paired standard errors. The authenticated HTTP test rejects a labeler and verifies that the synthetic sample returns diagnostics without a representative ranking. The completed full suite passed 447 tests, failed zero and skipped 20 platform-dependent checks (467 total). No real human baseline has been collected. The Outcomes form has not been browser-verified.

The three-file economics/API/cockpit UBS scan completed with 15 critical, two warning and 171 informational findings. The economics module had no critical/warning findings. Twelve API criticals are credential-adjacent type/route/opaque-ID comparisons; two are whitelisted route-branch prototype-pollution false positives. The additional cockpit taint finding follows token/fetch/error text into `notice`; `notice` assigns `textContent`, and element construction uses text nodes rather than an HTML sink. The two warnings are the already-reviewed local same-origin navigation paths. None establishes an unsafe credential comparison, object merge or HTML injection. No suppression comments were added.

## Operational question snapshots (2026-11-04)

ADR 0062 adds authenticated scripted question handling against the synthetic executor backend. Context tests cover tenant/customer isolation, exclusion of original payment references, booking versions, explicit knowledge validity, changed knowledge identities, quote expiry, refund-band crossings, missing facts and unevaluated observation linkage. Delivery requires a context verifier and refuses changed state. The HTTP test executes JavaScript, plain Python and Python with proxy/QDL against owned operational snapshots, verifies retries and request conflicts, excludes a different booking mentioned in the question, reads newly cancelled state, blocks stale delivery, restricts original observations to operators and survives restart. Plain Python retains its explicit absence of proxy evidence.

The final full suite passed 453 tests with zero failures and 20 environment-dependent skips (473 total). The first full run exposed an existing probabilistic export test: searching an entire hash-bearing suite for `342` sometimes matched its randomly derived record ID. The test now asserts fixture and expectation structure and the absence of an embedded observation, preserving the intended leakage check without matching hash digits.

Native Chrome verification selected CW-1002, submitted a refund question and observed the owned request card in “Awaiting help-desk delivery,” with no draft answer in the customer view. A screenshot was visually inspected through the computer-use tool; no image artifact was saved. The temporary server was stopped. Browser connection APIs failed, so the verification used native Chrome controls. No mobile or cross-browser claim is made for this follow-up.

The final six-file UBS scan completed with 15 critical, five warning and 222 informational findings. The context module and subprocess question runner had no critical/warning findings. All critical/warning findings were inspected:

- Twelve credential-adjacent type, route and opaque-ID comparisons are not secret comparisons. Actual conflicting credentials use fixed-size SHA-256 digests with `timingSafeEqual`; session lookup uses hashed tokens.
- Two prototype-pollution findings refer to whitelisted route branches. Request fields and duplicate keys are rejected before explicitly projected evidence is persisted; no request-controlled prototype/object destination is merged.
- The taint finding follows request/error strings into `notice`; that sink assigns `textContent`, and card construction uses text nodes.
- The parse warning refers to the host-supplied context file. Malformed input deliberately aborts the worker, is caught by the host generation boundary, and never creates or delivers a successful answer.
- Two redirect warnings are same-origin history/case navigation.
- Two listener warnings refer to the input listener on a replaceable form, not a global listener. The detached form and its handler have no retained external references and are collectible.

The first scan could not access the scanner cache in the sandbox and was an incomplete environment-error run, not a clean scan. The complete and final scans ran with approved cache access. No suppression comments were added. Missing display/fee fields in old synthetic backend stores fail explicitly rather than being backfilled from stale fixtures.

## Monitoring and reviewed recovery (2026-11-04)

ADR 0065 introduces persisted monitoring plans, owned alerts, reviewed restrictions and fresh-evidence recovery at the cockpit activation boundary. Seven unit tests cover required expiring plans, fallback capacity, distinct-case counting, event history, passive alerts, duplicate scans, tenant isolation, grant/release/plan expiry, restriction interrupted by an authority lock, exactly one revocation, fresh report requirements, real regression-store approval/rerun linkage, separate replacement activation, late evidence invalidating a pending recovery review and legacy outcome-state observation. Legacy states explicitly use observation time, not an inferred old event time.

The HTTP journey creates a passing application experiment and approval, verifies activation is refused without a plan, configures an authenticated plan, activates the grant, opens a complaint alert, verifies no automatic revocation, checks tenant/role refusals, explicitly restricts the grant twice with one revocation, rejects stale recovery, executes the application again, reviews fresh recovery and separately activates a replacement. Reissuing a grant for the old report is refused. Restart preserves plan, incident, revocation and recovery activation linkage. Existing customer-question, executor and labeling journeys also passed.

Native Chrome exercised the plan form, synthetic capacity evidence, separate activation, customer-dispute signal, owned alert, explicit restriction, newly retained real application evaluation and the recovery form. The final page showed recovered and a separate activation control; no authority was automatically restored. A screenshot was visually inspected through the computer-use tool but no image artifact was saved. The temporary tab and server were closed. No mobile, real-staff-capacity, production-routing or externally delivered handoff claim is made.

The final `npm test` passed 461 tests with zero failures and 20 environment-dependent skips (481 total). The six-file final UBS scan completed successfully as a scan and reported 20 critical, 37 warning and 383 informational findings; it was not a zero-finding scan. All critical and warning findings were inspected:

- Fifteen secret-comparison findings point to credential-adjacent type/route/opaque-ID comparisons, plus configured live-mode selection and subprocess exit status. Actual credential comparison remains fixed-size SHA-256 digests with `timingSafeEqual`.
- Four prototype-pollution findings identify whitelisted route branches and fixed static-asset routing; no request-controlled prototype target is merged. The monitoring body is whitelisted, projected to synthetic scope and validated before storage.
- One taint finding reaches `notice`, which uses `textContent`; cards render text nodes, not HTML.
- Twenty-four deep-chain warnings cover constructor-supplied stores, validated loaded qualification/state objects, typed case and operation sources, explicit null guards and authenticated session variants. Missing/corrupt retained sources abort scans or activation and cannot grant authority.
- Seven JSON-parse warnings cover trusted startup files and integrity-checked report blobs. Parse failure is intentionally propagated to the host boundary and prevents activation/recovery; startup configuration failure prevents server startup.
- Two listener lifecycle warnings refer to a replaceable form-owned listener with no external retained reference.
- Two header warnings are literal cache-control and referrer-policy values.
- Two redirect warnings are same-origin local history and case navigation.

No suppression comments were added. Scanning remains passive; only an authenticated reviewer can approve restriction. Automatic restriction, real staff measurement and a production deployment were not introduced.

## Evaluation breadth and example curation (2026-11-04)

The full suite after relocation passed 466 tests, zero failures and 20 environment-dependent skips (486 total). Real offline workers exercised both same-Python refund implementations, exact-input/schema/fixture matching and retained audit evidence. Negative controls refuse missing telemetry and changed comparison identities. Nine adversarial development cases retain failures honestly, isolate conflicting policy fixtures, reject path traversal/null/oversized patches and create owned staff handoffs. Phrase checks do not establish semantic safety. Native Chrome verified the nine-case selector and an actual conflicting-policy failure with intact audit evidence; no screenshot artifact was saved.

The eight-file breadth UBS scan reported 22 critical, 21 warning and 241 informational findings. Critical findings were 17 credential-adjacent route/mode/status comparisons, four whitelisted branch/prototype matches, and one Python fixture write. The Python write accepts only three exact policy filenames, with negative tests covering path escape. Warning findings were ten JavaScript JSON parses, two literal headers, one fetch without a default timeout and eight Python parse matches. Parse errors fail the worker/host operation rather than producing completed evidence. Streamed runs supply an abort signal; small configuration/history/artifact requests still lack a default timeout. This is a residual UI limitation. The scan preceded the final comparison metadata validation and example relocation; it is not represented as a scan of every final byte. No suppression comments were added.

Local Markdown file links resolve outside frozen evidence/showcase. All 65 ADR index targets exist; the six consolidated records are below the policy's approximate 40-line limit. The relocated policy lab and live-mail entry points pass syntax checks. The curated CityWheels offline command returns the expected €340 quote with a verified chain and no business effect. Paid provider and real-mail execution were not exercised for curation.

Formal verification after curation also passed: nineteen expected TLC outcomes (including deliberately failing mutant/residual configurations), followed by 54 passing audit-log/request/decision-loop regression tests and zero skips. The models' documented bounds and residual races still apply.

## Final staged review (2026-11-04)

The pre-commit staged UBS scan completed all modules over 71 files: 32 critical, 400 warning and 1,831 informational findings. This broad scan includes relocated existing examples and negative-test fixtures, so its counts are not a regression delta from the narrower scans above. Findings were triaged rather than suppressed with code comments.

Critical findings: 22 credential-adjacent route/mode/status comparisons retain timing-safe checks for actual credentials; four prototype warnings are fixed/whitelisted routing branches; one XSS trace ends at `notice`/`textContent`; one hardcoded-secret finding is an explicit fake cross-tenant test credential; two loose-equality checks intentionally match null and undefined usage, and another matches a base64 padding literal rather than an operator. The Python fixture write remains restricted to the three exact allowed filenames, with adversarial tests.

Warning review: deep chains and non-null assertions refer to typed or validated state and test assertions; retained JSON parse failures abort the operation or fail the test. Array-mutation matches append to separate result/issue arrays, not the iterated collection. Sparse arrays, script/dialog strings and fake secrets are deliberate negative fixtures. Parameter-count matches include destructured option objects and a nested UI heading. The comparison's async map is awaited by `Promise.all`; the executor concurrency test separately awaits readiness and completion arrays, and the segment test returns its promise to an awaited caller. Learning async handlers catch failures; form/card listeners leave with their detached DOM owners and the refresh listener lives for the page lifetime. Console writes are CLI output or content-minimal diagnostic metadata. Headers and redirects remain fixed local values. Loopback test fetches and some small prototype UI requests have no default timeout; this remains a documented limitation rather than a production-readiness claim. Python parsing failures fail the worker. No scanner finding was represented as absent.

Fresh `npm test` before the requested commit/push: 466 passed, zero failures, 20 environment-dependent skips (486 total). No real audit logs, provider credentials, generated receipt or unrelated formal-research directory is included in the staged changes.
