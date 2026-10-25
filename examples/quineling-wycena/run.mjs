import http from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLog } from "../../dist/src/audit.js";
import { createProxy } from "../../dist/src/proxy.js";
import { recordQdl, replayQdl } from "../../dist/src/qdl.js";

const live = process.argv.includes("--live");
const model = process.argv.includes("--model") ? process.argv[process.argv.indexOf("--model") + 1] : "gpt-4o-mini";
const key = (process.env.OPENAI_API_KEY ?? "").trim();
if (live && !key) { console.error("--live needs OPENAI_API_KEY"); process.exit(2); }

const here = (name) => new URL(`./${name}`, import.meta.url);
const POLICY = JSON.parse(readFileSync(here("policy.json"), "utf8"));
const constant = (id) => POLICY.inputs.find((i) => i.id === id).value;

const FIELDS = {
  quantity: ["integer", "liczba sztuk w partii"],
  blankKg: ["number", "masa półfabrykatu jednej sztuki w kg, z naddatkami"],
  materialStated: ["boolean", "true, jeśli materiał jest na rysunku; false, jeśli przyjąłeś 18G2A"],
  cnc5Hours: ["number", "godziny na DMU 50 (5 osi) dla całej partii"],
  cncHours: ["number", "godziny na MAS 1016, CTX 650 i plazmie AJAN dla całej partii"],
  conventionalHours: ["number", "godziny na tokarkach, frezarkach konwencjonalnych i szlifierkach dla całej partii"],
  setupHours: ["number", "przygotowanie: ustawienia i mocowania dla całej partii"],
  programmingHours: ["number", "programowanie CNC/CAM"],
  manualHours: ["number", "operacje ręczne (ślusarskie, gratowanie) dla całej partii"],
  inspectionHours: ["number", "kontrola dla całej partii"],
  cooperationCost: ["number", "koszt kooperacji w PLN dla całej partii, 0 jeśli brak"],
  confidence: ["number", "pewność wyceny od 0 do 1"],
};
const SYSTEM = readFileSync(here("prompt.txt"), "utf8") + "\n\nFORMAT ODPOWIEDZI\nOdpowiedz jednym obiektem JSON. Pole `analiza` to pełna odpowiedź według punktów 1–10 powyżej (markdown). "
  + "Pole `cenaLlm` to Twoja cena całkowita netto w PLN dla całej partii. Pole `dane` to liczby, z których program firmy policzy wycenę według stawek firmy:\n"
  + Object.entries(FIELDS).map(([id, [, text]]) => `- ${id}: ${text}`).join("\n");
const SCHEMA = { type: "object", additionalProperties: false, required: ["analiza", "rekomendacja", "cenaLlm", "dane"], properties: {
  analiza: { type: "string" },
  rekomendacja: { type: "string", enum: ["wykonalne bez zmian", "wykonalne po zmianach", "częściowo do kooperacji", "niewykonalne / nieopłacalne"] },
  cenaLlm: { type: "number" },
  dane: { type: "object", additionalProperties: false, required: Object.keys(FIELDS), properties: Object.fromEntries(Object.entries(FIELDS).map(([id, [type, description]]) => [id, { type, description }])) },
} };
const PART = [
  "Zapytanie ofertowe ZO/2026/114. Detal: płyta mocująca przyrządu, rysunek PM-114 rev. B. Ilość: 10 szt.",
  "Wymiary gotowego detalu 400 × 250 × 40 mm. Materiał: nie podano na rysunku.",
  "4 kieszenie prostokątne 120 × 80 × 15 mm, R6 w narożach; 12 otworów M12 na głębokość 20 mm; 2 otwory pasowane Ø16 H7 w rozstawie 300 ± 0,02 mm.",
  "Płaskość obu płaszczyzn 0,02 mm, Ra 0,8 na płaszczyźnie bazowej, pozostałe powierzchnie Ra 3,2, krawędzie stępione 0,5 × 45°. Bez obróbki cieplnej i powłok.",
  "Model 3D (odczyt z CAD klienta): objętość 3,40 dm³, masa 26,7 kg.",
  "Tabliczka rysunkowa: konstruktor Jan Kowalski, e-mail jan.kowalski@przyklad-firma.pl, tel. +48 601 234 567.",
].join("\n");
const SCRIPTED = {
  analiza: "## Rzeczy pewne\nPłyta 400 × 250 × 40 mm, 10 szt., kieszenie, gwinty M12, 2 × Ø16 H7, płaskość 0,02.\n## Założenia\nMATERIAŁ NIE JEST PODANY – PRZYJĄŁEM STAL 18G2A. Półfabrykat 410 × 260 × 45 mm.\n"
    + "## Marszruta\n1. Cięcie półfabrykatu (piła). 2. Frezowanie MAS 1016, 2 zamocowania. 3. Szlifowanie obu płaszczyzn, Favretto. 4. Gratowanie i stępienie krawędzi. 5. Kontrola.\n"
    + "## Ryzyka\nOdkształcenie po zdjęciu naprężeń, płaskość 0,02 po frezowaniu kieszeni, rozstaw H7 300 ± 0,02, bicie na szlifierce, brak potwierdzenia materiału.",
  rekomendacja: "wykonalne bez zmian",
  cenaLlm: 6900,
  dane: { quantity: 10, blankKg: 37.7, materialStated: false, cnc5Hours: 0, cncHours: 12, conventionalHours: 6, setupHours: 3, programmingHours: 3, manualHours: 3, inspectionHours: 2.5, cooperationCost: 0, confidence: 0.75 },
};

