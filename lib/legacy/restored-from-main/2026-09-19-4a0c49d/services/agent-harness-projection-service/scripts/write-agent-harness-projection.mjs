#!/usr/bin/env node
import { admit } from "@red-cup-engineering/computer-data-engine";
import { writeFileText } from "@red-cup-engineering/file-services/write-file";
import { confinePath, confineWritablePath } from "@red-cup-engineering/filepath-services-section";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { removePath } from "@red-cup-engineering/remove-path-service";
import { admitAgentHarnessProjection } from "../src/projection.mjs";
import { RECEIPT_TYPE, accept, refuse } from "../src/types.mjs";

export const AGENT_HARNESS_PROJECTION_EFFECT = "agent-harness:project";

/**
 * Write one admitted projection beneath its repository root, atomically per
 * file, pruning files a previous manifest owned that this projection no longer
 * names, and return the engine's receipt for the effect. Every path is confined
 * to the root before anything is written or removed.
 * @param {{ projection: object, previousManifest?: { files: readonly string[] }, now?: string }} request
 * @returns {Promise<object>} A Result carrying a Receipt or a typed refusal.
 */
export async function writeAgentHarnessProjection({ projection, previousManifest, now }) {
  const admitted = admitAgentHarnessProjection(projection);
  if (!admitted.ok) return admitted;
  const owned = new Set(projection.files.map((file) => file.path));
  const previous = Array.isArray(previousManifest?.files) ? previousManifest.files.filter((path) => typeof path === "string" && path.length > 0) : [];
  const targets = [];
  for (const file of projection.files) {
    try {
      targets.push({ file, confined: await confineWritablePath({ root: projection.root, path: file.path }) });
    } catch (error) {
      return refuse("path-outside-repository", `projected path cannot be written beneath the root: ${file.path}: ${error.message}`, { path: file.path });
    }
  }
  const stale = [];
  for (const path of previous) {
    if (owned.has(path)) continue;
    try {
      stale.push({ path, confined: confinePath({ root: projection.root, path, allowRoot: false }) });
    } catch {
      return refuse("path-outside-repository", `previously owned path escapes the root: ${path}`, { path });
    }
  }
  const written = [];
  for (const { file, confined } of targets) {
    const receipt = await writeFileText(confined.path, file.text);
    written.push({ path: file.path, bytes: receipt.bytes });
  }
  const removed = [];
  for (const { path, confined } of stale) {
    await removePath({ path: confined.path });
    removed.push(path);
  }
  const receipt = {
    kind: "receipt",
    effect: AGENT_HARNESS_PROJECTION_EFFECT,
    receiver: projection.actor,
    evidence: {
      kind: "evidence",
      source: projection.root,
      observedAt: typeof now === "string" ? now : new Date().toISOString(),
      content: { runtime: projection.runtime, identity: projection.identity, written, removed },
      provenance: [projection.identity],
    },
  };
  const admittedReceipt = admit(RECEIPT_TYPE, receipt);
  if (!admittedReceipt.ok) return refuse("projection-not-admitted", "the write receipt was not admitted by the engine's Receipt type", { issues: admittedReceipt.refusal.issues });
  return accept(Object.freeze(receipt));
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation(
    { name: "write-agent-harness-projection", description: "Writes one agent-harness projection beneath its repository root and returns a receipt.", operation: writeAgentHarnessProjection },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  );
  process.exitCode = result.exitCode;
}
