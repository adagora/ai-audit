import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect, redactText, scanText } from "../src/scan.js";
import { sha256 } from "../src/audit.js";

const secret = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/+=A";
const session = "FAKEsessionTokenForTesting".repeat(4) + "==";
const pem = `-----BEGIN PRIVATE KEY-----\n${"A".repeat(96)}\n-----END PRIVATE KEY-----\n`;

for (const [text, rule, sensitive] of [
  [`AWS_SECRET_ACCESS_KEY=${secret}`, "aws-secret-access-key", secret],
  [`aws.secretAccessKey = '${secret}'`, "aws-secret-access-key", secret],
  [`{"SecretAccessKey":"${secret}"}`, "aws-secret-access-key", secret],
  [`aws_session_token=${session}`, "aws-session-token", session],
  ["PGPASSWORD=support-test-password", "database-password", "support-test-password"],
  ["MYSQL_PWD='synthetic-database-secret'", "database-password", "synthetic-database-secret"],
  ['PGPASSWORD="fake password with spaces"', "database-password", "fake password with spaces"],
  ["MYSQL_PWD='fake password with \"quotes\"'", "database-password", 'fake password with "quotes"'],
  ["client_secret=syntheticOAuthClientSecret", "credential-client-secret", "syntheticOAuthClientSecret"],
  ["refresh_token=syntheticOAuthRefreshToken", "credential-refresh-token", "syntheticOAuthRefreshToken"],
  [pem, "private-key", "A".repeat(96)],
] as const) test(`credential text: ${rule} (${text.split(/[=:]/)[0]})`, () => {
  const spans = scanText(text);
  assert.ok(spans.some((s) => s.rule === rule));
  const redacted = redactText(text, spans);
  assert.ok(!redacted.includes(sensitive));
  assert.equal(scanText(redacted).length, 0);
});

for (const scheme of ["postgres", "postgresql", "mysql", "mariadb", "mongodb", "mongodb+srv", "redis", "rediss", "mssql", "sqlserver", "cockroachdb"])
  test(`database URI: ${scheme} credentials disappear completely`, () => {
    const uri = `${scheme}://operator:p%40ss%2Ffake%3Aword@db.example.invalid:5432/app?ssl=true`;
    assert.equal(redactText(`connect ${uri}`, scanText(`connect ${uri}`)), "connect [REDACTED:database-credentials]");
    assert.equal(scanText(`${scheme}://db.example.invalid:5432/app`).length, 0);
  });

test("database query passwords, including percent-encoded parameter names, are redacted", () => {
  for (const parameter of ["password", "Password", "%70assword", "passwd", "pwd"]) {
    const uri = `postgresql://db.example.invalid/app?sslmode=require&${parameter}=fake%40password`;
    assert.equal(redactText(uri, scanText(uri)), "[REDACTED:database-credentials]");
  }
  assert.deepEqual(scanText("postgresql://db.example.invalid/app?sslmode=require&password="), []);
  assert.deepEqual(scanText("postgresql://" + ":".repeat(50_000)), []);
});

test("structured credential files: AWS fields, GCP service accounts and OAuth nested JSON", () => {
  const input = { credentials: { SecretAccessKey: secret, SessionToken: session },
    serviceAccount: { type: "service_account", project_id: "fake-project", private_key_id: "fake-key-id", private_key: pem },
    tool: JSON.stringify({ args: JSON.stringify({ client_secret: "fake-client-secret", refresh_token: "fake-refresh-token" }) }) };
  const result = inspect(input);
  const text = JSON.stringify(result.value);
  for (const value of [secret, session, "A".repeat(96), "fake-client-secret", "fake-refresh-token"]) assert.ok(!text.includes(value));
  assert.equal((result.value as any).serviceAccount.private_key_id, "fake-key-id");
  assert.equal((result.value as any).serviceAccount.project_id, "fake-project");
  assert.equal(inspect(result.value).findings.length, 0);
  assert.ok(!JSON.stringify(result.findings).includes(secret));
});

test("allowlists exempt exact secrets in fields and wrapped JWTs, never neighbours", () => {
  const carnet = new Set([sha256(secret)]);
  assert.equal(inspect({ aws_secret_access_key: secret }, carnet).findings.length, 0);
  assert.equal(scanText(`AWS_SECRET_ACCESS_KEY=${secret}`, carnet).length, 0);
  assert.equal(inspect({ aws_secret_access_key: secret + "x" }, carnet).findings.length, 1);
  const jwt = `eyJ${"A".repeat(25)}.eyJ${"B".repeat(25)}.${"C".repeat(32)}`;
  const wrapped = jwt.slice(0, 38) + "\n  " + jwt.slice(38);
  assert.equal(scanText(wrapped, new Set([sha256(jwt)])).length, 0);
});

test("ordinary source and docs are not classified as contextual credentials", () => {
  for (const value of [secret, "AWS_SECRET_ACCESS_KEY", "aws_secret_access_key = process.env.AWS_SECRET_ACCESS_KEY;",
    "a hash " + "a".repeat(40), "postgresql://db.example.invalid/app", "private_key_id=example", "password policy: 12 characters"])
    assert.deepEqual(scanText(value), [], value);
  const raw = ' { "note": "ordinary JSON", "count": 2 } ';
  assert.equal(inspect(raw).value, raw);
});

test("attachments remain opaque, while metadata and adjacent text are scanned", () => {
  const payload = `data:image/png;base64,${secret}`;
  const input = { image_url: payload, source: { type: "base64", media_type: "application/pdf", data: secret },
    note: `AWS_SECRET_ACCESS_KEY=${secret}` };
  const result = inspect(input).value as any;
  assert.equal(result.image_url, payload); assert.equal(result.source.data, secret);
  assert.ok(!result.note.includes(secret));
});

test("secret property names never leak through finding paths, even for nested findings", () => {
  const key = "ghp_" + "A".repeat(36);
  const result = inspect({ [key]: { aws_secret_access_key: secret } });
  assert.ok(result.findings.some((f) => f.inKey));
  assert.ok(!JSON.stringify(result.findings).includes(key));
});

test("special JSON keys survive traversal; nested duplicate keys cannot be rewritten", () => {
  const result = inspect(JSON.parse('{"__proto__":{"client_secret":"fake-client-secret"},"constructor":3}'));
  assert.equal(Object.hasOwn(result.value as object, "__proto__"), true);
  assert.equal(JSON.parse(JSON.stringify(result.value)).__proto__.client_secret, "[REDACTED:credential-client-secret]");
  const ambiguous = inspect('{"x":1,"x":{"client_secret":"fake-client-secret"}}');
  assert.ok(ambiguous.findings.some((f) => f.unredactable));
});

test("a contextual credential split across text parts is fully removed", () => {
  const input = [{ type: "text", text: "AWS_SECRET_ACCESS_KEY=" + secret.slice(0, 17) }, { type: "text", text: secret.slice(17) }];
  const result = inspect(input);
  assert.ok(!JSON.stringify(result.value).includes(secret));
  assert.deepEqual((result.value as any[]).map((v) => v.text), ["AWS_SECRET_ACCESS_KEY=[REDACTED:aws-secret-access-key]", ""]);
});

test("a decimal fraction is not a phone number; international numbers still are", () => {
  for (const text of ["0.0012444963678717614", '{"bend":[-0.18,0.0012444963678717614]}', "ratio 1.00485551234567"]) assert.deepEqual(scanText(text), [], text);
  for (const text of ["tel +48 601 234 567", "call 0048 601 234 567", "0048601234567"]) assert.deepEqual(scanText(text).map((s) => s.rule), ["pii-phone"], text);
});
