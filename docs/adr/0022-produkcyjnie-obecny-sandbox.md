# 22. Produkcyjnie obecny sandbox, Rust tylko z konkretnego powodu
Status: Zaakceptowana (2026-10-21)
## Kontekst
preflight ma workera w Ruście, który sam ustawia `RLIMIT_AS` 1,5 GiB. Nasz worker to Node. Węższy limit przestrzeni adresowej zabija Node z kompresją wskaźników przy starcie (ADR 0003). Przepisanie workera na Rust usunęłoby tę różnicę, ale dodałoby drugi język i krok budowania natywnego.
## Decyzja
- Na start produkcyjnie obecne rozwiązanie: bwrap, fail closed (ADR 0021), limit danych (`RLIMIT_DATA` 4 GiB) zamiast limitu przestrzeni adresowej dla workera Node. Pozostałe limity mają wartości z preflight; `RLIMIT_AS` 1,5 GiB dostają tylko narzędzia natywne.
- Przepisanie workera na Rust rozważamy dopiero przy realnym powodzie: atak lub incydent, audyt z takim wymogiem albo skala.
## Konsekwencje
- Jeden język i zero zależności runtime (ADR 0001) zostają.
- Pamięć wirtualna samego workera nie jest ograniczona tak ściśle jak w preflight; ogranicza ją limit danych, a narzędzia natywne mają limit przestrzeni adresowej.
