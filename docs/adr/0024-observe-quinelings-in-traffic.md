# 24. Quinelings activity in LLM traffic is observed as identity hashes
Status: Superseded by [0032](0032-fixed-diagnostic-and-retained-input.md) (2026-10-25).
## Context
ADR 0023 records decisions that an application makes with QDL. Agents can also run Quinelings themselves through the SDK's MCP server: tools `quineling_v1_*` (legacy `quineling_*`), usually prefixed by the client, for example `mcp__quinelings__quineling_v1_run`. Both halves pass through the proxy: the LLM's tool call in a response, and the tool's result in the next request (`{"result": …}` or `{"error": {code, path, message}}`). Today the log keeps only the tool name and an args hash.
Before building anything that sits between agents (checking and forwarding Quinelings, ADR 0023 follow-up), we need evidence of whether and how agents use them. That evidence must stay content-free (ADR 0007), add no dependency (ADR 0001) and not change what is forwarded (ADR 0009).
## Decision
- An `llm-call` record gains `quinelings: [{where, op, path, sourceHash?, intentHash?, status?, error?}]` when Quinelings activity is visible:
  - `where: "call"`: a tool call in the response whose name contains `quineling_`. `op` comes from the name. A compile call's intent is logged as `intentHash`, the SHA-256 of its canonical JSON (the hash ADR 0023 uses). A run call's `artifactId` is the program's `sourceHash`.
  - `where: "result"`: a tool result in the request that answers a call made after the last assistant turn, so each result is logged once, not again on every later turn. It is recognised by the tool name of its call, or by shape when the call is not in the request (a `qdl-program` artifact or a `qdl-run` record under `result`). It logs the program's `sourceHash`, a run's `status`, or a tool error's `code` and `path`. MCP-level errors that are plain text log `code: "mcp<number>"`.
- Every logged value must match a fixed format: `ql_` plus 64 hex characters, a 64-hex intent hash, lowercase codes, a `$`-rooted path. Anything else is dropped, so a hostile tool result cannot write text into the log.
- Never logged: program source, intents, input values, input hashes (a `qi_…` hash of a few numbers can be brute-forced, ADR 0007), outputs and error messages.
- `ai_audit_quineling_events_total{where,op}` counts the events; `op` comes from the SDK's fixed operation set, anything else is `other` (ADR 0019). `report` counts calls with Quinelings activity and lists the events.
- Observation only: no SDK, no evaluation, no change to forwarded bytes or to the decision.
## Consequences
- Operators can see which programs agents compile and run and how often they fail, and can match `sourceHash`/`intentHash` to ADR 0023 decision records.
- The log says which program ran, not with which inputs. Investigating a run needs the agent's own records or an ADR 0023 decision.
- Detection depends on SDK 1.0.0 tool names and result shapes. A client that renames tools or reshapes results goes unseen; that is a gap, not an error. With the official MCP TypeScript client 1.32 every Quinelings error result fails the client's output-schema check, so the model sees MCP error text and the log records `mcp-32602` instead of the QDL code.
- A mediator between agents stays future work; this data decides whether it is worth building.
