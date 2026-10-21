import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { mockUpstream, startProxy } from "./helpers.js";
import { sha256 } from "../src/audit.js";

const secret = "S".repeat(40), credentials = JSON.stringify({ aws_secret_access_key: secret, private_key: "synthetic-private-key" });
const up = await mockUpstream();
const proxies: Awaited<ReturnType<typeof startProxy>>[] = [];
after(() => { up.close(); proxies.forEach((p) => p.close()); });
const call = (url: string, path: string, body: unknown, key?: string) => fetch(url + path, { method: "POST",
  headers: { "content-type": "application/json", ...(key && { authorization: `Bearer ${key}` }) }, body: JSON.stringify(body) });

for (const [path, body] of [
  ["/v1/chat/completions", { model: "mock-1", messages: [{ role: "tool", tool_call_id: "call_1", content: credentials }] }],
  ["/v1/responses", { model: "mock-1", input: [{ type: "function_call_output", call_id: "call_1", output: credentials }] }],
  ["/v1/messages", { model: "claude-mock", max_tokens: 3, messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: credentials }] }] }],
] as const) test(`contextual credentials respect all enforcement modes on ${path}`, async () => {
  for (const mode of ["redact", "no-go", "advisory"] as const) {
    const p = await startProxy(up.url, mode); proxies.push(p);
    const before = up.seen.length;
    const response = await call(p.url, path, body); await response.text();
    if (mode === "no-go") { assert.equal(response.status, 409); assert.equal(up.seen.length, before); }
    else {
      assert.equal(response.status, 200);
      const forwarded = up.seen.at(-1)!.body.toString();
      if (mode === "redact") { assert.ok(!forwarded.includes(secret)); assert.ok(!forwarded.includes("synthetic-private-key")); }
      else assert.equal(forwarded, JSON.stringify(body));
    }
    const log = readFileSync(p.log.path, "utf8");
    assert.ok(!log.includes(secret) && !log.includes("synthetic-private-key"));
    assert.ok(p.log.verifyChain().ok);
  }
});

test("sensitive property names are blocked without leaking through audit finding paths", async () => {
  const p = await startProxy(up.url, "redact"); proxies.push(p);
  const key = "ghp_" + "A".repeat(36), before = up.seen.length;
  const response = await call(p.url, "/v1/chat/completions", { model: "mock-1", extra: { [key]: { aws_secret_access_key: secret } } });
  assert.equal(response.status, 409); assert.equal(up.seen.length, before);
  assert.ok(!(await response.text()).includes(key));
  assert.ok(!readFileSync(p.log.path, "utf8").includes(key));
});

test("opt-in response logging uses contextual redaction while the client receives original output", async () => {
  const source = http.createServer((_req, res) => res.end(JSON.stringify({ model: "mock-1", choices: [{ message: {
    content: credentials, tool_calls: [{ function: { name: "use_credential", arguments: JSON.stringify({ db_password: "synthetic-database-password" }) } }],
  }, finish_reason: "stop" }] })));
  await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
  try {
    const p = await startProxy(`http://127.0.0.1:${(source.address() as AddressInfo).port}`, "redact", {
      keys: [{ name: "synthetic-agent", sha256: sha256("synthetic-client-key"), logContent: true }],
    }); proxies.push(p);
    const response = await call(p.url, "/v1/chat/completions", { model: "mock-1", messages: [] }, "synthetic-client-key");
    assert.equal((await response.json()).choices[0].message.content, credentials);
    const record = p.log.read().at(-1)!;
    assert.equal(JSON.parse(record.output as string).private_key, "[REDACTED:private-key]");
    assert.equal(JSON.parse((record.toolCalls as any[])[0].args).db_password, "[REDACTED:database-password]");
    const logged = readFileSync(p.log.path, "utf8");
    for (const value of [secret, "synthetic-private-key", "synthetic-database-password"]) assert.ok(!logged.includes(value));
  } finally { source.close(); }
});
