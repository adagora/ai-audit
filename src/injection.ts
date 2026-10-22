export interface Signal { category: "prompt_injection"; rule: string; path: string }

const SAME_SENTENCE_GAP = String.raw`[^.\n]{0,60}`;
export const INJECTION_RULES: { id: string; re: RegExp }[] = [
  { id: "pi-ignore-instructions", re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+|my\s+)?(?:previous|prior|above|earlier|preceding|all)\s+(?:instructions|prompts|directions|rules|guidelines)\b/i },
  { id: "pi-system-prompt", re: /\b(?:ignore|disregard|forget|reveal|print|leak|repeat)\s+(?:the\s+|your\s+)?(?:system|developer)\s+(?:prompt|message|instructions)\b/i },
  { id: "pi-role-marker", re: /<\|im_(?:start|end)\|>|<\|(?:system|assistant|user)\|>|\[\/?INST\]|<<\/?SYS>>|^[ \t#*]*\[?(?:system|assistant)\]?[ \t]*:[ \t]*(?=you\b|ignore\b|new instructions\b|from now on\b)/im },
  { id: "pi-persona-switch", re: new RegExp(String.raw`\byou are now\s+(?:DAN\b|(?:a|an|the)\b${SAME_SENTENCE_GAP}\b(?:assistant|AI|model|agent|bot|jailbroken|unrestricted)\b)|\bfrom now on,?\s+you\s+(?:will|must|are|should)\b`, "i") },
  { id: "pi-exfil-url", re: new RegExp(String.raw`\b(?:send|post|forward|upload|exfiltrate|transmit|leak)\b${SAME_SENTENCE_GAP}\b(?:conversation|chat|history|secrets?|credentials?|api[ _-]?keys?|tokens?|passwords?|system prompt|env(?:ironment)? variables?)\b${SAME_SENTENCE_GAP}\b(?:to|at)\s+https?://`, "i") },
  { id: "pi-hidden-instruction", re: /\b(?:do not|don't|never)\s+(?:tell|inform|mention\s+(?:this\s+)?to|reveal\s+(?:this\s+)?to|let)\s+(?:the\s+)?user\b|\bwithout\s+(?:telling|informing|notifying)\s+the\s+user\b|\bnote\s+to\s+(?:the\s+)?(?:ai|assistant|llm|model|agent)\b|\b(?:ai|llm|assistant|agent)s?\s+(?:reading|processing)\s+this\b/i },
  { id: "pi-unicode-tags", re: /[\u{E0000}-\u{E007F}]/u },
  { id: "pi-pl-ignore-instructions", re: /(?<![\p{L}])(?:zignoruj|ignoruj|pomiń|zapomnij)\s+(?:o\s+)?(?:wszystkie\s+|wszystkich\s+)?(?:wcześniejsze|poprzednie|powyższe|wcześniejszych|poprzednich|powyższych|wszystkie)\s+(?:instrukcje|instrukcjach|polecenia|poleceniach|zasady|zasadach)/iu },
  { id: "pi-pl-hidden-instruction", re: /(?<![\p{L}])nie\s+(?:mów|informuj|wspominaj|mówcie)\s+(?:o\s+tym\s+)?użytkownik/iu },
];

export function signalsInText(text: string, path: string, out: Signal[] = []): Signal[] {
  for (const r of INJECTION_RULES) if (r.re.test(text)) out.push({ category: "prompt_injection", rule: r.id, path });
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

export function toolResultSignals(body: any): Signal[] {
  const out: Signal[] = [], scan = (v: unknown, p: string) => texts(v, p).forEach(([t, q]) => signalsInText(t, q, out));
  if (Array.isArray(body?.messages)) body.messages.forEach((m: any, i: number) => {
    if (m?.role === "tool" || m?.role === "function") scan(m.content, `$.messages[${i}].content`);
    if (Array.isArray(m?.content)) m.content.forEach((b: any, j: number) => { if (b?.type === "tool_result") scan(b.content, `$.messages[${i}].content[${j}].content`); });
  });
  if (Array.isArray(body?.input)) body.input.forEach((it: any, i: number) => { if (it?.type === "function_call_output") scan(it.output, `$.input[${i}].output`); });
  return out;
}
