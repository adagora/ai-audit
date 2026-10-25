import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { Session, sourceOnly } from "@quinelings/agent-sdk/v1";

const number = (unit) => ({ kind: "number", unit, min: 0 });
const quote = (floor, machining = "mul") => ({
  format: "qdl-intent", version: 1, name: "Quote with a floor", thought: "price = max(minutes × rate, floor)",
  inputs: [{ id: "minutes", name: "minutes", type: number("min") }, { id: "rate", name: "rate", type: number("PLN*min^-1") }, { id: "floor", value: floor, type: number("PLN") }],
  steps: [{ id: "machining", op: "arithmetic", inputs: ["minutes", "rate"], params: { kind: machining } }, { id: "price", op: "arithmetic", inputs: ["machining", "floor"], params: { kind: "max" } }],
  outputs: ["price"],
});
const short = (id) => `${id.slice(0, 15)}…`;
const yes = (b) => (b ? "yes" : "NO");
const refusal = (f) => { try { f(); return "accepted"; } catch (e) { return `refused: ${e.code} at ${e.path}`; } };
const chain = (record) => record.result.occurrences[0].trace.map((t) => `${t.nodeId}=${t.value}`).join(" → ");

function png(pixels) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8), tail = Buffer.alloc(4);
    head.writeUInt32BE(data.length); head.write(type, 4, "latin1"); tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(pixels[0].length, 0); ihdr.writeUInt32BE(pixels.length, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.concat(pixels.map((row) => Buffer.from([0, ...row.flatMap((p) => (p ? [...p, 255] : [0, 0, 0, 0]))])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

function pixelsOf(file) {
  const b = readFileSync(file), idat = [];
  let at = 8, width = 0;
  while (at < b.length) {
    const length = b.readUInt32BE(at), type = b.toString("latin1", at + 4, at + 8), data = b.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") width = data.readUInt32BE(0);
    if (type === "IDAT") idat.push(data);
    at += 12 + length;
  }
  const rows = inflateSync(Buffer.concat(idat)), stride = 1 + width * 4;
  const pixel = (y, x) => { const at = y * stride + 1 + x * 4; return rows[at + 3] ? [rows[at], rows[at + 1], rows[at + 2]] : null; };
  return Array.from({ length: rows.length / stride }, (_, y) => Array.from({ length: width }, (_, x) => pixel(y, x)));
}

const PALETTE = ["#f2c14e", "#f78154", "#4d9de0", "#3bb273", "#e15554", "#b07bd8", "#4ecdc4", "#ff9f1c", "#9bc53d", "#e2b6cf"];
function body(session, artifact, title) {
  const f = session.frame(artifact.id, 0.25), n = f.owners.length, stride = f.points.length / n;
  const xs = Array.from({ length: n }, (_, i) => f.points[i * stride]), ys = Array.from({ length: n }, (_, i) => f.points[i * stride + 1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(600 / (x1 - x0), 440 / (y1 - y0)), sx = (x) => (20 + (x - x0) * scale).toFixed(1), sy = (y) => (60 + (y1 - y) * scale).toFixed(1);
  const dots = f.nodeIds.map(() => []), counts = f.nodeIds.map(() => 0);
  for (let i = 0; i < n; i++) { dots[f.owners[i]].push(`M${sx(xs[i])} ${sy(ys[i])}h0`); counts[f.owners[i]]++; }
  const color = (i) => PALETTE[i % PALETTE.length];
  const legend = f.nodeIds.map((id, i) => `<text x="${660 + 230 * Math.floor(i / 24)}" y="${70 + 18 * (i % 24)}" fill="${color(i)}">■ ${id} (${f.nodeRoles[i]}, ${counts[i]})</text>`);
  const ridges = f.ridges.map((r) => `<polyline points="${r.line.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}" fill="none" stroke="#f0f1eb" stroke-opacity="0.8" stroke-width="1.2"/>`);
  const width = 680 + 230 * Math.ceil(f.nodeIds.length / 24);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="540" viewBox="0 0 ${width} 540" font-family="monospace" font-size="12">`
    + `<rect width="100%" height="100%" fill="#0b1020"/><text x="20" y="30" fill="#f0f1eb" font-size="15">${title}</text><text x="20" y="48" fill="#8a93a8">${artifact.id}</text>`
    + dots.map((d, i) => `<path d="${d.join("")}" stroke="${color(i)}" stroke-opacity="0.45" stroke-width="2.2" stroke-linecap="round"/>`).join("")
    + ridges.join("") + legend.join("") + "</svg>";
  return { svg, counts: f.nodeIds.map((id, i) => `${id} ${counts[i]}`).join(", "), points: n, shape: f.points };
}

const dir = mkdtempSync(join(tmpdir(), "quineling-lesson-")), session = new Session();
console.log("Quinelings lesson: one small CNC quote program, from a thought to a program that can copy itself.\n");

const v150 = session.compile(quote(150));
console.log("1. A thought becomes a program");
console.log("   thought: price = max(minutes × rate, floor), with floor = 150 PLN");
console.log("   inputs: minutes [min], rate [PLN*min^-1]; constant: floor [PLN]");
console.log("   steps: machining = minutes × rate; price = max(machining, floor)");
console.log(`   compile gives the program ${short(v150.id)}: ${v150.source.length} bytes of source. Its name is "ql_" + the SHA-256 of that source.\n`);

console.log("2. The compiler checks units and limits before anything runs");
console.log(`   machining = minutes + rate (min + PLN*min^-1): ${refusal(() => session.compile(quote(150, "add")))}`);
console.log(`   run with minutes = -5 (the minimum is 0): ${refusal(() => session.run({ artifactId: v150.id, requestId: "negative", inputs: { minutes: -5, rate: 4.5 } }))}\n`);

const run1 = session.run({ artifactId: v150.id, requestId: "quote-42", inputs: { minutes: 42, rate: 4.5 } });
const run2 = session.run({ artifactId: v150.id, requestId: "quote-10", inputs: { minutes: 10, rate: 4.5 } });
console.log("3. A run: the same program, other inputs");
console.log(`   42 min: ${chain(run1)} PLN`);
console.log(`   10 min: ${chain(run2)} PLN (the floor applies)`);
console.log(`   the source stays the same: ${yes(run1.result.sourceHash === v150.id && run2.result.sourceHash === v150.id)}; the input hashes differ: ${yes(run1.result.inputHash !== run2.result.inputHash)}\n`);

const verified = session.verify(v150.id);
console.log("4. Quine: the program writes out its own source");
console.log(`   verify (no inputs, no run): the program emits ${verified.source.length} bytes, identical to its source: ${yes(verified.source === v150.source)}`);
console.log(`   each run also emits the same source: ${yes(run1.result.emitted[0] === v150.source && run2.result.emitted[0] === v150.source)}\n`);

const genome = sourceOnly.encode(v150.source), genomeFile = join(dir, "genome-150.png");
writeFileSync(genomeFile, png(genome.colors.pixels));
const fromPicture = new Session().recover({ colors: { format: genome.colors.format, pixels: pixelsOf(genomeFile) } });
const fromSound = new Session().recover({ harmonics: genome.harmonics });
console.log("5. Genome: the complete source in another form");
console.log(`   colors: ${genome.colors.pixels.length} × ${genome.colors.pixels[0].length} pixels, saved as genome-150.png`);
console.log(`   harmonics: ${genome.harmonics.bands.length} bands of ${genome.harmonics.bands[0].length} values (the same data as sound waves)`);
console.log(`   a new, empty session reads genome-150.png and rebuilds ${short(fromPicture.id)}, the same name: ${yes(fromPicture.id === v150.id)}`);
const rebuilt = new Session(), rebuiltArtifact = rebuilt.recover({ source: fromPicture.source });
console.log(`   from the harmonics, the same name: ${yes(fromSound.id === v150.id)}`);
console.log(`   the program rebuilt from the picture runs: ${chain(rebuilt.run({ artifactId: rebuiltArtifact.id, requestId: "from-picture", inputs: { minutes: 42, rate: 4.5 } }))} PLN\n`);

const b150 = body(session, v150, "Quote with a floor, floor = 150 PLN");
writeFileSync(join(dir, "body-150.svg"), b150.svg);
console.log("6. Body: a picture of the program");
console.log(`   ${b150.points} points; each point belongs to one node: ${b150.counts}`);
console.log("   saved as body-150.svg. To draw the body does not run the program.\n");

const copy = session.reproduce({ artifactId: v150.id, recordId: run1.id, requestId: "quote-42-copy" });
console.log("7. Reproduce: a fresh copy of run 1");
console.log(`   ${chain(copy)} PLN; its parent is run 1: ${yes(copy.parentRecordId === run1.id)}; same source: ${yes(copy.result.emitted[0] === v150.source)}\n`);

const v200 = session.compile(quote(200)), b200 = body(session, v200, "Quote with a floor, floor = 200 PLN");
writeFileSync(join(dir, "body-200.svg"), b200.svg);
const run3 = session.run({ artifactId: v200.id, requestId: "quote-10-v200", inputs: { minutes: 10, rate: 4.5 } });
console.log("8. A change makes a new program");
console.log(`   floor 150 → 200 gives the new name ${short(v200.id)} (a new version); saved as body-200.svg`);
console.log(`   the body has the same shape as body-150.svg: ${yes(b200.shape.every((v, i) => v === b150.shape[i]))}. The shape comes from the steps and their links, not from the constants; only the name tells the two programs apart.`);
console.log(`   10 min: ${chain(run3)} PLN; the old program ${short(v150.id)} still exists and still gives 150 PLN: ${yes(session.run({ artifactId: v150.id, requestId: "quote-10-again", inputs: { minutes: 10, rate: 4.5 } }).result.occurrences[0].outputs[0] === 150)}\n`);

const policy = session.compile(JSON.parse(readFileSync(new URL("./policy.json", import.meta.url), "utf8")));
const bPolicy = body(session, policy, "CAD machining quote policy v1 (policy.json)");
writeFileSync(join(dir, "body-policy.svg"), bPolicy.svg);
console.log("9. A larger program has a larger body");
console.log(`   policy.json: ${policy.order.length} nodes, ${policy.source.length} bytes, ${short(policy.id)}; saved as body-policy.svg\n`);

console.log("Why ai-audit uses this");
console.log("   - An LLM can propose numbers or a whole program. The compiler refuses wrong units and unknown operations (step 2).");
console.log("   - The program is one text with a fixed name. Anyone can rebuild it from the text or the genome and get the same name (steps 4, 5).");
console.log("   - `ai-audit decide` does steps 1 to 3 and writes the source and the inputs to the log; `ai-audit replay` rebuilds and runs it again, months later.");
console.log("   - All actions are simulated. A Quineling calculates and proposes; it does no real work in the world.");
console.log(`\nfiles: ${dir} (genome-150.png, body-150.svg, body-200.svg, body-policy.svg)`);
