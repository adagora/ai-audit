#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { accessSync, constants, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Word { text: string; box: [number, number, number, number] }
export interface Unit { where: string; text: string; words?: Word[]; png?: string; file?: string }
const TOOL_OUTPUT_LIMIT = 16 * 1024 * 1024;
let toolAddressSpace = 0;
const run = (cmd: string, args: string[], input?: Buffer) =>
  execFileSync("prlimit", [`--as=${toolAddressSpace}`, "--", cmd, ...args], { input, maxBuffer: TOOL_OUTPUT_LIMIT, env: { PATH: "/usr/bin:/bin", OMP_THREAD_LIMIT: "1", HOME: "/tmp" }, stdio: [input ? "pipe" : "ignore", "pipe", "ignore"] });
type Limits = { data: number; cpu: number; fsize: number; nofile: number };
const LIMIT_ROWS: [keyof Limits, string][] = [["data", "Max data size"], ["cpu", "Max cpu time"], ["fsize", "Max file size"], ["nofile", "Max open files"]];
function limitsApplied(expected: Limits | undefined): boolean {
  if (!expected) return false;
  const table = readFileSync("/proc/self/limits", "utf8").split("\n");
  return LIMIT_ROWS.every(([key, label]) => {
    const cells = table.find((l) => l.startsWith(label))?.slice(label.length).trim().split(/\s+/) ?? [];
    return Number(cells[0]) === expected[key] && Number(cells[1]) === expected[key];
  });
}
const PY_META = `import sys,json
from PIL import Image
im=Image.open(sys.argv[1]); im.load()
out=[str(v) for v in im.info.values() if isinstance(v,(str,bytes))]
ex=im.getexif()
out+=[v.decode('utf8','replace') if isinstance(v,bytes) else str(v) for v in ex.values()]
print(json.dumps({"format":im.format,"frames":getattr(im,"n_frames",1),"meta":out}))`;
const PY_BLACK = `import sys,json
from PIL import Image,ImageDraw
job=json.load(sys.stdin); pages=[]
for p in job["pages"]:
  im=Image.open(p["file"]).convert("RGB"); d=ImageDraw.Draw(im)
  for b in ([[0,0,im.width,im.height]] if p["all"] else p["boxes"]): d.rectangle([b[0]-2,b[1]-2,b[0]+b[2]+2,b[1]+b[3]+2],fill="black")
  pages.append(im)
pages[0].save(job["out"],format=job["format"],save_all=len(pages)>1,append_images=pages[1:])`;

function ocr(file: string): { text: string; words: Word[] } {
  const tsv = run("tesseract", [file, "stdout", "--psm", "11", "tsv"]).toString();
  const words: Word[] = [];
  for (const l of tsv.split("\n").slice(1)) {
    const c = l.split("\t"); if (c.length < 12 || !c[11].trim() || Number(c[10]) < 0) continue;
    words.push({ text: c[11], box: [+c[6], +c[7], +c[8], +c[9]] });
  }
  return { text: words.map((w) => w.text).join(" "), words };
}

function job(j: any): unknown {
  const dir = j.jobDir as string, f = join(dir, "in");
  if (j.op === "check") {
    const readable = (path: string) => { try { accessSync(path, constants.R_OK); return true; } catch { return false; } };
    const toolOutput = (bytes: number) => { try { return run("head", ["-c", String(bytes), "/dev/zero"]).length; } catch { return "output_limit"; } };
    return { env: Object.keys(process.env).sort(), readable: (j.paths ?? []).map(readable), workerLimits: readFileSync("/proc/self/limits", "utf8"),
      toolLimits: run("cat", ["/proc/self/limits"]).toString(), ...(j.toolOutputBytes !== undefined && { toolOutput: toolOutput(j.toolOutputBytes) }), ...(j.stdoutBytes && { filler: "x".repeat(j.stdoutBytes) }) };
  }
  if (j.op === "blackout") {
    const pages = j.pages.map((p: any, i: number) => ({ file: join(dir, `in-${i}`), boxes: p.boxes, all: p.all }));
    run("python3", ["-c", PY_BLACK], Buffer.from(JSON.stringify({ pages, out: join(dir, "out"), format: j.format })));
    return { file: "out" };
  }
  if (j.mime.startsWith("image/")) {
    const m = JSON.parse(run("python3", ["-c", PY_META, f]).toString());
    if (m.frames > 1) throw new Error("multi-frame");
    const o = ocr(f);
    return { units: [{ where: "ocr", text: o.text, words: o.words, file: "in" }, { where: "meta", text: m.meta.join("\n") }] };
  }
  if (j.mime === "application/pdf") {
    const info = run("pdfinfo", [f]).toString();
    if (/^Encrypted:\s+yes/m.test(info)) throw new Error("encrypted");
    const units: Unit[] = [{ where: "meta", text: info }];
    const pages = run("pdftotext", ["-q", f, "-"]).toString().split("\f"); pages.pop();
    pages.forEach((t, i) => units.push({ where: `page${i + 1}`, text: t }));
    if (j.raster) {
      run("pdftoppm", ["-r", "110", "-png", f, join(dir, "pg")]);
      readdirSync(dir).filter((x) => /^pg-\d+\.png$/.test(x)).sort().forEach((x, i) => {
        const o = ocr(join(dir, x)); units.push({ where: `page${i + 1}-ocr`, text: o.text, words: o.words, file: x });
      });
    }
    return { units };
  }
  throw new Error("unsupported");
}

let input = ""; process.stdin.on("data", (c) => (input += c)).on("end", () => {
  let parsed: any;
  try { parsed = JSON.parse(input); } catch { process.exit(1); }
  if (!limitsApplied(parsed.limits) || !(parsed.toolAddressSpace > 0)) process.exit(1);
  toolAddressSpace = parsed.toolAddressSpace;
  try { process.stdout.write(JSON.stringify({ ok: true, ...(job(parsed) as object) })); }
  catch { process.stdout.write(JSON.stringify({ ok: false })); }
});
