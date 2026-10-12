import test from "node:test";
import assert from "node:assert/strict";
import { POLICY_ENV_VAR, machineSectionOf, readMachineParameters, repositoryRootOf } from "../scripts/machine-parameters.mjs";
import { harnessPolicy, lifecycleEvent, textReader } from "./lifecycle-event.mjs";

const root = "/repo";
const policyRelative = "lib/machine/services/harness/agent-harness-policy.json";
const policyAbsolute = `${root}/${policyRelative}`;
const files = { [policyAbsolute]: JSON.stringify(harnessPolicy()) };

test("the machine section is everything above the root-instructions carrier's own content directory", () => {
  assert.equal(machineSectionOf("lib/machine-section/content/harness/root-instructions.md"), "lib/machine-section");
  assert.equal(machineSectionOf("a/b/c/content/root.md"), "a/b/c");
  assert.equal(machineSectionOf("content/root.md"), undefined);
  assert.equal(machineSectionOf("lib/machine/root.md"), undefined);
});

test("every machine location is derived from the policy record the environment names", async () => {
  const machine = await readMachineParameters({ root, environment: { [POLICY_ENV_VAR]: policyRelative }, readText: textReader(files) });
  assert.equal(machine.policyPath, policyAbsolute);
  assert.equal(machine.actor, "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw");
  assert.equal(machine.harnessSection, "/repo/lib/machine/services/harness");
  assert.equal(machine.journalRoot, "/repo/lib/machine/services/harness");
  assert.equal(machine.settledAppPurposeRegistry, "/repo/lib/machine/services/harness/content/harness/settled-app-purposes.json");
  assert.equal(machine.statePath("disk-io-coordinator.lock"), "/repo/lib/machine/services/harness/data/state/disk-io-coordinator.lock");
  assert.equal(machine.machineSection, "/repo/lib/machine-section");
  assert.equal(machine.machineContentRoot, "/repo/lib/machine-section/content");
});

test("an absolute policy path is taken as it stands, and an explicit override wins over the environment", async () => {
  const absolute = await readMachineParameters({ root, environment: { [POLICY_ENV_VAR]: policyAbsolute }, readText: textReader(files) });
  assert.equal(absolute.policyPath, policyAbsolute);
  const override = await readMachineParameters({ root, policyPath: policyAbsolute, environment: {}, readText: textReader(files) });
  assert.equal(override.policyPath, policyAbsolute);
});

test("no named policy, no root, or a record the platform does not admit all refuse", async () => {
  await assert.rejects(() => readMachineParameters({ root, environment: {}, readText: textReader(files) }), new RegExp(POLICY_ENV_VAR));
  await assert.rejects(() => readMachineParameters({ environment: { [POLICY_ENV_VAR]: policyRelative }, readText: textReader(files) }), /repository root is required/);
  const notAPolicy = textReader({ [policyAbsolute]: JSON.stringify({ kind: "something-else" }) });
  await assert.rejects(() => readMachineParameters({ root, environment: { [POLICY_ENV_VAR]: policyRelative }, readText: notAPolicy }), /not admitted by AgentHarnessPolicy/);
});

test("the repository root is the runtime's project directory, else the event's own working directory", () => {
  assert.equal(repositoryRootOf(lifecycleEvent({ event: "Stop", cwd: "/from-event" }), { environment: {} }), "/from-event");
  assert.equal(repositoryRootOf(lifecycleEvent({ event: "Stop", cwd: "/from-event" }), { environment: { CLAUDE_PROJECT_DIR: "/from-env" } }), "/from-env");
  assert.equal(repositoryRootOf(lifecycleEvent({ event: "Stop" }), { root: "/explicit", environment: { CLAUDE_PROJECT_DIR: "/from-env" } }), "/explicit");
  assert.equal(repositoryRootOf(lifecycleEvent({ event: "Stop", cwd: null }), { environment: {} }), undefined);
});
