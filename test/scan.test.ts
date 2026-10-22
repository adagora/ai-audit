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

test("leaks found by the laws stay fixed: key endings, PGPASSWORD before a quote, split key and value", () => {
  const key = "sk-ant-api03-" + "aB9".repeat(31) + "AA", value = "XfMCHGFnlyVQLNo2";
  for (const text of [`Use my key ${key}.`, `(${key}), see`, "run: docker run -e 'PGPASSWORD=s3cretPassw0rd' postgres", `cfg = "PROD_DB_PASSWORD=s3cretPassw0rd"`])
    assert.ok(!redactText(text, scanText(text)).includes(text.includes(key) ? key : "s3cretPassw0rd"), text);
  const parts = inspect([{ type: "text", text: "config: client_secret" }, { type: "text", text: `=${value} done` }]);
  assert.ok(!JSON.stringify(parts.value).includes(value));
  assert.deepEqual(parts.findings, [{ rule: "credential-client-secret", path: "$[0..1]" }]);
  const masked = inspect(["DB_", "PASSWORD=CK02m6zqnLyD9C;root:hW887PEbGT3HZw@tcp(db.example.invalid:4000) x"]).value;
  assert.deepEqual(masked, ["DB_", "PASSWORD=[REDACTED:database-password];[REDACTED:database-credentials] x"]);
  assert.deepEqual(inspect(masked).findings, []);
});

test("clean JSON inside a string is not rewritten; numbers outside its strings are still scanned", () => {
  for (const raw of ['{"cmd":"export PGPASSWORD=","x":"y"}', '{"note":"set db_password:","next":"value"}']) assert.deepEqual(inspect(raw), { value: raw, findings: [] }, raw);
  assert.deepEqual(inspect('{"pesel": 44051401359}'), { value: '{"pesel": [REDACTED:pii-pesel]}', findings: [{ rule: "pii-pesel", path: "$" }] });
});

test("an IBAN is found before a currency, BIC or year, and two adjacent IBANs are both found", () => {
  const iban = "PL61 1090 1014 0000 0712 1981 2874";
  for (const text of [`konto ${iban} PLN`, `konto ${iban} BIC WBKPPLPP`, `IBAN: ${iban.replace(/ /g, "")} EUR`, `${iban} 2026`])
    assert.ok(scanText(text).some((s) => s.rule === "pii-iban" && s.value.startsWith(iban.slice(0, 4)) && s.value.replace(/ /g, "").includes(iban.replace(/ /g, ""))), text);
  const pair = "PL34376072511540854462682912 PL72 9100 7388 8561 9351 6865 5169 BIC WBKPPLPP";
  assert.deepEqual(scanText(pair).map((s) => s.value), ["PL34376072511540854462682912", "PL72 9100 7388 8561 9351 6865 5169"]);
  assert.deepEqual(scanText("kod AB12 CDEF GHIJ KLMN"), []);
});

test("credentials without a shape are found by their name (ADR 0028)", () => {
  for (const [text, value] of [["TIDB_CLOUD_PRIVATE_KEY=a9F3kLm2Qx7Rt4Vw", "a9F3kLm2Qx7Rt4Vw"], ["X-Api-Key: 7f3c9a1e5b2d", "7f3c9a1e5b2d"],
    ["UPDATE users SET password = 'Tr0ub4dor' WHERE id = 7;", "Tr0ub4dor"], ["const webhookSecret = \"whsec-fake-value\";", "whsec-fake-value"]] as const) {
    assert.ok(scanText(text).some((s) => s.rule === "named-credential"), text);
    assert.ok(!redactText(text, scanText(text)).includes(value), text);
  }
  const state = inspect({ resources: [{ instances: [{ attributes: { username: "admin", password: "SuperSecretPassword" } }] }], server: { salt_secret: "fake-salt-value" } });
  assert.deepEqual(state.findings.map((f) => f.path), ["$.resources[0].instances[0].attributes.password", "$.server.salt_secret"]);
});

test("names alone do not flag code, types, references, labels or pagination tokens (ADR 0028)", () => {
  for (const text of ["cachedToken: CachedToken", "apiKey: undefined,", "this.authToken = authToken;", "token: string):", "const apiKey = process.env.OPENAI_API_KEY;",
    "secret = getSecret(name)", 'confirmPassword: "Confirm password"', "max_tokens: 4096", "export NPM_TOKEN=$NPM_TOKEN", "GRAFANA_ADMIN_PASSWORD=change-me",
    'apiKey: "${OPENAI_API_KEY_2}"', "token = getToken(42)", "API_TOKEN=<TOKEN_FROM_VAULT_1>"])
    assert.deepEqual(scanText(text), [], text);
  assert.deepEqual(inspect({ nextPageToken: "CgAQ1A2B3C", page_token: "abc123def", password: "short", tokens: "123456789", db_secret: "{{vault_secret_1}}" }).findings, []);
});

test("a decimal fraction is not a phone number; international numbers still are", () => {
  for (const text of ["0.0012444963678717614", '{"bend":[-0.18,0.0012444963678717614]}', "ratio 1.00485551234567"]) assert.deepEqual(scanText(text), [], text);
  for (const text of ["tel +48 601 234 567", "call 0048 601 234 567", "0048601234567"]) assert.deepEqual(scanText(text).map((s) => s.rule), ["pii-phone"], text);
});
