# 1. TypeScript with zero runtime dependencies
Status: Accepted (2026-10-20); "TypeScript only" superseded for the modules under `bend/` by [0029](0029-proved-pure-core-in-bend.md)
## Context
Target users write TS/Node. We need the OpenAI and Anthropic wire formats plus an audit log, in a tool that is easy to drop in front of any client.
## Decision
Write it in TypeScript instead of Rust. Use no runtime dependencies: `node:http` and `fetch` only. `openai` and `@anthropic-ai/sdk` are devDependencies, used only by end-to-end tests.
## Consequences
- Users can read and change the code in the language they use.
- Small supply-chain surface; we write HTTP and streaming handling ourselves.
- No Rust-level memory safety or single static binary.
