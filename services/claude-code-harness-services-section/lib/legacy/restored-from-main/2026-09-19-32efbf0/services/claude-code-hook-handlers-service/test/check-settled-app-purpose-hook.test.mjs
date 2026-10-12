import test from "node:test";
import assert from "node:assert/strict";
import { BYPASS_ENV_VAR, checkSettledAppPurpose, settledPurposeFor } from "../scripts/check-settled-app-purpose-hook.mjs";
import { POLICY_ENV_VAR } from "../scripts/machine-parameters.mjs";
import { harnessPolicy, lifecycleEvent, responseOf, textReader } from "./lifecycle-event.mjs";

const registryPath = "/registry.json";
const REGISTRY = JSON.stringify({
  type: "SettledAppPurposeRegistry",
  entries: [{
    pathContains: "/apps/metroplat/",
    app: "metroplat",
    purpose: "MetroPlat is the UI for MARSH and carries no capabilities of its own.",
    instruction: "Find the real capability's owner and migrate metroplat to import it.",
  }],
});

const write = (filePath, tool = "Write") => lifecycleEvent({ event: "PreToolUse", tool, toolInput: { file_path: filePath } });

async function rule(event, { files = { [registryPath]: REGISTRY }, ...rest } = {}) {
  return responseOf(await checkSettledAppPurpose(event, { environment: {}, readText: textReader(files), registryPath, ...rest }));
}

test("the registry entry whose path the write falls under is the one that rules", () => {
  const registry = JSON.parse(REGISTRY);
  assert.equal(settledPurposeFor(registry, "/repo/apps/metroplat/src/x.ts").app, "metroplat");
  assert.equal(settledPurposeFor(registry, "repo\\apps\\metroplat\\src\\x.ts").app, "metroplat");
  assert.equal(settledPurposeFor(registry, "/repo/lib/a.mjs"), undefined);
  assert.equal(settledPurposeFor({}, "/repo/apps/metroplat/x"), undefined);
});

test("a write inside a settled app is refused, carrying that purpose and its repair verbatim", async () => {
  for (const tool of ["Write", "Edit", "MultiEdit"]) {
    const response = await rule(write("/repo/apps/metroplat/src/x.ts", tool));
    assert.equal(response.disposition, "block");
    assert.match(response.reason, /MetroPlat is the UI for MARSH/);
    assert.match(response.reason, /migrate metroplat to import it/);
    assert.match(response.reason, new RegExp(BYPASS_ENV_VAR));
  }
});

test("a path with no settled purpose, another tool, and the explicit bypass continue", async () => {
  assert.equal((await rule(write("/repo/lib/a.mjs"))).disposition, "continue");
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse", tool: "Bash", toolInput: { command: "ls" } }))).disposition, "continue");
  assert.equal((await rule(write("/repo/apps/metroplat/x.ts"), { environment: { [BYPASS_ENV_VAR]: "1" } })).disposition, "continue");
});

test("a machine that has settled no purpose forbids nothing", async () => {
  assert.equal((await rule(write("/repo/apps/metroplat/x.ts"), { files: {} })).disposition, "continue");
});

test("with no override the registry is the one the machine's own policy names", async () => {
  const policyPath = "/repo/lib/machine/services/harness/agent-harness-policy.json";
  const derived = "/repo/lib/machine/services/harness/content/harness/settled-app-purposes.json";
  const response = responseOf(await checkSettledAppPurpose(write("/repo/apps/metroplat/x.ts"), {
    environment: { [POLICY_ENV_VAR]: policyPath, CLAUDE_PROJECT_DIR: "/repo" },
    readText: textReader({ [policyPath]: JSON.stringify(harnessPolicy()), [derived]: REGISTRY }),
  }));
  assert.equal(response.disposition, "block");
  assert.match(response.reason, /MetroPlat is the UI for MARSH/);
});
