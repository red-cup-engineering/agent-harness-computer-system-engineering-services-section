#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { findAncestorMarkerFile } from "@red-cup-engineering/find-ancestor-marker-file-service";
import { projectFilepathDirectory } from "@red-cup-engineering/project-filepath-directory-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { adoptConfigurationArgument } from "../src/configuration.mjs";

adoptConfigurationArgument(process.argv.slice(2));
const { notebookResearchJobBoard, settleNotebookResearchJob } = await import("../src/notebook-research-jobs.mjs");

const jobId = process.argv[2];
if (!jobId) throw new Error("usage: run-notebook-research-job.mjs <NotebookResearchJobOpened id>");
const job = notebookResearchJobBoard().find((entry) => entry.id === jobId);
if (!job) throw new Error("unknown NotebookLM research job");
if (job.state !== "queued") throw new Error(`research job is already ${job.state}`);

async function repositoryRoot() {
  const start = projectFilepathDirectory(fileURLToPath(import.meta.url));
  const found = await findAncestorMarkerFile({ start, marker: "lib/emsenn" });
  if (!found.path) throw new Error("cannot locate repository root");
  return found.path;
}
const repository = await repositoryRoot();
const command = resolveFilepath([repository, "lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/services/inference-services-section/services/llm-services-section/services/openai-services-section/services/codex-harness-services-section/skills/notebooklm-network-consultation/scripts/consult-network-notebooklm.sh"]);
const args = [command, job.match, job.question, "--artifact", job.artifactType, "--limit", String(job.sourceLimit)];
if (job.resultSchema) args.push("--schema", job.resultSchema);
const receipt = executeJavascriptNodeCommand({
  type: "JavascriptNodeCommandExecutionRequest",
  version: 1,
  command: "bash",
  arguments: args,
  directory: repository,
  environment: null,
  input: null,
});
const run = receipt.result;
if (run.error) throw new Error(run.error);
if (run.status !== 0) throw new Error(run.stderr || run.stdout || `NotebookLM runner exited ${run.status}`);
const result = JSON.parse(run.stdout);
if (typeof result.seated !== "string") throw new Error("NotebookLM runner returned no seated exchange path");
const settlement = settleNotebookResearchJob({ job: job.id, exchangePath: result.seated, observedAt: new Date().toISOString() });
process.stdout.write(`${JSON.stringify({ job: job.id, exchange: result.seated, outcome: result.outcome, settlement }, null, 2)}\n`);
