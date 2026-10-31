#!/usr/bin/env node
// Thin parameterization: policy in content/harness/claude-permission-policy.json,
// supplier address in content/harness/claude-suppliers.json, logic upstream.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hireSupplier, cliArg } from "./lib/supplier.mjs";

// Data root: a checkout of 561-group/561-group-bare-cedar-fog-claude-services-section (env CLAUDE_SERVICES_ROOT, default cwd).
const PACKAGE_ROOT = resolve(process.env.CLAUDE_SERVICES_ROOT ?? process.cwd());
const POLICY_PATH = join(PACKAGE_ROOT, "content/harness/claude-permission-policy.json");

export async function installPermissions({ repoRoot, target, dryRun = false } = {}) {
  const hired = await hireSupplier("harness-projection", "permissions", repoRoot ? { root: repoRoot } : {});
  return hired.module.projectPermissions({
    policyPath: POLICY_PATH,
    target: target ?? hired.repoRoot,
    dryRun,
  });
}

export async function checkPermissions({ repoRoot, target } = {}) {
  const hired = await hireSupplier("harness-projection", "permissions", repoRoot ? { root: repoRoot } : {});
  return hired.module.checkPermissions({
    policyPath: POLICY_PATH,
    target: target ?? hired.repoRoot,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const options = { repoRoot: cliArg("--repo-root"), target: cliArg("--target") };
    const result = process.argv.includes("--check")
      ? await checkPermissions(options)
      : await installPermissions({ ...options, dryRun: process.argv.includes("--dry-run") });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`project-claude-permissions: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
