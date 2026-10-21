# 17. Context composition is logged as sizes, never content
Status: Accepted (2026-10-21)
## Context
When a prompt grows, operators need to see which part is responsible: system prompt, tool definitions, conversation turns, tool results or attachments. Content-level tracing tools answer this by storing the prompt, which ADR 0007 and ADR 0011 rule out. The proxy already parses every request, so it can measure each part without storing it.
## Decision
- Every `llm-call` record has `context`, computed from the request the client sent: `bytes` per segment (`system`, `tools`, `user`, `assistant`, `toolResults`, `attachments`, `other`), plus `totalBytes`, which equals the request body size.
- Segments are assigned by structure only:
  - Roles: `system`/`developer` go to system; `tool`/`function` go to toolResults.
  - Blocks: Anthropic `tool_result` goes to toolResults; `tool_use` and `function_call` go to assistant.
  - Image, file, audio and document parts go to attachments.
  - `other` holds model parameters and JSON framing.
- Tokens per segment are added only when the provider reported prompt tokens (OpenAI `prompt_tokens`; Anthropic `input_tokens` plus cache read and cache write). The provider total is split in proportion to bytes over all segments except `other`, the parts sum exactly to that total, and `tokenBasis` is `"provider-scaled"`.
- Otherwise `tokenBasis` is `"unknown"` and no token numbers are written (ADR 0012). There is no tokenizer and no chars/4 heuristic.
- No tokens are written when attachments are present: image and PDF tokens do not scale with base64 bytes.
## Consequences
- About 200 bytes more per record.
- Scaled tokens are an attribution, not a measurement. A segment with dense text (code, non-Latin scripts) gets fewer tokens than it uses. Stats and reports keep using provider usage only.
- Sizes are metadata, but the size of a very short message can hint at its content (for example "yes" vs "no"). This is accepted under the same retention rules as the rest of the log.
