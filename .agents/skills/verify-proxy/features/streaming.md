# Streaming and usage
## Sub-features
OpenAI chat SSE, Anthropic messages SSE, and logged usage, which is unknown rather than zero when the provider sent none.
## How to get to it (user POV)
A client sends `stream: true`. OpenAI needs `stream_options.include_usage` for usage (the proxy never adds it, ADR 0009).
## Driving it with drive.mjs
`node drive.mjs stream`. Checks that the SSE frames reach the client unchanged and checks `usage` in the record.
## Gotchas
The record is written after the response ends. Use `settled(n)` before reading the log.
