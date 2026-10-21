# 18. Sessions are linked by keyed prefix digests of the message list
Status: Accepted (2026-10-21)
## Context
Context growth and cost need to be seen per conversation. Clients do not send a session id, and session headers would be client-controlled and missing in most SDK calls. Chat APIs resend the whole conversation on every turn, so the request for turn n+1 starts with the full message list of turn n. The log must not store content (ADR 0007). A plain SHA-256 of a short message such as "yes" is easy to guess.
## Decision
- The conversation items are the messages, with Anthropic `system` and Responses `instructions` as the first item. Each item is HMAC-SHA256'd under a proxy-local key and chained: `c_i = HMAC(key, c_{i-1} || HMAC(key, item_i))`.
- Each record stores `session: {id, turn, digest, parent, messages}`:
  - `digest` is the chain over all items of the request.
  - `parent` is the digest of an earlier request whose full list is the longest prefix of this one.
  - `id` is inherited from that parent. A request with no parent starts a new session, with `id = digest[0:16]` and `turn = 1`.
  - An identical list is a retry: same turn, same parent.
  - An edited message branches from the last earlier request that still matches the prefix.
- Linking needs nothing from headers and nothing beyond these digests.
- The key is `<log>.session-key` (32 random bytes, hex, mode 0600), created on first start, or `ProxyOpts.sessionKey`. The proxy rebuilds its in-memory index (at most 100k digests) from the log at start.
- Responses requests with `previous_response_id` carry only the new items. They get no `session`.
## Consequences
- About 250 bytes more per record. Only the request's own digest and its parent are stored, never the per-item digests.
- Without the key, digests are not guessable and cannot be linked to known text. Deleting the key makes future digests unrelated to past ones. Past records still link to each other, but they can no longer be matched to any text.
- Replicas with different keys or separate indexes split sessions. Share one key and one log to link across replicas.
- Edits to the first user message, or a changed system prompt, start a new session.
