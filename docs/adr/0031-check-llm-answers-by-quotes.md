# 31. Values an LLM reads from a text are checked against quotes from that text
Status: Accepted (2026-10-25)
## Context
The proxy inspects what goes to the model and returns the answer unchanged. A policy (ADR 0023) then computes correctly from whatever values the model extracted. In live runs gpt-4o-mini counted material for 1 piece of a 10-piece batch, used the finished mass where the blank mass was asked, gave confidence 0.85 every time, and gave 4 different answers to 5 identical calls. A policy can redo a calculation, but no step checks that an extracted value is the one the text states. Units and fixed steps do not catch a misread value, and repeating the call does not catch an error the model makes every time. Checking a value needs the text it came from, and ai-audit must stay free of any one industry.
## Decision
- An answer to check is a JSON object of fields `{ "value": string | number | boolean | null, "quote": string | null }`; `quote` is text copied from the source. The client asks the model for this shape and passes only the fields read from the source.
- `checkQuotes(source, answer)` in `src/quotes.ts` and `ai-audit check-quotes --source FILE --answer FILE` give one issue per field, checked in this order:
  - `quote-missing`: no quote, an empty one, or one made only of proxy masks.
  - `quote-not-in-source`: the quote is not in the source.
  - `value-not-in-quote`: a number or text value does not appear in its quote.
- Both texts are compared after NFKC, lower case and collapsed whitespace. A `[REDACTED:rule]` in a quote stands for at least one character of the original, so a quote from the masked request still matches the source the client holds. Fragments are matched in order with `indexOf`, so time is linear in the source.
- A number counts as found when the quote has it as an integer, a decimal with `.` or `,`, or a number grouped by 3 digits with a space, `.` or `,`. A positive value also matches the same number with a minus sign; a negative value needs the minus.
- Output is `{ok, checked, issues: [{field, code}]}`: field names and codes only, never a value or a quote. Exit 0 when ok, 1 with issues, 2 for bad arguments or files.
- The check runs in the client and writes nothing to the log. The client passes the number of issues to its policy as an input, so the decision record keeps it and the policy can route it to review.
## Consequences
- A misread number, an invented value and a quote the source does not contain go to a person. Nothing here knows a domain: ranges and cross-checks stay in each company's policy.
- A wrong value with a real quote of another passage is not caught, nor is an assumption the text never states (the client marks those with `quote: null`, which is an issue).
- Words for numbers ("ten"), reformatted dates and translated values are issues: the check sends doubt to a person rather than guess.
- Parts of a decimal also count as found: 10 is found in "10,5".
- Running the same check in the proxy, for every client, needs a fixed answer format and a new ADR.
