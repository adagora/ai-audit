import { readFileSync } from "node:fs";
import { Session } from "@quinelings/agent-sdk/v1";

const source = readFileSync(process.argv[2], "utf8");
const inputs = JSON.parse(readFileSync(process.argv[3], "utf8"));
const session = new Session();
const artifact = session.recover({ source });
const run = session.run({ artifactId: artifact.id, requestId: "fresh", inputs });
const outputs = run.result.occurrences[0].outputs;
process.stdout.write(JSON.stringify({ source: artifact.id, output: outputs }) + "\n");
