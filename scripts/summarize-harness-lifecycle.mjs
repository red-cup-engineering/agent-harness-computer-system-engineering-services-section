#!/usr/bin/env node
import { isMain } from "../src/cli.mjs";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { summarizeHarnessLifecycle } from "../src/harness-lifecycle.mjs";

export function summarizeHarnessLifecycleUsage(args = [], { root } = {}) {
  return summarizeHarnessLifecycle({ root: root ?? argument("--root", args) });
}

if (isMain(import.meta.url, process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(summarizeHarnessLifecycleUsage(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`summarize-harness-lifecycle: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
