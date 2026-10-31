#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { processPromptCycle, recordPromptCycleAborted, recordPromptCycleFailure } from "../src/prompt-cycle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// Root is identified by the workspace root package.json's own name, not by a
// hand-authored doc's presence (AGENTS.md was removed as unowned prose).
function isRepoRootDirectory(dir) {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return false;
  try { return JSON.parse(readFileSync(path, "utf8")).name === "@bare-cedar-fog/machine-workspace"; }
  catch { return false; }
}
function repositoryRoot() {
  let current = HERE;
  while (true) {
    if (isRepoRootDirectory(current) && existsSync(join(current, "lib/emsenn"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("cannot locate repository root");
    current = parent;
  }
}
const REPO = repositoryRoot();
const MARKET = resolve(REPO, "lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/services/inference-services-section/services/inference-work-lot-service/src/codex-inference-market.mjs");
process.env.WITNESS_JOURNAL_RDF_AGENT ??= "http://127.0.0.1:19764/.well-known/agent-card.json";
const cycleAt = process.argv.indexOf("--cycle");
if (cycleAt < 0 || !process.argv[cycleAt + 1]) throw new TypeError("--cycle is required");
const authorityAt = process.argv.indexOf("--placement-authority-file");
if (authorityAt < 0 || !process.argv[authorityAt + 1]) throw new TypeError("--placement-authority-file is required; direct local prompt workers are refused");
const placementAuthority = JSON.parse(readFileSync(resolve(process.argv[authorityAt + 1]), "utf8"));

const schema = {
  type: "object", additionalProperties: false, required: ["workItems"],
  properties: { workItems: { type: "array", minItems: 1, items: {
    type: "object", additionalProperties: false,
    required: ["objective", "desiredOutcome", "completionConditions", "dependencies"],
    properties: {
      objective: { type: "string", minLength: 1 }, desiredOutcome: { type: "string", minLength: 1 },
      completionConditions: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      dependencies: { type: "array", items: { type: "string", minLength: 1 } },
    },
  } } },
};

const controller = new AbortController();
const abort = (signal) => controller.abort(`prompt-cycle worker received ${signal}`);
process.once("SIGTERM", abort);
process.once("SIGINT", abort);

const infer = async (prompt, start, { signal }) => {
  const { contractCodexInferenceWork } = await import(`file://${MARKET}`);
  const result = await contractCodexInferenceWork({
    customer: "urn:ame:bare-cedar-fog-codex", workType: "extraction", taskClass: "codex-prompt-to-work-items",
    objective: "Extract the Leader's exact demand and corrections into the smallest dependency-aware set of executable work items. Preserve constraints and explicit non-goals. Do not invent authority, completion, or facts.",
    desiredUse: "Populate the persisted Codex MAPE cycle with candidate work items; Codex separately integrates and the customer separately accepts.",
    context: JSON.stringify({ prompt: prompt.prompt, interruption: prompt.interruption, supersedes: prompt.supersedes, cycle: start.cycle }),
    outputSchema: schema, enforceProviderSchema: true, mode: "live", requiredCapabilities: ["json-schema-output"],
  }, { signal });
  if (result.outcome !== "candidate-pending-codex-acceptance" || !result.candidate) throw new Error(`prompt inference did not deliver an assayed candidate: ${result.outcome ?? result.disposition ?? "unknown"}`);
  return { provider: result.provider, receipt: result.receipt?.id ?? result.receipt, product: result.candidate };
};

processPromptCycle(process.argv[cycleAt + 1], { infer, signal: controller.signal, placementAuthority }).then((result) => {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}).catch((error) => {
  if (controller.signal.aborted) recordPromptCycleAborted(process.argv[cycleAt + 1], error);
  else recordPromptCycleFailure(process.argv[cycleAt + 1], error);
  process.stderr.write(`process-prompt-cycle: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = controller.signal.aborted ? 0 : 1;
}).finally(() => {
  process.removeListener("SIGTERM", abort);
  process.removeListener("SIGINT", abort);
});
