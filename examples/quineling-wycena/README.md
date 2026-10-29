# Toolroom quote rule

A toolroom quotes machined parts. The LLM reads the request and estimates the work: blank mass, hours per machine group, cooperation and its own confidence. A fixed QDL program, [policy.json](policy.json), turns those numbers into a price with the company's rates and decides whether the quote may go out or goes to the estimator. The model judges; the rule calculates; a person reviews.

```sh
npm run example:wycena
npm run example:wycena -- --console
npm run example:wycena -- --live --model gpt-4o-mini --log live/wycena.jsonl --console
```

To close the loop, add `--wait` (with `--console`, or approve with `ai-audit approve` from another terminal): quotes the rule may send go to `outbox/` at once; the others wait up to `--wait-minutes` (default 30) for your verdict. An approval sends the quote to `outbox/`, a rejection or override does not, and each outcome is recorded as an `effect` ([ADR 0055](../../docs/adr/0055-act-after-verdict.md)). `npm run example:wycena -- --console --wait`.

The first command runs five example parts from [parts.json](parts.json) through the real proxy with scripted LLM answers. No provider is called. `--console` then opens the [operator console](../../README.md#operator-console) on `127.0.0.1:8795` over the same log, as reviewer `kierownik` (`--reviewer NAME`), so each quote waits in Decisions for a verdict. `--live` sends the same parts to OpenAI with the toolroom prompt in [prompt.txt](prompt.txt) and needs `OPENAI_API_KEY`; it costs money.

| Rule | Value |
|---|---|
| Rates per hour | DMU 50 240 PLN; MAS 1016, CTX 650 and plasma 150 PLN; conventional lathes, mills and grinders 105 PLN; setup 120 PLN; programming 150 PLN; manual work 80 PLN; inspection 110 PLN; worker cost 65 PLN |
| Material | 6 PLN/kg for every material (18G2A) |
| Price | cost = material + setup + programming + machining + manual + inspection + cooperation, plus 10 % reserve; price = cost + 25 % markup (20 % margin) |
| To the estimator when | the material is not on the drawing, cooperation is needed, the LLM confidence is below 0.7, or the price is above 5000 PLN |

The program uses all 64 nodes and 16 outputs that QDL 1 allows. The rates are example market values, not quotes from a supplier. The parts are synthetic.

What the five parts show:

- Every material is priced as 18G2A at 6 PLN/kg. The 42CrMo4 shaft and the 7075 aluminium housing get a material cost that is too low. The rule needs a price per material from the company's list.
- The rule does not compare the LLM's own price with its own. The bracket is 22 % below the program price, and the quote still goes out at the program price. That is correct for the price, but a large gap often means the hours are wrong.
- The rule trusts the LLM's hours and blank mass. In a live run on 2026-10-24, gpt-4o-mini gave the finished mass instead of the blank mass; no threshold caught it.
