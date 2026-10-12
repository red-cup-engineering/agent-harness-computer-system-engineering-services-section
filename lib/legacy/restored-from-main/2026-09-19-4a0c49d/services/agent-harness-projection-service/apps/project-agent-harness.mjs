#!/usr/bin/env node
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { parseArgs } from "node:util";
import { statPath } from "@red-cup-engineering/stat-path-service";
import { observeAgentHarnessSources } from "../scripts/observe-agent-harness-sources.mjs";
import { observeAgentHarnessSurface } from "../scripts/observe-agent-harness-surface.mjs";
import { writeAgentHarnessProjection } from "../scripts/write-agent-harness-projection.mjs";
import { admitAgentHarnessPolicy } from "../src/policy.mjs";
import { driftOfAgentHarness, projectAgentHarness, projectAgentHarnessMcp } from "../src/projection.mjs";
import { AGENT_RUNTIMES } from "../src/runtimes/index.mjs";
import { refuse } from "../src/types.mjs";

/**
 * The composition: read one policy, observe its sources, project it, and
 * either write the projection (returning the receipt) or check the surface
 * (returning agreement or a drift refusal). Scripts stay atomic; this app
 * composes them.
 */
export async function projectAgentHarnessFromPolicyFile({ policyPath, root, check = false, component }) {
  if (component !== undefined && component !== "mcp") return refuse("projection-not-admitted", `unknown component: ${component}`);
  let policy;
  try {
    policy = JSON.parse(await readFileText(policyPath));
  } catch (error) {
    return refuse("policy-not-admitted", `policy file is not readable JSON: ${policyPath}: ${error.message}`, { policyPath });
  }
  const admitted = admitAgentHarnessPolicy(policy);
  if (!admitted.ok) return admitted;
  const sources = await observeAgentHarnessSources({ policy, root, component });
  if (!sources.ok) return sources;
  let existing = "";
  if (component === "mcp") {
    const file = confinePath({ root: sources.value.root, path: policy.runtime === "codex" ? ".codex/config.toml" : ".mcp.json", allowRoot: false }).path;
    if ((await statPath({ path: file })).exists) existing = await readFileText(file);
  }
  const projection = component === "mcp" ? projectAgentHarnessMcp({ policy, sources: sources.value, existing }) : projectAgentHarness({ policy, sources: sources.value });
  if (!projection.ok) return projection;
  if (check) {
    const observation = await observeAgentHarnessSurface({ root: sources.value.root, paths: projection.value.files.map((file) => file.path) });
    if (!observation.ok) return observation;
    return driftOfAgentHarness({ projection: projection.value, observation: observation.value });
  }
  if (component === "mcp") return writeAgentHarnessProjection({ projection: projection.value });
  const manifestPath = confinePath({ root: sources.value.root, path: AGENT_RUNTIMES[policy.runtime].surface.manifestFile, allowRoot: false }).path;
  let previousManifest;
  if ((await statPath({ path: manifestPath })).exists) {
    try {
      previousManifest = JSON.parse(await readFileText(manifestPath));
    } catch {
      previousManifest = undefined;
    }
  }
  return writeAgentHarnessProjection({ projection: projection.value, previousManifest });
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    process.stdout.write("usage: project-agent-harness --policy <agent-harness-policy.json> --root <repository-root> [--check] [--component mcp]\n");
  } else {
    const { values } = parseArgs({ args: argv, options: { policy: { type: "string" }, root: { type: "string" }, check: { type: "boolean" }, component: { type: "string" } } });
    if (!values.policy) throw new TypeError("--policy is required");
    const result = await projectAgentHarnessFromPolicyFile({ policyPath: values.policy, root: values.root ?? process.cwd(), check: values.check ?? false, component: values.component });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 2;
  }
}
