# 55. An application acts on a decision after its verdict, and the log records the action
Status: Proposed (2026-10-29). Extends [0023](0023-decision-records-cli-and-outcomes.md) and [0054](0054-loopback-console.md).
## Context
A QDL rule proposes actions such as `send-quote-to-customer` or `route-to-estimator`, but only simulates them. A person records a verdict in the console or with `approve`. Nothing waits for that verdict, nobody is told that a decision waits, and the log ends at the review: it cannot show that a quote went out only after a person approved it, or that it went out at all.
## Decision
- A new record kind `effect` states that the application ran, skipped or failed an action of a decision: `refId` (the decision), `effect.action` (`[A-Za-z0-9_.:-]`, at most 128 characters), `effect.status` (`done`, `skipped`, `failed`), optional `effect.review` (the review it followed) and `effect.code` (`[a-z0-9_]`, at most 64). No payload, amount or text is stored.
- An effect is authorized when the rule simulated that action and the latest review before it is not `rejected` or `overridden`, or when the latest review before it is `approved`. A `done` effect that is not authorized is reported, not refused: the log records what happened.
- `awaitVerdict(log, id, {timeoutMs})` in the library and `ai-audit await --decision ID [--timeout-s N]` return the latest review of a decision, or wait until one is written. The CLI prints JSON and exits 0 for `approved`, 1 for `rejected` or `overridden`, 3 on timeout and 2 for bad input. `recordEffect` and `ai-audit effect --decision ID --action NAME --status done|skipped|failed [--review ID] [--code CODE]` write the effect. Any language can use the CLI.
- `overridden` means the person takes the case over. The application does not run the rule's action for it.
- The console shows each decision's effects and whether they were authorized, counts decisions that wait, raises a browser notification when the count grows, and puts unauthorized effects under Needs attention. With `--notify-url URL` it posts JSON events `decision_waiting` and, after `--overdue-minutes` (default 240), `decision_overdue`. Events carry the decision id, use case, system and proposed action names, never inputs, outputs or notes.
## Consequences
- The log shows the whole path: proposal, rule, verdict, action. A quote sent without approval is visible.
- The application still runs the action itself; the proxy and the console do not call customer systems.
- Polling the log costs one read of the newest files per second for each waiting call.
- A webhook sends decision metadata to a receiver the operator chose.
