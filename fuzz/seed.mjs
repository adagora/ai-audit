import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
const AWS = "AKIA" + "IOSFODNN7EXAMPLQ", JWT = "eyJhbGciOiJIUzI1NiJ9x.eyJzdWIiOiIxMjM0NTY3ODkw.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV";
const sse = (evs) => evs.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const seeds = {
  scan: [`mail jan.kowalski@firma.pl, tel +48 601 234 567`, `aws ${AWS} pesel 44051401359`, `password: hunter2hunter2`, `postgres://u:p4ss@db.local/x`, `u:secret@tcp(127.0.0.1:3306)/db`,
    `token ${JWT}`, `${JWT.slice(0, 30)}\n  ${JWT.slice(30)}`, `client_secret = 'Q~abcdefghijklmnopqrstuvwxyz0123456789'`, `-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----`, `PL61109010140000071219812874`],
  pump: [["", "a", " @"], ["", "%", " @"], ["", "ey", "\n12345678"], ["", "ye", "\n"], ["", "a.", "\n"], ["", "-a", "\n"], ["", "7:", "@tcp("], ["password", "1", ""], ["", "a:", "@tcp("], ["x", "1a.", "_secret = 'x'"], ["", "12345678901,", ""], ["", "mysql://a,", ""], ["", "PL61109010140000071219812875,", ""], ["", "a@b.pl ", ""], ["mysql://h#?", "&/", ""]].map((p) => p.join("\u0000")),
  inspect: [{ messages: [{ role: "user", content: `key ${AWS}` }] },
    { messages: [{ role: "user", content: [{ type: "text", text: "AKIAIOSF" }, { type: "text", text: "ODNN7EXAMPLQ" }] }] },
    { messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: AWS } }] }] },
    { messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", data: AWS, note: `data:text/plain;base64,${AWS}` } }] }] },
    { messages: [{ role: "user", content: [{ type: "input_image", image_url: `data:image/png;base64,${AWS}` }] }] },
    { tools: [{ function: { arguments: JSON.stringify({ mail: "jan@firma.pl", pesel: 44051401359 }) } }] },
    { input: [{ type: "function_call_output", output: JSON.stringify({ password: "hunter2hunter2" }) }] },
    { password: "hunter2hunter2", [AWS]: 1 }].map((b) => JSON.stringify(b)),
  extract: [
    [0, JSON.stringify({ model: "m", choices: [{ message: { content: "hi", tool_calls: [{ index: 0, function: { name: "f", arguments: "{}" } }] }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } })],
    [4, sse([{ model: "m", choices: [{ delta: { content: "He", tool_calls: [{ index: 0, function: { name: "f", arguments: "{" } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "}" } }] }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 3 } }]) + "data: [DONE]\n\n"],
    [1, JSON.stringify({ model: "m", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "hi" }] }, { type: "function_call", name: "f", arguments: "{}" }], usage: { input_tokens: 4, output_tokens: 2 } })],
    [5, sse([{ type: "response.output_text.delta", delta: "Hello " }, { type: "response.completed", response: { model: "m", status: "completed", output: [], usage: { input_tokens: 4, output_tokens: 2 } } }])],
    [2, JSON.stringify({ model: "c", content: [{ type: "text", text: "hi" }, { type: "tool_use", name: "f", input: { q: 1 } }], stop_reason: "end_turn", usage: { input_tokens: 6, output_tokens: 2, cache_read_input_tokens: 4 } })],
    [6, `event: message_start\n` + sse([{ type: "message_start", message: { model: "c", usage: { input_tokens: 6 } } }, { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "f" } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }, { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "x" } }, { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }])],
  ].map(([b, s]) => Buffer.concat([Buffer.from([b]), Buffer.from(s)])),
  dupkeys: ['{"a":1,"b":{"a":2}}', '{"a":1,"\\u0061":2}', '[{"a":1},{"a":2}]', '{"a\\"":1,"a\\\\":2}', '{"\\/":1,"/":2}', '{ "x" : [ {"y":1 , "y" :2} ] }'],
  quinelings: [
    [0, { messages: [{ role: "assistant", tool_calls: [{ id: "c1", function: { name: "quineling_v1_run" } }] }, { role: "tool", tool_call_id: "c1", content: JSON.stringify({ result: { result: { format: "qdl-run", sourceHash: "LEAK", status: "LEAK" } } }) }] }],
    [2, { messages: [{ role: "assistant", content: [{ type: "tool_use", id: "u1", name: "mcp__quinelings__quineling_inspect" }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: [{ type: "text", text: JSON.stringify({ error: { code: "LEAK", path: "$.LEAK x" } }) }] }] }] }],
    [1, { input: [{ type: "function_call", call_id: "c1", name: "quineling_v1_offspring_admit" }, { type: "function_call_output", call_id: "c1", output: "MCP error -32602: LEAK" }] }],
    [0, { name: "quineling_v1_run", intent: { note: "LEAK" }, artifactId: "LEAK" }],
  ].map(([b, j]) => Buffer.concat([Buffer.from([b]), Buffer.from(JSON.stringify(j))])),
};
for (const [target, list] of Object.entries(seeds)) {
  mkdirSync(join(root, "seeds", target), { recursive: true }); mkdirSync(join(root, "corpus", target), { recursive: true }); mkdirSync(join(root, "artifacts", target), { recursive: true });
  list.forEach((s, i) => writeFileSync(join(root, "seeds", target, `seed${i}`), s));
}
const tokens = ["AKIA", AWS, "ey", "eyJ", "@", ".pl", "@tcp(", "@unix(", "password", "secret", "client_secret", "api_key", "token", "_password", "postgres://", "mysql://", "Bearer ", "sk-", "ghp_", "xoxb-", "Q~",
  "-----BEGIN", "PRIVATE KEY-----", "44051401359", "+48 ", "PL61", "[REDACTED:", "data:", ";base64,", "image/png", "text/plain", "application/pdf", '"type"', '"base64"', '"media_type"', '"data"', '"source"',
  '"text"', '"content"', '"messages"', '"input"', '"output"', '"role"', '"tool"', '"assistant"', '"tool_calls"', '"tool_call_id"', '"tool_use"', '"tool_result"', '"tool_use_id"', '"function_call"',
  '"function_call_output"', '"call_id"', '"arguments"', '"partial_json"', '"index"', '"__proto__"', '"constructor"', '"choices"', '"delta"', '"usage"', '"model"', "data: ", "event: ", "\n\n", "[DONE]",
  "quineling_v1_", "qdl-run", "qdl-program", '"format"', '"sourceHash"', '"status"', '"error"', '"code"', '"path"', '"result"', '"payload"', "ql_", "LEAK", "MCP error ", "\\u00", "\\\"", "\\\\", "\\/"];
const libfuzzerByte = (b) => (b === 0x5c ? "\\\\" : b === 0x22 ? '\\"' : b < 0x20 || b > 0x7e ? "\\x" + b.toString(16).padStart(2, "0") : String.fromCharCode(b));
writeFileSync(join(root, "dict.txt"), tokens.map((t) => `"${[...Buffer.from(t)].map(libfuzzerByte).join("")}"`).join("\n") + "\n");
