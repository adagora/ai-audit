import { readFileSync } from "node:fs";
import { policyRuntime } from "../../../dist/src/policyAdapter.js";

const source = readFileSync(process.argv[2], "utf8");
const inputs = JSON.parse(readFileSync(process.argv[3], "utf8"));
const { Session } = await policyRuntime({ source });
const session = new Session();
const artifact = session.recover({ source });
const run = session.run({ artifactId: artifact.id, requestId: "fresh", inputs });
const outputs = run.result.outputs;
process.stdout.write(JSON.stringify({ source: artifact.id, output: outputs }) + "\n");
