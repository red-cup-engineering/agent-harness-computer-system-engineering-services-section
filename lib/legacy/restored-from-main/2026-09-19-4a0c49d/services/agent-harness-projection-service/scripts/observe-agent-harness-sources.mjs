#!/usr/bin/env node
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { walkPosixPaths } from "@red-cup-engineering/path-walking-service";
import { statPath } from "@red-cup-engineering/stat-path-service";
import { admitAgentHarnessPolicy, admitAgentHarnessSources, referencedSources } from "../src/policy.mjs";
import { refuse } from "../src/types.mjs";

const TREE_EXCLUDES = Object.freeze(["node_modules", ".git"]);

/**
 * Observe every path an agent-harness policy references beneath one repository
 * root: existence and kind for all, text for records and instructions, and the
 * file tree with texts for each skill directory. The one read effect of the
 * projection; the pure projection consumes its output.
 * @param {{ policy: object, root: string }} request
 * @returns {Promise<object>} A Result carrying AgentHarnessSources or a typed refusal.
 */
export async function observeAgentHarnessSources({ policy, root, component }) {
  const admitted = admitAgentHarnessPolicy(policy);
  if (!admitted.ok) return admitted;
  if (typeof root !== "string" || root.length === 0) return refuse("sources-not-admitted", "a repository root is required");
  const absoluteRoot = confinePath({ root, path: "" }).root;
  const observations = [];
  const texts = {};
  const trees = {};
  for (const reference of referencedSources(policy, { component })) {
    let confined;
    try {
      confined = confinePath({ root: absoluteRoot, path: reference.path, allowRoot: false });
    } catch {
      return refuse("path-outside-repository", `referenced path escapes the repository root: ${reference.path}`, { path: reference.path });
    }
    const observed = await statPath({ path: confined.path });
    const kind = observed.exists ? observed.kind : "absent";
    observations.push({ path: reference.path, exists: observed.exists, kind });
    if (!observed.exists) continue;
    if (reference.need === "text" && kind === "file") texts[reference.path] = await readFileText(confined.path);
    if (reference.need === "tree" && kind === "directory") {
      const walk = await walkPosixPaths({ root: confined.path, excludes: [...TREE_EXCLUDES], symlinks: "skip" });
      const files = walk.files.map((file) => file.path).sort();
      trees[reference.path] = files;
      for (const file of files) texts[`${reference.path}/${file}`] = await readFileText(`${confined.path}/${file}`);
    }
  }
  return admitAgentHarnessSources({ kind: "agent-harness-sources", version: 1, root: absoluteRoot, observations, texts, trees });
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation(
    { name: "observe-agent-harness-sources", description: "Observes every path an agent-harness policy references beneath a repository root.", operation: observeAgentHarnessSources },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  );
  process.exitCode = result.exitCode;
}
