# 11. Response content is logged per key, off by default
Status: Accepted (2026-10-20)
## Context
Until now every `llm-call` line stored the model output and tool-call arguments, redacted by the scanner (ADR 0007). Prompts were already hashes only. But a response usually reveals what was asked, so for human users the log was effectively a record of what each employee asked the model.
The AI Act expects deployers to keep logs. Monitoring employees is a separate matter: in Poland it falls under art. 22³ of the labour code (a stated purpose, limited scope, employees informed in advance), and under the GDPR data minimisation principle. Agents and services have no privacy, and with agents the content is exactly what you need to investigate (e.g. what an agent did after an injection signal, ADR 0010).
## Decision
Each virtual key (ADR 0008) has `logContent: boolean`, default `false`.
- `false`: the log stores `outputHash` (SHA-256 of the output text) and `toolCalls` as `{name, argsHash}`. No text.
- `true` (intended for agent/service keys): the redacted `output` and the redacted tool `args` are stored as well, as before.
Every `llm-call` line records `content: "hash" | "redacted"`. Requests without a virtual key use `"hash"`. The env single key enables it with `AI_AUDIT_CLIENT_LOG_CONTENT=1`. `keygen --log-content` sets it, and the startup line counts `contentLoggingKeys`.
Findings and injection signals are unchanged (rule + path only).
## Consequences
- **Breaking:** the default used to be the redacted output for every request. To keep it, set `logContent: true` on the keys that need it.
- The hash still proves that a given output was produced, if the client keeps its copy. Investigating an incident on a human key needs that copy; the proxy cannot reconstruct the text.
- A short output (e.g. "yes") can be guessed from its hash. That is acceptable, because the prompt is not stored either.
- Auditors see the mode per line, and the report counts `contentLogged`, so content logging is never silent.
