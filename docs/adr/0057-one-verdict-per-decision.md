# 57. A decision takes one verdict, and an approval that nothing acted on is shown
Status: Proposed (2026-10-29). Supersedes the "latest review" of [0055](0055-act-after-verdict.md) for new verdicts.
## Context
ADR 0055 lets a decision take any number of reviews and counts the latest one. The TLA+ model of the loop (`spec/DecisionLoop.tla`) found two paths that a person who reads the console does not expect:
- An application waits, reads `approved` and sends the quote. A second reviewer records `rejected` or `overridden` before the application records its effect. The console reports "ran without approval", and after a take-over the action ran, although ADR 0055 says that it does not.
- The application stops waiting after its timeout, and a person approves later. Nothing happens. The console shows the decision as approved and warns about nothing.
## Decision
- A decision takes one verdict. `approve` and the console refuse a second one with `audit_already_reviewed` (HTTP 409 in the console, exit 2 in the CLI). The check and the append run under the log lock, so two reviewers at the same moment cannot both record a verdict. A person who changes their mind records a new decision.
- Before it runs an action that the rule allows, the application checks for a verdict with `ai-audit await --decision ID --timeout-s 0` (exit 3 means none), and it skips the action after `rejected` or `overridden`.
- An application that stops waiting records `skipped` with code `timeout`.
- The console lists under Needs attention each decision that was approved more than `--overdue-minutes` ago and has no done action.
## Consequences
- An application that waits for the verdict is never flagged, and no application acts against a verdict that it could read (`DecisionLoop.cfg`). `DecisionLoop_latestwins.cfg` and `DecisionLoop_nocheck.cfg` keep the old rules and must fail.
- Two windows stay, and the model keeps them as configs that must fail. A verdict that lands between the application's check and the effect record of a rule-allowed action still flags that action, and a person must look at it. An approval after a timeout leaves nothing done; it is now on the attention list.
- A corrected verdict costs a new decision record.
- Logs written before this change can hold several reviews for one decision. Readers keep counting the latest one there.
