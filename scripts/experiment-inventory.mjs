import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function storage(directory) {
  let bytes = 0, files = 0, unreadable = false, symbolicLinks = 0;
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) { symbolicLinks++; continue; }
      if (stat.isDirectory()) {
        const child = storage(path);
        bytes += child.bytes; files += child.files; symbolicLinks += child.symbolicLinks; unreadable ||= child.unreadable;
      } else if (stat.isFile()) { bytes += stat.size; files++; }
    } catch { unreadable = true; }
  }
  return { bytes, files, unreadable, symbolicLinks };
}

export function experimentInventory(directory, activeRunId = null) {
  return readdirSync(directory).filter((id) => /^[0-9a-f-]{36}$/.test(id)).flatMap((id) => {
    const path = join(directory, id);
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return [];
    let manifest;
    try {
      const manifestPath = join(path, "manifest.json");
      if (!lstatSync(manifestPath).isFile() || lstatSync(manifestPath).isSymbolicLink()) throw new Error("manifest unavailable");
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.id !== id) throw new Error("manifest invalid");
    } catch { manifest = { id, status: "invalid", createdAt: stat.mtime.toISOString() }; }
    const lifecycle = manifest.status === "running" ? id === activeRunId ? "running" : "interrupted" : ["passed", "failed"].includes(manifest.status) && manifest.finishedAt ? "completed" : "partial";
    return [{ ...manifest, id, inventory: { ...storage(path), lifecycle, retentionOwner: "local workspace operator", sensitivity: manifest.provider === "fake" ? "synthetic; inspect retained inputs before sharing" : "potential customer content; restricted", retention: "Retained until operator deletion; review linked cases and qualifications before removal", completedEvidence: lifecycle === "completed" } }];
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
