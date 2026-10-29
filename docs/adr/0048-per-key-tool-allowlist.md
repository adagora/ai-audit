# 48. Virtual keys can limit which tools the model may call
Status: Accepted (2026-10-29). Extends [0046](0046-deterministic-action-gate.md).
## Context
The action gate checks only the tools it lists; every other tool call passes. A key for an agent that needs two tools still lets any other proposed tool call through.
## Decision
- `keys[].tools` is optional: `mode` (`observe` or `enforce`) and `allow`, exact tool names or prefixes ending in `*`.
- At response time, a proposed call by that key to a tool outside `allow` fails the gate and is recorded in `actionGate.calls` with `toolAllowed: false`. Requests and their tool definitions stay unchanged, so clients that always send every tool definition keep working.
- A key without `tools` keeps the behavior of 0046. `enforce` follows 0046.
## Consequences
- A name says nothing about what a tool does; an allowed shell tool still reaches any destination, so destination checks stay necessary.
- Client tool names change between versions. `report` lists the tools each key called, so a list can come from observed use.
