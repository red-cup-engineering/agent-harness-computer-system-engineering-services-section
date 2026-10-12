#!/usr/bin/env node
import { isMain } from "../src/cli.mjs";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { recordInferencePurchase } from "../src/harness-lifecycle.mjs";

export function recordHarnessInferencePurchase(args, { root, actor } = {}) {
  const priceRaw = argument("--price", args);
  const usageRaw = argument("--usage", args);
  const latencyRaw = argument("--latency-seconds", args);
  return recordInferencePurchase({
    root: root ?? argument("--root", args),
    actor: actor ?? argument("--actor", args) ?? process.env.HARNESS_LIFECYCLE_ACTOR,
    turnId: argument("--turn", args),
    provider: argument("--provider", args),
    model: argument("--model", args),
    outcome: argument("--outcome", args),
    latencySeconds: latencyRaw === undefined ? undefined : Number(latencyRaw),
    exchangeId: argument("--exchange-id", args),
    price: priceRaw === undefined ? undefined : JSON.parse(priceRaw),
    usage: usageRaw === undefined ? undefined : JSON.parse(usageRaw),
  });
}

if (isMain(import.meta.url, process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(recordHarnessInferencePurchase(process.argv.slice(2)), null, 2)}\n`); }
  catch (error) { process.stderr.write(`record-harness-inference-purchase: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
