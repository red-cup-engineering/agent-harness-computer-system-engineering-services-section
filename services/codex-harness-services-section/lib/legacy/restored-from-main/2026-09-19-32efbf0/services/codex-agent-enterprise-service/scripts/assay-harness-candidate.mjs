#!/usr/bin/env node
// One fresh-process assay of this enterprise's own candidate bundle: it
// content-addresses every source and test file this package holds together
// with the machine's agent records that parameterize them, runs this package's
// own test suite in a separate process, and emits one receipt binding the exact
// candidate digest to the observed outcome. The candidate set is discovered,
// never hand-listed, so a file added or removed cannot silently leave the
// bundle; the machine's own records come from its configuration record.
import { readFileBytes } from "@red-cup-engineering/file-services/read-file";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { walkPosixPaths } from "@red-cup-engineering/path-walking-service";

import { adoptConfigurationArgument, codexEnterpriseConfiguration } from "../src/configuration.mjs";

const argv = adoptConfigurationArgument(process.argv.slice(2));
const { ACTOR, appendObservation, identity } = await import("../src/enterprise.mjs");
const { OBJECT_KIND_NAMESPACE, semanticByteIdentity } = await import("../src/semiotic-circuit.mjs");

const configuration = codexEnterpriseConfiguration();
const ROOT = resolveFilepath([import.meta.dirname, ".."]);

async function filesBelow(root, includeFile) {
  const walk = await walkPosixPaths({ root, excludes: ["fixtures", "node_modules"], includeFile });
  return walk.files.filter(({ kind }) => kind === "file").map(({ path, absolutePath }) => ({ path, absolute: absolutePath }));
}

const packageFiles = [
  ...(await filesBelow(resolveFilepath([ROOT, "src"]), (file) => file.name.endsWith(".mjs"))).map(({ path, absolute }) => ({ path: `src/${path}`, absolute })),
  ...(await filesBelow(resolveFilepath([ROOT, "scripts"]), (file) => file.name.endsWith(".mjs"))).map(({ path, absolute }) => ({ path: `scripts/${path}`, absolute })),
  ...(await filesBelow(resolveFilepath([ROOT, "test"]), (file) => file.name.endsWith(".test.mjs"))).map(({ path, absolute }) => ({ path: `test/${path}`, absolute })),
].sort((left, right) => left.path.localeCompare(right.path));
const recordFiles = (await Promise.all(["harness", "actuators", "office"].map(async (directory) => {
  const root = resolveFilepath([configuration.agentsRoot, directory]);
  const files = await filesBelow(root, (file) => file.name.endsWith(".json"));
  return files.map(({ path, absolute }) => ({ path: `${directory}/${path}`, absolute }));
}))).flat();

const TEST_FILES = packageFiles.filter(({ path }) => path.startsWith("test/")).map(({ path }) => path);
function digest(bytes) { return semanticByteIdentity(bytes, `${OBJECT_KIND_NAMESPACE}.harness-candidate-file`).id; }
const startedAt = new Date().toISOString();
const processDigest = identity({ type: "FreshHarnessAssayProcess", pid: process.pid, startedAt });
const candidateFiles = await Promise.all([...packageFiles, ...recordFiles].map(async ({ path, absolute }) => ({ path, digest: digest(await readFileBytes(absolute)) })));
const candidateDigest = identity({ type: "CodexHarnessCandidateBundle", version: 1, files: candidateFiles });
const command = `${process.execPath} --test ${TEST_FILES.join(" ")}`;
const receipt0 = executeJavascriptNodeCommand({
  type: "JavascriptNodeCommandExecutionRequest",
  version: 1,
  command: process.execPath,
  arguments: ["--test", ...TEST_FILES],
  directory: ROOT,
  environment: null,
  input: null,
});
const run = receipt0.result;
const transcript = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
const redWitnessObserved = /same-process, wrong-digest, pre-materialization/u.test(transcript)
  && /missing, byte-mismatched, and path-escaping authority/u.test(transcript);
const outcome = run.status === 0 && redWitnessObserved ? "passed" : "failed";
const completedAt = new Date().toISOString();
const body = {
  type: "FreshHarnessCandidateAssayReceipt", version: 1,
  provider: `${ACTOR}-harness-observation`,
  candidateDigest, candidateFiles, processDigest, authorExcludedFromCandidateProcess: true,
  command, startedAt, completedAt, outcome,
  artifacts: TEST_FILES.map((path) => ({ path, digest: candidateFiles.find((entry) => entry.path === path).digest })),
  oracleReview: { accepted: outcome === "passed", basis: "real-MCP-and-refusal-observations" },
  redWitness: { passed: false, observed: redWitnessObserved, basis: "same-process/wrong-digest assurance and missing/byte-mismatched/path-escaping Execute controls were refused" },
  customerOutcome: null,
};
const receipt = Object.freeze({ id: identity(body), ...body });
if (argv.includes("--record")) appendObservation({ type: "HarnessCandidateAssayObserved", actor: ACTOR, receipt: receipt.id, candidateDigest, processDigest, outcome, observedAt: completedAt });
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (outcome !== "passed") process.exitCode = 1;
