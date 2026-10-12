import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertHarnessParityClosable, evaluateHarnessParity, loadHarnessParityBaseline, sourceTreeDigest } from "../src/harness-parity.mjs";

const FIXTURE = new URL("fixtures/harness-parity-baseline.json", import.meta.url).pathname;
// harness-parity.mjs cannot reach a filesystem effect owner from src/, so it
// takes its byte reader from its caller; this test (exempt from the raw
// substrate rule, like every /test/ file) supplies one directly from node:fs.
const readSourceFile = (path) => readFileSync(path);

// One synthetic harness source tree standing in for a machine's preserved
// sources. Nothing here names a machine: the baseline record under test
// supplies every identity, path, and object-kind namespace.
function territory() {
  const root = mkdtempSync(join(tmpdir(), "harness-parity-"));
  mkdirSync(join(root, "preserved/inner"), { recursive: true });
  writeFileSync(join(root, "preserved/first.mjs"), "export const first = 1;\n");
  writeFileSync(join(root, "preserved/inner/second.mjs"), "export const second = 2;\n");
  return root;
}

async function baselineFor(repositoryRoot) {
  const baseline = await loadHarnessParityBaseline(FIXTURE);
  for (const source of baseline.sourceSets) source.treeIdentity = await sourceTreeDigest(source.root, repositoryRoot, baseline.objectKindNamespace, readSourceFile);
  return baseline;
}

test("a baseline path and a repository root are both required rather than guessed from this package's location", async () => {
  await assert.rejects(() => loadHarnessParityBaseline(), /baseline path is required/u);
  await assert.rejects(async () => evaluateHarnessParity(await baselineFor(territory())), /repositoryRoot/u);
  await assert.rejects(() => evaluateHarnessParity(undefined, { repositoryRoot: territory() }), /baseline record is required/u);
});

test("the parity position binds every preserved source set and every capability to a distinct actuator", async () => {
  const repositoryRoot = territory();
  const baseline = await baselineFor(repositoryRoot);
  const position = await evaluateHarnessParity(baseline, { repositoryRoot, readSourceFile });
  assert.equal(position.type, "CodexHarnessParityPosition");
  assert.equal(position.capabilityCount, baseline.capabilities.length);
  assert.equal(position.sourceSetCount, baseline.sourceSets.length);
  assert.deepEqual(position.duplicateCapabilities, []);
  assert.deepEqual(position.duplicateActors, []);
  assert.deepEqual(position.invalidActuators, []);
  assert.deepEqual(position.invalidRules, []);
  assert.deepEqual(position.sourceDrift, []);
  assert.deepEqual(position.uncoveredSources, []);
});

test("the demand stays mechanically open until every actuator carries receipts and the customer's own outcome", async () => {
  const repositoryRoot = territory();
  const baseline = await baselineFor(repositoryRoot);
  const position = await evaluateHarnessParity(baseline, { repositoryRoot, readSourceFile });
  assert.equal(position.disposition, "demand-open");
  assert.equal(position.unclosableCapabilities.length, baseline.capabilities.length);
  assert.deepEqual(position.deprecationEligibleSourceSets, []);
  assert.ok(position.sourceSetDeprecation.every(({ disposition, removalAuthorized }) => disposition === "preserve-source-evidence" && removalAuthorized === false));
  assert.ok(position.sourceSetDeprecation.every(({ blockingCapabilities }) => blockingCapabilities.length > 0));
  await assert.rejects(() => assertHarnessParityClosable(baseline, { repositoryRoot, readSourceFile }), /not closable/u);
});

test("an exact preserved tree earns eligibility only once every mapped capability receipt and outcome exists", async () => {
  const repositoryRoot = territory();
  const baseline = await baselineFor(repositoryRoot);
  for (const capability of baseline.capabilities) {
    capability.actuator.implementationState = "receiver-accepted";
    capability.evidence = {
      providerReceipt: `urn:receipt:${capability.id}`,
      exactCandidateDigest: `urn:candidate:${capability.id}`,
      completionObservationReceipt: `urn:completion:${capability.id}`,
      customerOutcomeReceipt: `urn:outcome:${capability.id}`,
    };
  }
  const position = await evaluateHarnessParity(baseline, { repositoryRoot, readSourceFile });
  assert.deepEqual(position.deprecationEligibleSourceSets, baseline.sourceSets.map(({ root }) => root));
  assert.ok(position.sourceSetDeprecation.every(({ disposition, removalAuthorized }) => disposition === "eligible-for-leader-authorized-deprecation" && removalAuthorized === false));
  delete baseline.capabilities[0].evidence.customerOutcomeReceipt;
  const withheld = await evaluateHarnessParity(baseline, { repositoryRoot, readSourceFile });
  assert.ok(withheld.sourceSetDeprecation.filter(({ mappedCapabilities }) => mappedCapabilities.includes(baseline.capabilities[0].id)).every(({ eligible }) => eligible === false));
});

test("a changed preserved file is reported as source drift under the baseline's own object-kind namespace", async () => {
  const repositoryRoot = territory();
  const baseline = await baselineFor(repositoryRoot);
  writeFileSync(join(repositoryRoot, "preserved/first.mjs"), "export const first = 2;\n");
  const position = await evaluateHarnessParity(baseline, { repositoryRoot, readSourceFile });
  assert.equal(position.sourceDrift.length, 1);
  assert.equal(position.sourceDrift[0].root, "preserved");
  assert.notEqual(position.sourceDrift[0].observed, position.sourceDrift[0].expected);
});
