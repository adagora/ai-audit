# 20. Context arena: block positions, ages and first changed offset
Status: Accepted (2026-10-21)
## Context
Prompt caches are prefix caches: the first changed byte invalidates every cached token after it. Per-segment totals (ADR 0017) show what grew, but not where the prompt was rewritten or what that cost. Operators need to see, per turn, where the context changed, how long each block has stayed unchanged, and when the provider's cache was lost. The log must stay content-free (ADR 0007), and session hashes must stay keyed (ADR 0018).
## Decision
- A request is split into ordered blocks in prompt order: one block per tool definition, then system blocks, then message parts. Each part is labelled user, assistant, tool result or attachment.
- In memory only, the proxy keeps a 16-character keyed HMAC per block for the last 10k requests (session key from ADR 0018). Against the parent request, or the same digest for a retry, it computes:
  - `session.firstChanged = {block, offset}`: the first block that differs inside the parent's prompt, and its byte offset. It is `null` when the request only appends.
  - each block's age: the turn in which the block first appeared at its position with an unchanged prefix. Every block from the first change onward gets the current turn.
- The log stores `context.blocks` as `[kindCode, bytes, age]`, with adjacent blocks of the same kind and age merged. No per-block hashes are logged.
- After a restart, the first request of an existing session has no parent block hashes. It gets `session.arena = "untracked"`, age `0` (unknown) and no first-change marker.
- A cache bust is reported only from evidence, and the view says which signal applied:
  - `prefix-rewrite`: `firstChanged` is not null, so the client changed something the provider had already seen.
  - `provider-cache-drop`: the provider-reported cache read is below half of the expected cached prefix. For Anthropic the expected prefix is the previous cache read plus cache write. For OpenAI it is the previous prompt tokens. The previous value must be at least 1024 tokens, the minimum cacheable size.
  - With unknown usage, no provider signal is produced (ADR 0012).
- `ai-audit context --session` shows a token timeline (cache read, cache write, uncached input, output, bust markers) and an arena map (rows = requests, x = position, colour = turns survived, red marker = first changed offset). The summary reports peak tokens, cache hit rate, busts and preamble share (tools + system).
## Consequences
- Records grow with the number of distinct runs, which is roughly the number of turns, not messages. That is a few hundred bytes for typical sessions.
- Block bytes are exact, but token positions are a split of the provider total by size, so they are approximate.
- Ages are relative to the parent. A regenerated answer on a branch counts as an append to that parent, not as a rewrite of its sibling.
- Changing a system prompt still starts a new session (ADR 0018), so it cannot appear as a bust. Tool-definition changes can.
