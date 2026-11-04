import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [run, model] = process.argv.slice(2);
mkdirSync(run, { recursive: true });
const key = `aia-${randomBytes(18).toString("base64url")}`;
writeFileSync(join(run, "client.key"), key, { mode: 0o600 });
const gateway = {
  keys: [{ name: "narzedziownia", sha256: createHash("sha256").update(key).digest("hex"), useCases: ["wycena"] }],
  useCases: { wycena: { tier: "assist", models: [model] } },
};
writeFileSync(join(run, "gateway.json"), JSON.stringify(gateway, null, 2));
console.log(`run folder ${run}, client key written, model ${model}`);
