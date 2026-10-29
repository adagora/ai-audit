# 53. A use-case table limits what each kind of request may do
Status: Accepted (2026-10-29). Extends [0008](0008-virtual-keys.md), [0019](0019-metrics-openmetrics.md), [0047](0047-record-refusals-before-inspection.md) and [0048](0048-per-key-tool-allowlist.md).
## Context
`x-audit-use-case` is a free label that the client sends. Nothing checks it. A key that serves several features has the same models and tools for each of them, so one feature cannot be limited or switched off without a new key. Operators ask per feature: which model, which tools, how much autonomy, how many blocks, how often a person overrides the result. ADR 0019 forbids metric labels taken from headers, so no metric shows a feature. The proxy cannot find the purpose of a request from its content: a guess needs a model, changes between runs and the prompt can steer it.
## Decision
- `gateway.json` can have `useCases`: a map from a name (`[a-z0-9][a-z0-9._-]{0,63}`) to a row with `tier` and optional `models` and `tools`. `tier` is `off`, `shadow`, `assist`, `contain` or `transact`. `models` works as in `keys[].models`; `tools` as in `keys[].tools` (0048).
- `keys[].useCases` lists the names a key may use. A key without the list may use every row. A name that is not in the table, or a key list without a table, stops the start with `audit_use_cases_invalid`.
- The client names the use case in `x-audit-use-case`; the application knows which feature calls the model. When the header is missing and the key lists exactly one name, that name applies. The proxy never infers a use case from content.
- With a table, each POST to an LLM route must resolve to a row before the body is read. Missing: 400 `audit_use_case_required`. Not in the table or not in the key's list: 403 `audit_use_case_not_allowed`. Tier `off`: 403 `audit_use_case_off`. Each is a refusal record (0047); the name is stored only when it is in the table.
- The requested model must pass the key's list and the row's list. A tool call must pass both tool lists; a call outside the row's list fails the gate and is recorded with `useCaseToolAllowed: false`.
- `llm-call` records keep `useCase` and add `useCasePolicy`: `tier` and `digest`, the SHA-256 of the canonical row with its name. Refusals after resolution carry `useCase`.
- With a table, `ai_audit_requests_total` and `ai_audit_action_gate_total` get the label `use_case`: a configured name, or `none`. A header value outside the table never becomes a label.
- The proxy enforces only `off`. The other tiers are recorded: the proxy cannot see whether a person reads an answer before it reaches a customer. `report` and the workbench group calls, refusals, gate holds, tokens, decisions and reviews by use case.
- Without `useCases`, nothing changes: the header is copied as before.
## Consequences
- One key can serve several features with different limits, and a feature can be switched off in the config.
- A client can still name a wrong row among those its key allows. A key per feature closes that.
- Clients that use a key with more than one row must send the header, for example with `ANTHROPIC_CUSTOM_HEADERS` in Claude Code.
- A changed row gets a new digest in later records, so the report shows when a row changed.
- Series per family grow with the number of rows, which the operator controls.
- Assigning a free-form customer message to a use case stays the client's work. A classifier call can go through the proxy under its own row, for example `intake`.
- QDL stays off the request path. A decision recorded with `decide --use-case NAME` joins the same row in the report.