let upstream, received;
if (!live) {
  upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    received = JSON.parse(Buffer.concat(chunks).toString());
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: "scripted-llm", choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(SCRIPTED) } }], usage: { prompt_tokens: 1900, completion_tokens: 700 } }));
  }).listen(0, "127.0.0.1");
  await new Promise((r) => upstream.once("listening", r));
}
const dir = mkdtempSync(join(tmpdir(), "wycena-")), log = new AuditLog(join(dir, "audit.jsonl"));
const proxy = createProxy({ log, mode: "redact", quiet: true, upstreamAnthropic: "http://127.0.0.1:1",
  upstreamOpenai: live ? "https://api.openai.com" : `http://127.0.0.1:${upstream.address().port}` }).listen(0, "127.0.0.1");
await new Promise((r) => proxy.once("listening", r));

const res = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat/completions`, { method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${live ? key : "sk-offline"}`, "x-audit-system-id": "narzedziownia", "x-audit-use-case": "wycena" },
  body: JSON.stringify({ model, temperature: 0, max_tokens: 6000, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: PART }],
    response_format: { type: "json_schema", json_schema: { name: "wycena", strict: true, schema: SCHEMA } } }) });
if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
const llmCallId = res.headers.get("x-request-id"), body = await res.json(), answer = JSON.parse(body.choices[0].message.content);
writeFileSync(join(dir, "analiza.md"), answer.analiza + "\n");
let call;
for (let wait = 0; !call && wait < 100; wait++) { call = log.read().find((r) => r.id === llmCallId); if (!call) await new Promise((r) => setTimeout(r, 20)); }

console.log("1. The proxy, before the request left your machine");
console.log(`   masked: ${call.decision.findings.map((f) => `${f.rule} at ${f.path}`).join(", ") || "nothing"}; the name "Jan Kowalski" stays (the scanner has no rule for names)`);
if (received) console.log(`   the provider got: ${received.messages[1].content.split("\n").at(-1)}`);
console.log(`   logged: llm-call ${llmCallId.slice(0, 8)}…, ${call.usage?.input ?? "?"} input and ${call.usage?.output ?? "?"} output tokens\n`);

console.log(`2. The LLM (${body.model}): the judgment of a technologist`);
console.log(`   recommendation: ${answer.rekomendacja}; confidence ${answer.dane.confidence}; its own price ${answer.cenaLlm.toFixed(2)} PLN (with rates that it chose itself)`);
console.log(`   its numbers: ${Object.entries(answer.dane).map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`   full analysis: analiza.md\n`);

const { decision, step } = await recordQdl(log, { systemId: "narzedziownia", useCase: "wycena", llmCallId, input: PART, model: { name: body.model, version: "2026-10" } }, { intent: POLICY }, answer.dane);
if (step.qdl.status !== "completed") {
  console.log(`3. The program refused the LLM numbers: ${step.qdl.error.code} at ${step.qdl.error.path}; recorded as decision ${decision.id.slice(0, 8)}…`);
  process.exitCode = 1;
} else {
  const [material, preparation, programming, machining, manual, inspection, cooperation, reserve, cost, profit, margin, price, perPiece, laborCost, send, review] = decision.output;
  const line = (label, v) => console.log(`   ${label.padEnd(42)}${v.toFixed(2).padStart(10)} PLN`);
  console.log(`3. The program ${step.qdl.sourceHash.slice(0, 15)}…: your rates, your reserve and your markup`);
  [["materiał (18G2A, 6.00 PLN/kg)", material], ["przygotowanie", preparation], ["programowanie", programming], ["obróbka", machining], ["operacje ręczne", manual],
    ["kontrola", inspection], ["kooperacja", cooperation], [`rezerwa (${constant("reservePct") * 100} %)`, reserve]].forEach(([l, v]) => line(l, v));
  line("koszt", cost);
  line(`zarobek (narzut ${constant("markupPct") * 100} %, marża ${(margin * 100).toFixed(1)} %)`, profit);
  line("cena netto za partię", price);
  line(`cena netto za sztukę (${answer.dane.quantity} szt.)`, perPiece);
  line(`koszt pracownika (${constant("workerCost")} PLN/h, w stawkach)`, laborCost);
  const REASONS = { materialOnDrawing: [false, "the material is not on the drawing (18G2A assumed)"], cooperation: [true, "cooperation is necessary"],
    lowConfidence: [true, "the LLM confidence is below 0.7"], priceAbove5000: [true, "the price is above 5000 PLN"] };
  const why = Object.entries(review.payload).filter(([k, v]) => v === REASONS[k][0]).map(([k]) => REASONS[k][1]);
  console.log(`\n4. Decision: ${send.status === "simulated" ? "send-quote-to-customer" : `route-to-estimator, because: ${why.join(", ")}`}`);
  console.log(`   the LLM price ${answer.cenaLlm.toFixed(2)} PLN, the program price ${price.toFixed(2)} PLN: difference ${(answer.cenaLlm - price).toFixed(2)} PLN\n`);
  const again = await replayQdl(log, decision.id);
  console.log(`5. Replay from the log only: reproduced=${again.reproduced}, chain ${log.verifyChain().ok ? "ok" : "BROKEN"}`);
}
console.log(`   files: ${dir} (audit.jsonl, analiza.md)`);
proxy.close(); upstream?.close();
