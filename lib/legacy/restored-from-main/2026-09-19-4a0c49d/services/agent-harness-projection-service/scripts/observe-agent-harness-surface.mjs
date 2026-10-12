#!/usr/bin/env node
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { statPath } from "@red-cup-engineering/stat-path-service";
import { admitAgentHarnessObservation, identifyText } from "../src/projection.mjs";
import { refuse } from "../src/types.mjs";

/**
 * Observe a runtime surface as it is on disk: for each named repository-relative
 * path, whether it exists and the content identity of its text.
 * @param {{ root: string, paths: readonly string[] }} request
 * @returns {Promise<object>} A Result carrying AgentHarnessObservation or a typed refusal.
 */
export async function observeAgentHarnessSurface({ root, paths }) {
  if (typeof root !== "string" || root.length === 0) return refuse("projection-not-admitted", "a repository root is required");
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string" || path.length === 0)) return refuse("projection-not-admitted", "paths must be nonempty strings");
  const absoluteRoot = confinePath({ root, path: "" }).root;
  const files = [];
  for (const path of [...new Set(paths)].sort()) {
    let confined;
    try {
      confined = confinePath({ root: absoluteRoot, path, allowRoot: false });
    } catch {
      return refuse("path-outside-repository", `surface path escapes the repository root: ${path}`, { path });
    }
    const observed = await statPath({ path: confined.path });
    if (!observed.exists || observed.kind !== "file") { files.push({ path, exists: false }); continue; }
    files.push({ path, exists: true, identity: identifyText(await readFileText(confined.path)) });
  }
  return admitAgentHarnessObservation({ kind: "agent-harness-observation", version: 1, root: absoluteRoot, files });
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation(
    { name: "observe-agent-harness-surface", description: "Observes a runtime surface on disk by content identity.", operation: observeAgentHarnessSurface },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  );
  process.exitCode = result.exitCode;
}
