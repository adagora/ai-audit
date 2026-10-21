# Agents
- Read `docs/adr/` before any architectural change. Don't contradict an accepted ADR; supersede it with a new one.
- A decision that passes the policy in `docs/adr/README.md` gets a new ADR. Everything else goes in the commit message.
- Never commit secrets, real API keys or real audit logs (`live/`, `*.jsonl` from real traffic). Tests use fake keys only.
- Run `npm test` before pushing.
- Do not add code comments. Code is the documentation: express intent through names, types and tests. Rationale belongs in ADRs and commit messages.
