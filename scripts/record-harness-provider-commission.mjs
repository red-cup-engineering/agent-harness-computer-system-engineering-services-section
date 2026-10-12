#!/usr/bin/env node
import { isMain } from "../src/cli.mjs";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { recordProviderCommission } from "../src/harness-lifecycle.mjs";

export function recordHarnessProviderCommission(args, { root, actor } = {}) {
  return recordProviderCommission({
    root: root ?? argument("--root", args),
    actor: actor ?? argument("--actor", args) ?? process.env.HARNESS_LIFECYCLE_ACTOR,
    turnId: argument("--turn", args),
    agent: argument("--agent", args),
    task: argument("--task", args),
  });
}

if (isMain(import.meta.url, process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(recordHarnessProviderCommission(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`record-harness-provider-commission: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
