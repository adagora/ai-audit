# Quote decision evaluation

`npm run example:evaluate` runs the [machining quote QDL policy](../quineling-quote/policy.json) on 12 labeled numeric cases. The report separates six development cases from six holdout-designated boundary cases, and checks that a fresh Quinelings session reproduces every result.

`npm run example:evaluate:openai -- --output /private/tmp/quote-evaluation.json` also asks the [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions) whether each case needs human review. It reads `OPENAI_API_KEY` from the environment or the ignored `.env` file. `--repeats 3` is the default for a live run. Each API answer is recorded separately, with its probability, latency, refusal and reported token usage. QDL evaluation and replay timings are also recorded. The 0.5 threshold and question are fixed before evaluating the holdout cases. The output file must not exist and is created with owner-only permissions.

The report contains case IDs, labels, predictions, hashes and measurements. It omits numeric input facts and the API key. The API receives only the numeric facts in [quotes.json](quotes.json). `TYPESAFE_API_KEY` is not used by this evaluator.

These 12 cases are synthetic boundary checks. Their holdout was visible during harness design, so it is not a blinded test. Zero misses here does not establish a production error rate. For a business claim, replace them with independently labeled, representative cases and keep the holdout sealed until the question and threshold are fixed. OpenAI Decisions is an advisory model judgment; QDL is the reproducible rule. Neither is wired into proxy forwarding or a human approval queue.

In the 2026-10-28 live run against `gpt-6-luna`, QDL matched all 12 fixture labels and reproduced all results. OpenAI Decisions made 3 misses and 15 false alerts across 36 answers at the fixed threshold, with no binary answer flips in three repeats. This result supports using QDL for the exact pricing rule. It does not measure how Decisions performs on semantic questions or on representative business data.
