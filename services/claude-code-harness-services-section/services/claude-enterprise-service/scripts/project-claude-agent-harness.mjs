#!/usr/bin/env node
// Thin parameterization: this enterprise supplies only its policy
// (content/harness/claude-agent-harness.json) and its supplier parameter
// (content/harness/claude-suppliers.json). All projection logic is the
// upstream provider's; this script never writes an agent file itself.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hireSupplier, cliArg } from "./lib/supplier.mjs";

// Data root: a checkout of 561-group/561-group-bare-cedar-fog-claude-services-section (env CLAUDE_SERVICES_ROOT, default cwd).
const PACKAGE_ROOT = resolve(process.env.CLAUDE_SERVICES_ROOT ?? process.cwd());
const POLICY_PATH = join(PACKAGE_ROOT, "content/harness/claude-agent-harness.json");

export async function installHarness({ repoRoot, target, dryRun = false } = {}) {
  const hired = await hireSupplier("harness-projection", "projector", repoRoot ? { root: repoRoot } : {});
  return hired.module.projectClaudeHarness({
    policyPath: POLICY_PATH,
    repoRoot: hired.repoRoot,
    target: target ?? hired.repoRoot,
    dryRun,
  });
}

export async function checkHarness({ repoRoot, target } = {}) {
  const hired = await hireSupplier("harness-projection", "projector", repoRoot ? { root: repoRoot } : {});
  return hired.module.checkExactRoster({
    policyPath: POLICY_PATH,
    repoRoot: hired.repoRoot,
    target: target ?? hired.repoRoot,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const options = { repoRoot: cliArg("--repo-root"), target: cliArg("--target") };
    const result = process.argv.includes("--check")
      ? await checkHarness(options)
      : await installHarness({ ...options, dryRun: process.argv.includes("--dry-run") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`project-claude-agent-harness: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
