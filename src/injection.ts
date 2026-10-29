export interface Signal { category: "prompt_injection"; rule: string; path: string }

const SAME_SENTENCE_GAP = String.raw`[^.\n]{0,60}`;
const POLISH_ASCII: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
const WORD_START = String.raw`(?<![\p{L}\p{N}_])`;
const WORD_END = String.raw`(?![\p{L}\p{N}_])`;
const polishRule = (id: string, pattern: string) => ({ id: `pi-pl-${id}`, re: new RegExp(
  WORD_START + pattern.replace(/[ąćęłńóśźż]/g, (letter) => `[${letter}${POLISH_ASCII[letter]}]`), "imu") });

export const INJECTION_RULES: { id: string; re: RegExp }[] = [
  { id: "pi-ignore-instructions", re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+|my\s+)?(?:previous|prior|above|earlier|preceding|all)\s+(?:instructions|prompts|directions|rules|guidelines)\b/i },
  { id: "pi-system-prompt", re: /\b(?:ignore|disregard|forget|reveal|print|leak|repeat)\s+(?:the\s+|your\s+)?(?:system|developer)\s+(?:prompt|message|instructions)\b/i },
  { id: "pi-role-marker", re: /<\|im_(?:start|end)\|>|<\|(?:system|assistant|user)\|>|\[\/?INST\]|<<\/?SYS>>|^[ \t#*]*\[?(?:system|assistant)\]?[ \t]*:[ \t]*(?=you\b|ignore\b|new instructions\b|from now on\b)/im },
  { id: "pi-persona-switch", re: new RegExp(String.raw`\byou are now\s+(?:DAN\b|(?:a|an|the)\b${SAME_SENTENCE_GAP}\b(?:assistant|AI|model|agent|bot|jailbroken|unrestricted)\b)|\bfrom now on,?\s+you\s+(?:will|must|are|should)\b`, "i") },
  { id: "pi-exfil-url", re: new RegExp(String.raw`\b(?:send|post|forward|upload|exfiltrate|transmit|leak)\b${SAME_SENTENCE_GAP}\b(?:conversation|chat|history|secrets?|credentials?|api[ _-]?keys?|tokens?|passwords?|system prompt|env(?:ironment)? variables?)\b${SAME_SENTENCE_GAP}\b(?:to|at)\s+https?://`, "i") },
  { id: "pi-hidden-instruction", re: /\b(?:do not|don't|never)\s+(?:tell|inform|mention\s+(?:this\s+)?to|reveal\s+(?:this\s+)?to|let)\s+(?:the\s+)?user\b|\bwithout\s+(?:telling|informing|notifying)\s+the\s+user\b|\bnote\s+to\s+(?:the\s+)?(?:ai|assistant|llm|model|agent)\b|\b(?:ai|llm|assistant|agent)s?\s+(?:reading|processing)\s+this\b/i },
  { id: "pi-unicode-tags", re: /[\u{E0000}-\u{E007F}]/u },
  polishRule("ignore-instructions", String.raw`(?:zignoruj|ignoruj|pomiń|zapomnij|odrzuć)\s+(?:o\s+)?(?:wszystkie\s+|wszystkich\s+)?(?:wcześniejsze|poprzednie|powyższe|wcześniejszych|poprzednich|powyższych|wszystkie)\s+(?:instrukcje|instrukcjach|polecenia|poleceniach|zasady|zasadach)${WORD_END}`),
  polishRule("system-prompt", String.raw`(?:zignoruj|ignoruj|pomiń|ujawnij|pokaż|wyświetl|wypisz|powtórz|zdradź|podaj)\s+(?:(?:swój|twój|ten|swoje|twoje|te|swoją|twoją|tę)\s+)?(?:prompt\s+(?:systemowy|deweloperski)|(?:instrukcje|polecenia)\s+(?:systemowe|deweloperskie)|wiadomość\s+(?:systemową|deweloperską))${WORD_END}`),
  polishRule("hidden-instruction", String.raw`(?:nie\s+(?:mów|informuj|wspominaj|mówcie|powiadamiaj)\s+(?:o\s+tym\s+)?użytkownik(?:a|owi|om|ów)?|bez\s+(?:wiedzy|informowania|powiadamiania)\s+użytkownika|(?:uwaga|instrukcja)\s+dla\s+(?:asystenta|modelu|agenta|AI|LLM))${WORD_END}`),
  polishRule("persona-switch", String.raw`(?:od\s+teraz|od\s+tej\s+chwili)\s+jesteś\s+(?:DAN|(?:asystentem|modelem|agentem|botem|AI)\s+bez\s+(?:ograniczeń|zasad|filtrów))${WORD_END}`),
  polishRule("role-marker", String.raw`^[ \t#*]*\[?(?:system|asystent)\]?[ \t]*:[ \t]*(?=jesteś${WORD_END}|zignoruj${WORD_END}|ignoruj${WORD_END}|nowe\s+instrukcje${WORD_END}|od\s+teraz${WORD_END})`),
  polishRule("exfil-url", String.raw`(?:wyślij|prześlij|wysyłaj|przesyłaj|przekaż|ujawnij)${WORD_END}${SAME_SENTENCE_GAP}${WORD_START}(?:rozmowę|konwersację|historię\s+(?:rozmowy|czatu)|sekrety|dane\s+logowania|klucze?\s+API|tokeny|hasła|prompt\s+systemowy|zmienne\s+środowiskowe)${WORD_END}${SAME_SENTENCE_GAP}${WORD_START}(?:do|na|pod)(?:\s+adres)?\s+https?://`),
];

export function signalsInText(text: string, path: string, out: Signal[] = []): Signal[] {
  const normalized = text.normalize("NFKC").replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "");
  for (const r of INJECTION_RULES) if (r.re.test(text) || (normalized !== text && r.re.test(normalized)))
    out.push({ category: "prompt_injection", rule: r.id, path });
  return out;
}

export function texts(v: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof v === "string") out.push([v, path]);
  else if (Array.isArray(v)) v.forEach((x, i) => texts(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") {
    const o = v as any;
    if (typeof o.text === "string") out.push([o.text, `${path}.text`]);
    else if (o.content !== undefined) texts(o.content, `${path}.content`, out);
  }
  return out;
}

export function toolResultTexts(body: any): [string, string][] {
  const out: [string, string][] = [], scan = (v: unknown, p: string) => texts(v, p, out);
  if (Array.isArray(body?.messages)) body.messages.forEach((m: any, i: number) => {
    if (m?.role === "tool" || m?.role === "function") scan(m.content, `$.messages[${i}].content`);
    if (Array.isArray(m?.content)) m.content.forEach((b: any, j: number) => { if (b?.type === "tool_result") scan(b.content, `$.messages[${i}].content[${j}].content`); });
  });
  if (Array.isArray(body?.input)) body.input.forEach((it: any, i: number) => { if (it?.type === "function_call_output") scan(it.output, `$.input[${i}].output`); });
  return out;
}

export function toolResultSignals(body: any): Signal[] {
  const out: Signal[] = [];
  for (const [text, path] of toolResultTexts(body)) signalsInText(text, path, out);
  return out;
}

export function firstSightings<T extends Pick<Signal, "rule" | "path">>(signals: T[], sessionId: string | undefined, seen: Set<string>, capacity = Infinity): T[] {
  return signals.filter((signal) => {
    if (sessionId === undefined) return true;
    const key = `${sessionId}\0${signal.rule}\0${signal.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > capacity) seen.delete(seen.values().next().value!);
    return true;
  });
}
