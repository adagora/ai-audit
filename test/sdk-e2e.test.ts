// Official clients -> proxy -> mock upstream. Fake keys only.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { mockUpstream, startProxy, AWS, PESEL } from "./helpers.js";

const up = await mockUpstream(), p = await startProxy(up.url, "redact");
after(() => { up.close(); p.close(); });
const oa = new OpenAI({ apiKey: "sk-fake-openai", baseURL: p.url + "/v1" });
const an = new Anthropic({ apiKey: "sk-ant-fake", baseURL: p.url });
const ask = `quote this part, key ${AWS}, PESEL ${PESEL}`;

test("openai SDK: chat json + stream, responses stream, models", async () => {
  const c = await oa.chat.completions.create({ model: "gpt-x", messages: [{ role: "user", content: ask }] });
  assert.equal(c.choices[0].message.content, "Hello world");
  let s = ""; for await (const ch of await oa.chat.completions.create({ model: "gpt-x", stream: true, messages: [{ role: "user", content: "hi" }] })) s += ch.choices[0]?.delta?.content ?? "";
  assert.equal(s, "Hello world, mail me at jan@firma.pl"); // client sees the real stream, unmodified
  let r = ""; for await (const e of await oa.responses.create({ model: "gpt-x", input: "hi", stream: true })) if (e.type === "response.output_text.delta") r += e.delta;
  assert.equal(r, "Hello world");
  assert.equal((await oa.models.list()).data[0].id, "mock-1");
});

test("anthropic SDK: messages json + stream, count_tokens", async () => {
  const m = await an.messages.create({ model: "claude-x", max_tokens: 10, messages: [{ role: "user", content: ask }] });
  assert.equal((m.content[0] as any).text, "Hello world");
  const st = an.messages.stream({ model: "claude-x", max_tokens: 10, messages: [{ role: "user", content: "hi" }] });
  assert.equal(await st.finalText(), "Hello world");
  assert.equal((await an.messages.countTokens({ model: "claude-x", messages: [{ role: "user", content: "hi" }] })).input_tokens, 7);
});

test("upstream never saw the secrets, log is clean and verifies", async () => {
  for (const s of up.seen) { const b = s.body.toString(); assert.ok(!b.includes(AWS) && !b.includes(PESEL)); }
  assert.equal(up.seen.find((s) => s.path.startsWith("/v1/messages") && !s.path.includes("count"))!.headers["x-api-key"], "sk-ant-fake");
  const txt = (await import("node:fs")).readFileSync(p.log.path, "utf8");
  assert.ok(!txt.includes("sk-fake-openai") && !txt.includes("sk-ant-fake") && !txt.includes(AWS));
  assert.deepEqual(p.log.verifyChain(), { ok: true });
  console.log("records:", p.log.read().map((r: any) => `${r.provider}${r.endpoint}${r.stream ? "(sse)" : ""}=${r.decision.action}`).join(" "));
});
