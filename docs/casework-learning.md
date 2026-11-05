# Independent review and calibration

The synthetic workbench and cockpit that served this module are no longer in the repository ([ADR 0067](adr/0067-no-help-desk-application-in-ai-audit.md)). They are kept at git tag `helpdesk-workbench-archive`; check it out to run `npm run example:helpdesk`. The module in `src/` remains and its tests are in `test/`.

`src/caseworkLearning.ts` stores tenant-scoped, immutable labels separately from answer approvals and execution reviews. Two assigned labelers commit one Boolean label each against versioned rubric text and source context. A third assigned adjudicator resolves disagreement after both labels are locked. Assignment responses omit model verdicts and peer labels; only the adjudicator sees conflicting human labels. Distinct credentials prove access boundaries, not independence of actual people.

In the archived cockpit, `npm run example:helpdesk` printed separate `/learning#token=…` URLs for `demo-labeler-a`, `demo-labeler-b` and `demo-adjudicator`. These identities have no operational roles. No tasks are created automatically. The cockpit Learning view assigns retained answers with the exact stored SOP documents and explicit operator-supplied facts. It also freezes judge evidence references and publishes resolved gold. External sample creation and held-out calibration export use the authenticated operator API. Reviewer credentials rotate on restart; stored identity assignments and locked labels persist.

The API uses `x-workbench-token` or a Bearer credential. Roles and tenant come from server configuration. Available routes:

| Method | Route under `/api/casework/` | Purpose |
|---|---|---|
| GET | `learning` | Operator task summaries, without label values |
| GET | `learning/identities` | Operator lists configured review identities, without credentials |
| GET | `learning/assignments` | Assigned labeler/adjudicator evidence |
| POST | `learning` | Operator creates an explicitly sanitized, provenance-attested external sample; `caseId` must be null |
| POST | `cases/{id}/learning` | Operator assigns an actual retained answer with `{rubric,assigned,adjudicator,context}`; source is always synthetic development |
| POST | `learning/{id}/label` | Assigned labeler locks `{value:boolean}` |
| POST | `learning/{id}/adjudicate` | Assigned third person locks `{value:boolean}` |
| POST | `learning/{id}/judge` | Operator freezes `{name,revision,value,source}` before gold exposure |
| POST | `learning/{id}/publish` | Operator publishes resolved human gold |
| POST | `learning/calibration` | Export `{ids,rubricDigest,judge:{name,revision}}` for IntentGauge |

Creation accepts `intent`, `question`, `answer`, JSON `context`, `rubric:{id,text,revision}`, two configured `assigned` labeler IDs, an `adjudicator` ID and `source:{family,kind,sampling,split,owner,reference,sanitized:true,exposedToDevelopment}`. Source metadata is an operator attestation. It does not verify sanitization, random sampling or model revision honesty. Retained experiments must remain synthetic development evidence. Never relabel their repeats as independent representative samples.

Development exposure contaminates the whole tenant/source family. Calibration requires one selected task per family, exact rubric identity, two locked human labels, held-out provenance and a matching frozen judge. Publication or calibration export exposes family gold and blocks recording a new judge on that family. Unresolved disagreements are exported without invented adjudication; IntentGauge rejects them. Human adjudication may still resolve them. Exports bind snapshot and label identities, and do not activate authority or establish production qualification.

Tests exercise real HTTP role boundaries, restart persistence, blind labels, immutability, adjudication, source contamination, repeated-family rejection, gold exposure and changed rubric/judge rejection. A separate IntentGauge integration consumes a 30-sample synthetic fixture and verifies unresolved and undersized datasets are ineligible. Its successful test result is not representative production evidence.

Retained-case reviewer context includes SOP blob digests and document text, plus explicitly attested operator facts. Snapshot file paths, application identity, evaluator verdicts and expected assertions are omitted. The operator must supply missing booking facts and the business clock; the interface does not claim those manual additions were independently verified. External source references and context are operator controlled and must themselves avoid leaking verdicts.

## From a reviewed failure to an application rerun

The Learning view can propose a regression after human gold is published for a retained case. Supply explicit assertions and select a separately configured labeler to review those expectations. The original suite input, published review digest, original report digest, SOP context, attested facts, rubric and proposed assertions are bound to an immutable regression digest. Supported deterministic assertions are `equals`, `contains`, `notContains` and `range`, all critical. Invalid or vacuous checks are rejected. The assigned reviewer sees the fixture, source context and expectations in their separate review page, supplies a rationale, and locks approval or rejection. Author self-review is refused.

A failed published human review opens a `quality-ops` handoff with a deadline when the source case has no open handoff. Existing open handoffs retain their owner. This does not resolve the customer outcome. Failed application reruns also become ordinary retained cases with owned evaluation-failure handoffs.

An approved regression exposes JavaScript and Python rerun controls using fake providers. These launch the actual isolated application workers through IntentGauge. The target receives only the original input, without assertions, source labels or reviewer decisions. Each new run retains its report, release qualification and case references. Regression history links them back to the original case and reviewed expectation digest. A failed rerun, a successful rerun and original customer resolution remain distinct observations. The original case stays open until its own outcome/handoff workflow is completed.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/casework/learning/{id}/regression` | Propose `{assertions,reviewer}` from published retained-case review |
| GET | `/api/casework/regressions` | Tenant operator history including linked application runs |
| GET | `/api/casework/regressions/assignments` | Assigned expectation-review evidence |
| POST | `/api/casework/regressions/{id}/review` | Assigned labeler locks `{approved,rationale}` |
| POST | `/api/run` | Execute `{regressionId,target:"ai-audit"|"python",mode:"fake"}`; optional JavaScript `policyId` selects an existing compiled draft |

Regression execution rejects question/case overrides and full-suite selection because the reviewed fixture must remain unchanged. The optional explicit live provider mode still requires its existing key configuration; synthetic rerun buttons never select it. Reviewed regressions are development tests and do not become representative holdouts. The generated qualification packages retain synthetic provenance and require their own authority workflow.
