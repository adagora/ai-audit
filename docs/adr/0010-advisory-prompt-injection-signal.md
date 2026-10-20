# 10. Prompt injection is an advisory signal on untrusted content only
Status: Accepted (2026-10-20)
## Context
Agents feed tool results and documents to the model, and those can carry injected instructions. The proxy sees this traffic, so it can leave an audit trail ("the agent received suspicious content, then did X"). But it cannot tell intent: in a user or system prompt, "ignore previous instructions" is usually just the user's own instruction.
## Decision
- Scan only content the proxy can identify as untrusted: OpenAI `role: tool`/`function` messages, Responses `function_call_output`, Anthropic `tool_result` blocks (incl. nested text), and text extracted from attachments. Never user, system or assistant turns.
- A small set of deterministic rules (`src/injection.ts`, ids `pi-*`, a few Polish variants). Each rule is precise and covered by true- and false-positive tests.
- Advisory in every mode: it never blocks, never redacts, and never changes the forwarded bytes or the decision from ADR 0009. Hits are logged as `decision.signals` (`category: prompt_injection`, rule + JSON path only, per ADR 0007), counted in `/audit/stats`, `report` and the `x-audit-signal-count` header.
## Consequences
- This is observability, not a defense. A regex is bypassed by paraphrase, translation, encoding or splitting across parts. A clean log does not mean no injection happened.
- Blocking on a signal would need a new ADR, and better evidence than regex.
- Injections in user-pasted text go unnoticed by design.
