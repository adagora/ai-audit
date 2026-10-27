# Raport audytowy AI (2026-10-26T23:00:00Z – 2026-10-28T00:00:00Z)

Integralność łańcucha: OK ✅

| Metryka | Wartość |
|---|---|
| decisions | 1 |
| reviewed | 1 |
| unreviewed | 0 |
| overridden | 0 |
| overrideRatePct | 0 |
| withReplayableStep | 1 |

## Kroki QDL
| status | liczba |
|---|---|
| completed | 1 |
| refused | 0 |
| failed | 0 |

## Wersje polityk QDL
Wersje są numerowane z całego dziennika. „aktualna” oznacza wersję ostatniej decyzji w całym dzienniku, nie ostatnią w tym oknie.
### monitoring-demo / machining-quote
- v1 (aktualna) ql_283f225a061c… „CAD machining quote policy v1”: decyzje 1, 2026-10-27T10:14:38.229Z – 2026-10-27T10:14:38.229Z

## Decyzje według systemu
- monitoring-demo / machining-quote: 1

## Cytowane źródła
- brak

## Modele

## Wywołania LLM przez proxy
| Metryka | Wartość |
|---|---|
| calls | 23 |
| blocked | 0 |
| redacted | 0 |
| withFindings | 0 |
| withInjectionSignals | 8 |
| withQuinelings | 3 |
| contentLogged | 0 |
| upstreamErrors | 3 |
| inputTokens | 900 |
| outputTokens | 18 |
| unknownInputUsage | 2 |
| unknownOutputUsage | 2 |
| unknownUsage | 2 |
| tokensComplete | false |

> Token totals are a lower bound: 2 call(s) without usage from the provider (unknown, not zero).

### Według dostawcy / modelu / systemu
- openai / mock / -: 18
- openai / no-usage / -: 2
- openai / fail-5xx / -: 3

### Wykryte reguły (tylko ID)

### Sygnały prompt injection (advisory, tylko ID)
- pi-ignore-instructions: 8
- pi-system-prompt: 8

### Quinelings w ruchu (tylko hashe, ADR 0024)
- result run completed: 3

_Raport generowany automatycznie z dziennika. Nie stanowi porady prawnej._
