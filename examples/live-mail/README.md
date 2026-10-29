# Live run: four customer mails through the real proxy, model, console and CLI

`npm run example:wycena` runs the whole quote flow in one process, with scripted model answers. This example runs it the way a deployment does. `ai-audit serve`, `ai-audit console` and the application are separate processes. The model is real. A person records the verdicts in the console in a browser. The application uses only HTTP and the CLI (`decide`, `await`, `effect`), as an application in any language would.

The four mails in [mails/](mails/) are synthetic. Each one has a fake contact email and phone number, and each one is written for a different path through the toolroom quote rule of [../quineling-wycena](../quineling-wycena/README.md):

| Mail | Part | Path it is written for |
|---|---|---|
| mail-1 | C45 spacer bush, 20 pcs | the rule allows the quote; the application checks for a verdict, then sends |
| mail-2 | 7075 gearbox housing, 5 axes, 8 pcs | price above 5000 PLN; a person approves or rejects |
| mail-3 | 42CrMo4 shaft, induction hardening outside | cooperation; a person takes the case over |
| mail-4 | plasma-cut bracket, material not stated | the application waits 15 s, records `skipped` with code `timeout`; a person approves later and the console warns |

The model decides the numbers, so a run can take another path. Each run costs four `gpt-4o-mini` calls.

## Run it

```sh
npm run build
node examples/live-mail/setup.mjs /tmp/live-mail gpt-4o-mini
AI_AUDIT_UPSTREAM_OPENAI_KEY=sk-... node dist/src/cli.js serve --config /tmp/live-mail/gateway.json --log /tmp/live-mail/audit.jsonl --rotate-bytes 50000
node dist/src/cli.js console --log /tmp/live-mail/audit.jsonl --config /tmp/live-mail/gateway.json --reviewer kierownik --overdue-minutes 1
node examples/live-mail/app.mjs --run /tmp/live-mail
```

Run each command in its own terminal. `setup.mjs` writes a random client key and `gateway.json` with one virtual key and the use case `wycena`. Open the console URL that `console` prints and record the verdicts on Decisions while the application waits (up to 900 s; `--waits '{"mail-2":60}'` changes it). Approve mail-4 only after the application has logged its timeout; about a minute later Overview shows "1 approved decision has no action recorded". Then:

```sh
node examples/live-mail/summary.mjs --run /tmp/live-mail
node dist/src/cli.js anchor --log /tmp/live-mail/audit.jsonl --anchors /tmp/live-mail/anchors.jsonl
node dist/src/cli.js verify --log /tmp/live-mail/audit.jsonl --anchors /tmp/live-mail/anchors.jsonl
```

`summary.mjs` lists each call with its inspection result and token usage, and each decision with its verdict and what the application recorded. It also searches every log file for the contact data in [leak-check.txt](leak-check.txt).

## What the run on 2026-10-29 showed

- All four calls reached `gpt-4o-mini` as `forward-redacted` with `pii-email` and `pii-phone`. None of the contact data is in the log. The provider reported 1,024 cached prompt tokens from the second call on.
- With `--rotate-bytes 50000` the log rotated during the run. The chain and two anchors still verified after a manual `rotate`.
- Each verdict reached the waiting application within about a second, and each effect is authorized: approved and done; rejected and skipped; taken over and skipped; a timeout skip, then a late approval with the warning on Overview.
- A second verdict is refused: `ai-audit approve` exits 2 and the console answers 409, both with `audit_already_reviewed`.
- The rule takes the model's hours as they come. In a first run, the application described the input fields more briefly than this one does. The model then gave 1,600 programming hours and 2,400 inspection hours for eight housings, and the rule priced them at 754,160 PLN while the model's own price was 12,880 PLN. Every such price went to a person, because each one was above 5000 PLN. With the field descriptions of the quote example, the prices were 3,217.50, 17,399.25, 8,318.75 and 2,334.42 PLN, and mail-1 went out after the check without a person.
- Found and fixed with this run: a decision whose application only recorded a timeout was shown as "Done by the rule"; it now waits for a person.
