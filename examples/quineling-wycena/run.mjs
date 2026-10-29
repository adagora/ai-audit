import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { AuditLog, report, sha256 } from "../../dist/src/audit.js";
import { createConsole } from "../../dist/src/console.js";
import { createProxy } from "../../dist/src/proxy.js";
import { recordQdl, replayQdl } from "../../dist/src/qdl.js";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const live = args.includes("--live"), openConsole = args.includes("--console");
const model = option("--model", "gpt-4o-mini"), reviewer = option("--reviewer", "kierownik");
const providerKey = (process.env.OPENAI_API_KEY ?? "").trim();
if (live && !providerKey) { console.error("--live needs OPENAI_API_KEY"); process.exit(2); }

const here = (name) => new URL(`./${name}`, import.meta.url);
const POLICY = JSON.parse(readFileSync(here("policy.json"), "utf8"));
const { parts: PARTS } = JSON.parse(readFileSync(here("parts.json"), "utf8"));
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
const REASONS = { materialOnDrawing: [false, "materiał przyjęty (brak na rysunku)"], cooperation: [true, "kooperacja"], lowConfidence: [true, "pewność < 0,7"], priceAbove5000: [true, "cena > 5000 PLN"] };

let upstream;
if (!live) {
  upstream = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const part = PARTS.find((p) => body.messages.at(-1).content.includes(p.id));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ model: "scripted-llm", choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(part.scripted) } }], usage: { prompt_tokens: 1900, completion_tokens: 700 } }));
  }).listen(0, "127.0.0.1");
  await new Promise((r) => upstream.once("listening", r));
}

const logPath = resolve(option("--log", join(mkdtempSync(join(tmpdir(), "wycena-")), "audit.jsonl")));
const dir = dirname(logPath);
mkdirSync(dir, { recursive: true });
const log = new AuditLog(logPath);
const clientKey = `aia-${randomBytes(18).toString("base64url")}`;
const gateway = {
  keys: [{ name: "narzedziownia", sha256: sha256(clientKey), useCases: ["wycena"] }],
  useCases: { wycena: { tier: "assist", models: [model, "scripted-llm"] } },
};
writeFileSync(join(dir, "gateway.json"), JSON.stringify(gateway, null, 2));
const proxy = createProxy({ log, mode: "redact", quiet: true, ...gateway, upstreamAnthropic: "http://127.0.0.1:1",
  upstreamOpenai: live ? "https://api.openai.com" : `http://127.0.0.1:${upstream.address().port}`, upstreamKeys: { openai: live ? providerKey : "sk-offline" } }).listen(0, "127.0.0.1");
await new Promise((r) => proxy.once("listening", r));

