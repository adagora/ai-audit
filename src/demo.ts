// DANE PRZYKŁADOWE / EXAMPLE DATA — wszystkie osoby, dokumenty i ceny są fikcyjne.
import { rmSync, writeFileSync } from "node:fs";
import { AuditLog, replay, report } from "./audit.js";

const path = "demo-log.jsonl"; rmSync(path, { force: true });
const log = new AuditLog(path);

// 1) RAG answer citing a PDF page (EXAMPLE)
const rag = log.record({
  systemId: "rag-dokumentacja", useCase: "Q&A dokumentacja techniczna (PRZYKŁAD)",
  input: "Jan Kowalski (jan.kowalski@example.com): jaki moment dokręcania śrub M8 w bramie X-100?",
  storeRedactedInput: true,
  sources: [{ doc: "PRZYKLAD_instrukcja_X-100.pdf", page: 42 }],
  model: { name: "example-llm", version: "2026-09" },
  prompt: { templateId: "rag-answer-v3", template: "Odpowiedz tylko na podstawie: {{context}}\nPytanie: {{q}}" },
  params: { temperature: 0, topK: 5 },
  output: "25 Nm (instrukcja X-100, s. 42).",
});
log.approve(rag.id, "inż. A. Nowak (PRZYKŁAD)", "approved");

// 2) CAD quote with replayable deterministic price step (EXAMPLE)
const priceStep = `(input, tick) => {
  let minutes = 0;
  for (const op of input.ops) { tick(); minutes += op.volumeCm3 / op.removalRateCm3PerMin; }
  const machine = Math.round(minutes * input.ratePlnPerMin * 100) / 100;
  return { minutes: Math.round(minutes * 100) / 100, pricePln: Math.round((machine + input.materialPln) * 100) / 100 };
}`;
const stepInput = { ops: [{ volumeCm3: 120, removalRateCm3PerMin: 8 }, { volumeCm3: 30, removalRateCm3PerMin: 2 }], ratePlnPerMin: 3.5, materialPln: 84 };
const stepOut = { minutes: 30, pricePln: 189 };
const quote = log.record({
  systemId: "wycena-step", useCase: "Wycena części z pliku STEP (PRZYKŁAD)",
  input: "PRZYKLAD_wspornik.step sha:abc123",
  model: { name: "example-llm", version: "2026-09" },
  prompt: { templateId: "tech-assess-v1", template: "Oceń technologię dla: {{features}}" },
  params: { temperature: 0.2 },
  output: { pricePln: 199, note: "LLM: +10 PLN ryzyko gwintu" },
  step: { source: priceStep, input: stepInput, output: stepOut },
});
log.approve(quote.id, "technolog M. Wiśniewska (PRZYKŁAD)", "overridden", "cena skorygowana do 189 PLN wg kroku deterministycznego");

console.log("verifyChain:", log.verifyChain());
console.log("replay(quote):", replay(log, quote.id));
const { md } = report(log, "2000-01-01", "2100-01-01");
writeFileSync("demo-report.md", md);
console.log("\n" + md);
