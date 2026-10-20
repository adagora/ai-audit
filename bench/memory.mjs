// Reproducible memory/latency benchmark. Usage (inside either image):
//   node bench/memory.mjs [textRequests=3000] [uniqueImages=100]
// Mock upstream runs here; the proxy runs in a forked child so only its memory is measured. No network beyond 127.0.0.1.
import http from "node:http";
import { fork } from "node:child_process";
import { readFileSync } from "node:fs";
import { once } from "node:events";
const N = Number(process.argv[2] ?? 3000), IMGS = Number(process.argv[3] ?? 100), CONC = 16;
const AWS = "AKIA" + "IOSFODNN7EXAMPLQ", PESEL = "44051401359"; // synthetic
const up = http.createServer(async (req, res) => {
  for await (const _ of req);
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ model: "mock-1", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 50, completion_tokens: 5 } }));
}).listen(0, "127.0.0.1");
await once(up, "listening");
const child = fork(new URL("./proxy-child.mjs", import.meta.url), { execArgv: ["--expose-gc"], env: { ...process.env, BENCH_UPSTREAM: `http://127.0.0.1:${up.address().port}` } });
const [{ port }] = await once(child, "message");
const mem = async () => { child.send("mem"); return (await once(child, "message"))[0]; };
const base = `http://127.0.0.1:${port}`;
const post = (body) => fetch(`${base}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer sk-bench" }, body: JSON.stringify(body) }).then((r) => r.arrayBuffer().then(() => r.status));
const filler = "Część CNC: frezowanie aluminium 6061, tolerancja ±0.02 mm, 40 szt. ".repeat(20);
const textReq = (i) => ({ model: ["gpt-4o-mini", "gpt-4o", "claude-x"][i % 3], messages: [
  { role: "system", content: "You quote machining jobs." },
  { role: "user", content: `${filler} req ${i} key ${AWS} pesel ${PESEL} mail jan${i}@firma.pl` },
  { role: "tool", tool_call_id: "t1", content: JSON.stringify({ rows: Array.from({ length: 30 }, (_, k) => ({ part: `P-${i}-${k}`, qty: k, price: k * 1.5 })) }) }] });
const png = readFileSync(new URL("../test/fixtures/clean.png", import.meta.url));
const imgReq = (i) => ({ model: "gpt-4o-mini", messages: [{ role: "user", content: [{ type: "text", text: "what is this" },
  { type: "image_url", image_url: { url: "data:image/png;base64," + Buffer.concat([png, Buffer.from(`#${i}`)]).toString("base64") } }] }] }); // unique bytes after IEND -> unique cache key

const m0 = await mem();
const lat = []; let bad = 0;
const run = async (count, make) => { let next = 0; await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < count) { const i = next++; const t = performance.now(); const s = await post(make(i)); lat.push(performance.now() - t); if (s !== 200) bad++; } })); };
const t0 = performance.now();
await run(N, textReq);
const textSec = (performance.now() - t0) / 1000;
await run(IMGS, imgReq);
await run(IMGS, imgReq); // second pass: cache hits
const st = await fetch(`${base}/audit/stats?by=model`, { headers: { "x-admin-key": "bench-admin" } }).then((r) => r.status);
const m1 = await mem();
lat.sort((a, b) => a - b);
const MB = (x) => +(x / 2 ** 20).toFixed(2);
console.log(JSON.stringify({ node: process.version, pc: process.config.variables.v8_enable_pointer_compression ?? 0, N, IMGS, non200: bad, statsStatus: st,
  idle: { rss: MB(m0.rss), heapUsed: MB(m0.heapUsed) }, after: { rss: MB(m1.rss), heapUsed: MB(m1.heapUsed), heapTotal: MB(m1.heapTotal), external: MB(m1.external), maxRSS: MB(m1.maxRSS) },
  textRps: Math.round(N / textSec), p50ms: +lat[lat.length >> 1].toFixed(2), p99ms: +lat[Math.floor(lat.length * 0.99)].toFixed(2) }));
child.kill(); up.close();