const money = (v) => typeof v === "number" ? v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "—";
const rows = [];
for (const part of PARTS) {
  const request = part.request.join("\n");
  const res = await fetch(`http://127.0.0.1:${proxy.address().port}/v1/chat/completions`, { method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${clientKey}`, "x-audit-system-id": "narzedziownia" },
    body: JSON.stringify({ model: live ? model : "scripted-llm", temperature: 0, max_tokens: 6000, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: request }],
      response_format: { type: "json_schema", json_schema: { name: "wycena", strict: true, schema: SCHEMA } } }) });
  if (!res.ok) throw new Error(`${part.id}: HTTP ${res.status} ${await res.text()}`);
  const llmCallId = res.headers.get("x-request-id"), body = await res.json(), answer = JSON.parse(body.choices[0].message.content);
  writeFileSync(join(dir, `${part.id.replaceAll("/", "-")}.md`), `# ${part.id} ${part.title}\n\nRekomendacja: ${answer.rekomendacja}\n\n${answer.analiza}\n`);
  for (let wait = 0; wait < 100 && !log.read().some((r) => r.id === llmCallId); wait++) await new Promise((r) => setTimeout(r, 20));
  const { decision, step } = await recordQdl(log, { systemId: "narzedziownia", useCase: "wycena", llmCallId, input: request, model: { name: body.model, version: "2026-10" },
    params: { czesc: part.id, cenaLlm: answer.cenaLlm, rekomendacja: answer.rekomendacja } }, { intent: POLICY }, answer.dane);
  if (step.qdl.status !== "completed") { rows.push({ part, answer, decision, refused: `${step.qdl.error.code} at ${step.qdl.error.path}` }); continue; }
  const out = decision.output, [send, review] = [out[14], out[15]];
  const why = Object.entries(review.payload).filter(([k, v]) => v === REASONS[k][0]).map(([k]) => REASONS[k][1]);
  rows.push({ part, answer, decision, price: out[11], perPiece: out[12], cost: out[8], profit: out[9], margin: out[10], laborCost: out[13], material: out[0],
    route: send.status === "simulated" ? "send-quote-to-customer" : "route-to-estimator", why, replay: (await replayQdl(log, decision.id)).reproduced });
}

console.log(`Reguła: ${POLICY.name}`);
console.log(`Stawki: DMU 50 ${constant("rateCnc5")}, CNC ${constant("rateCnc")}, konwencjonalne ${constant("rateConventional")}, przygotowanie ${constant("setupRate")}, programowanie ${constant("programmingRate")}, ręczne ${constant("manualRate")}, kontrola ${constant("inspectionRate")}, pracownik ${constant("workerCost")} PLN/h; materiał ${constant("steelPrice")} PLN/kg; rezerwa ${constant("reservePct") * 100} %; narzut ${constant("markupPct") * 100} %`);
console.log(`Model: ${live ? model : "scripted-llm (offline, odpowiedzi z parts.json)"}\n`);
for (const r of rows) {
  console.log(`${r.part.id}  ${r.part.title}  [${r.part.machine}]`);
  if (r.refused) { console.log(`  program odmówił: ${r.refused}\n`); continue; }
  console.log(`  LLM: ${r.answer.rekomendacja}, pewność ${r.answer.dane.confidence}, jego cena ${money(r.answer.cenaLlm)} PLN`);
  console.log(`  program: materiał ${money(r.material)}, koszt ${money(r.cost)}, zarobek ${money(r.profit)} (marża ${(r.margin * 100).toFixed(1)} %), cena ${money(r.price)} PLN, za sztukę ${money(r.perPiece)} PLN, koszt pracownika ${money(r.laborCost)} PLN`);
  console.log(`  różnica LLM − program: ${money(r.answer.cenaLlm - r.price)} PLN (${(((r.answer.cenaLlm - r.price) / r.price) * 100).toFixed(1)} %)`);
  console.log(`  decyzja: ${r.route === "send-quote-to-customer" ? "wyślij ofertę" : `do kierownika: ${r.why.join(", ")}`}; replay z logu: ${r.replay ? "ten sam wynik" : "INNY WYNIK"}\n`);
  console.log(`decision ${r.part.id}: ${r.route} ${r.price.toFixed(2)} ${r.decision.id}`);
}
const chain = log.verifyChain(), { useCases } = report(log, "1970", "9999");
const wycena = useCases.find((u) => u.useCase === "wycena");
console.log(`\nchain: ${chain.ok ? "ok" : "BROKEN"}`);
console.log(`use case wycena: ${wycena.calls} wywołań, ${wycena.redacted} z zamaskowanymi danymi, ${wycena.decisions} decyzji, ${wycena.reviewed} ocenionych`);
console.log(`files: ${dir} (audit.jsonl, gateway.json, analizy *.md)`);
console.log(`console: node dist/src/cli.js console --log ${logPath} --config ${join(dir, "gateway.json")} --reviewer ${reviewer}`);
proxy.close(); upstream?.close();

if (openConsole) {
  const app = createConsole({ log, configPath: join(dir, "gateway.json"), reviewer });
  const port = Number(process.env.WYCENA_CONSOLE_PORT ?? 8795);
  await new Promise((r) => app.server.listen(port, "127.0.0.1", r));
  console.log(`\nKonsola operatora: ${app.url()}\nOtwórz Decisions: każda wycena czeka na Twój werdykt. Ctrl+C kończy.`);
}
