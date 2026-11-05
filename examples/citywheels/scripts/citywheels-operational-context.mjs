import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evidenceDigest } from "../../../dist/src/qualification.js";

export function applyOperationalContext(data, input) {
  const path = process.env.CITYWHEELS_BOOKING_CONTEXT;
  if (!path) return null;
  if (input.bookingPatch || input.policyPatch) throw new Error("Operational snapshots do not accept fixture overrides");
  const context = JSON.parse(readFileSync(path, "utf8"));
  const { digest, ...payload } = context;
  if (evidenceDigest(payload) !== digest || context.source !== "synthetic-citywheels-backend" || !context.booking || input.now !== context.businessAt) throw new Error("Invalid operational snapshot");
  writeFileSync(join(data, "bookings.json"), JSON.stringify([context.booking]), { mode: 0o600 });
  return context;
}

export function applyFixturePolicy(data, input) {
  const patch = input.policyPatch;
  if (patch !== undefined) {
    if (process.env.CITYWHEELS_BOOKING_CONTEXT || !patch || Object.keys(patch).sort().join() !== "file,text" || !["cancellations.md", "faq.md", "prices.md"].includes(patch.file)
      || typeof patch.text !== "string" || !patch.text.trim() || Buffer.byteLength(patch.text) > 64000) throw new Error("Invalid isolated policy fixture override");
    writeFileSync(join(data, "policies", patch.file), patch.text, { mode: 0o600 });
  }
  const digest = createHash("sha256");
  for (const name of readdirSync(join(data, "policies")).sort()) digest.update(`policies/${name}`).update("\0").update(readFileSync(join(data, "policies", name)));
  return digest.digest("hex");
}
