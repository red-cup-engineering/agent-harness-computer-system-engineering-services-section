import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const promptCycle = new URL("../src/prompt-cycle.mjs", import.meta.url);
const manifest = new URL("../package.json", import.meta.url);

test("the direct Codex prompt cycle enters governing work through the generic admission boundary", async () => {
  const [source, packageJson] = await Promise.all([readFile(promptCycle, "utf8"), readFile(manifest, "utf8")]);
  assert.match(source, /@red-cup-engineering\/governing-work-computer-system-engineering-services-section/u);
  assert.match(source, /compileGoverningWorkProgram/u);
  assert.doesNotMatch(source, /@561-group\/561-group-enterprise-project-management-services-section/u);
  const dependencies = JSON.parse(packageJson).dependencies;
  assert.equal(dependencies["@red-cup-engineering/governing-work-computer-system-engineering-services-section"], "0.1.2");
  assert.equal(dependencies["@561-group/561-group-enterprise-project-management-services-section"], undefined);
});
