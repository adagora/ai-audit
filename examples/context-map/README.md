# Context composition and cache reuse

`node examples/context-map/generate.mjs` generates a synthetic context-map page through a local mock provider. It demonstrates block size/age, changed prefixes and cache signals without paid model calls.

`examples/context-map/live.mjs` is the explicit live counterpart. It requires a separately running proxy and configured `AI_AUDIT_URL` and `AI_AUDIT_CLIENT_KEY`. See [the context-map guide](../../README.md#sessions-usage-and-the-context-map) for the recorded run, limits and commands. Live calls are billable; synthetic estimates and provider-reported usage remain distinct.
