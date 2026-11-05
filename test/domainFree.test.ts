import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const domainTerm = /citywheels|booking|refund|voucher|deposit/i;

function filesWithDomainTerms(directory: string): string[] {
  return readdirSync(join(repository, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|mjs|sh)$/.test(entry.name) && !entry.name.includes(".test."))
    .map((entry) => join(directory, entry.name))
    .filter((path) => domainTerm.test(readFileSync(join(repository, path), "utf8")));
}

test("the proxy sources and shared scripts hold no help-desk domain terms", () => {
  assert.deepEqual(filesWithDomainTerms("src"), []);
  assert.deepEqual(filesWithDomainTerms("scripts"), []);
});
