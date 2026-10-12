#!/usr/bin/env node
// Analyze-to-Plan edge of the health MAPE-K loop: the checkout-health
// checkers run on the checkout that carries the debt, and the findings are
// admitted as ready duties on the work rail. Composes metroplat's own
// `readCheckoutHealth` and `healthWorkIntent` and the rail's generic admit
// verbs; never reimplements the finding-grouping, unit-observation, or
// structured-intent assembly. The checkout, the allocating office, the
// incumbent actor, and the checkout-bound unit allowlist are all
// parameters — nothing here names a machine.
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { healthWorkIntent, readCheckoutHealth } from "@red-cup-engineering/metroplat/monitoring";
import { resolveWorkRail } from "@red-cup-engineering/agent-work-computer-system-engineering-services-section/work-rail";
import { isMain } from "@red-cup-engineering/javascript-file-main-guard-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { CHAIN_ITEMS, admitAllocationsForTasks } from "../src/work-allocation.mjs";
import { readAllocationIdentity } from "./read-allocation-identity.mjs";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";

/**
 * Reads the machine's own allowlist of checkout-bound systemd units — units
 * whose subject IS the checkout and which are therefore lawful development
 * infrastructure rather than a custody violation (ruled 2026-09-06). The
 * allowlist is a machine's config, never this service's: it is passed
 * through to metroplat's `checkout-health` family as
 * `checkoutBoundUnitsAllow`.
 * @param {string} [allowPath] - JSON file holding a string array, or `{units: [...]}`.
 * @returns {Promise<readonly string[]>} the allowlist, empty when no file is named.
 */
export async function readCheckoutBoundUnitsAllow(allowPath) {
  if (allowPath === undefined) return Object.freeze([]);
  const record = JSON.parse(await readFileText(resolveFilepath([allowPath])));
  const units = Array.isArray(record) ? record : record.units;
  if (!Array.isArray(units) || units.some((unit) => typeof unit !== "string" || unit === "")) {
    throw new Error(`${allowPath} must hold a nonempty-string array of unit names (or {"units": [...]})`);
  }
  return Object.freeze([...units]);
}

/**
 * Runs the checkout-health checkers on this checkout and admits every finding
 * as a task under the chain's plan cell, plus one allocation per task, on
 * the rail. The summary is the same shape metroplat's own
 * `checkout-health-work-intent-admit` verb returns.
 * @param {object} [options]
 * @param {string} [options.root] - repo root the checkout-scoped checkers scan; omitted, they do not run.
 * @param {boolean} [options.changedOnly] - defaults false: scans the whole checkout, not just git-changed paths.
 * @param {number} [options.budgetMs]
 * @param {readonly string[]} [options.hosts]
 * @param {readonly string[]} [options.checkoutBoundUnitsAllow]
 * @param {string} [options.intentId]
 * @param {string} options.office - the office the findings are allocated to.
 * @param {string} options.actor - the incumbent actor charging the allocation.
 * @param {readonly object[]} [options.chain] - defaults to {@link CHAIN_ITEMS}.
 * @param {ReturnType<typeof resolveWorkRail>} [options.work] - the rail; defaults to production.
 * @param {typeof readCheckoutHealth} [options.readHealthFn] - injectable for tests.
 * @param {typeof healthWorkIntent} [options.healthWorkIntentFn] - injectable for tests.
 * @param {() => Date} [options.now]
 * @returns {Promise<object>} a `metroplat.monitoring.checkout-health.work-intent-summary` record.
 */
export async function admitSetOfHealthWorkIntents({
  root,
  changedOnly = false,
  budgetMs,
  hosts,
  checkoutBoundUnitsAllow = [],
  intentId,
  office,
  actor,
  chain = CHAIN_ITEMS,
  work,
  readHealthFn = readCheckoutHealth,
  healthWorkIntentFn = healthWorkIntent,
  now = () => new Date(),
} = {}) {
  const health = readHealthFn({ root, changedOnly, budgetMs, hosts, checkoutBoundUnitsAllow });
  const at = now().toISOString();
  const resolvedIntentId = intentId ?? `checkout-health-work-intents-${at.slice(0, 10)}`;
  if (health.violations === 0) {
    return { kind: "metroplat.monitoring.checkout-health.work-intent-summary", checked: health.checked, violations: 0, admitted: 0, intentId: null, rowsAppended: 0, allocated: 0, allocationsAppended: 0 };
  }
  const rail = work ?? resolveWorkRail();
  const plan = healthWorkIntentFn(health, { id: resolvedIntentId, chain, office, actor, root });
  const subject = `structured-work-intent-${resolvedIntentId}`;
  const admission = await rail.admitFn(rail.binding, plan.intent, { at, subject });
  const { allocationsAppended } = await admitAllocationsForTasks({ tasks: plan.tasks, subject, office, actor, at, binding: rail.binding, admitAllocationFn: rail.admitAllocationFn });
  return {
    kind: "metroplat.monitoring.checkout-health.work-intent-summary",
    checked: health.checked,
    violations: health.violations,
    admitted: plan.tasks.length,
    intentId: resolvedIntentId,
    rowsAppended: admission.appended,
    allocated: plan.allocations.length,
    allocationsAppended,
  };
}

function usage() {
  return "Usage: admit-set-of-health-work-intents --root <repo-root> --policy <harness-policy.json>\n" +
    "  [--checkout-bound-units <allowlist.json>] [--hosts local,other-host] [--intent-id <id>]\n" +
    "  [--budget-ms <n>] [--office <office-id>] [--actor <actor-id>] [--changed-only] [--data-root <dir>]\n" +
    "Runs the checkout-health checkers (systemd failed units, checkout-bound units, and, when --root\n" +
    "is given, the data-custody/exact-deps/lockfile-registry/import-stratification checkers) on the\n" +
    "checkout at --root and admits the findings as one structured work intent's task items under\n" +
    "plan:2026-09-03-core-stability, plus one agency-work-allocation per task, on the work rail.\n" +
    "--policy names the harness policy whose actor and rootOffice the allocations are charged to;\n" +
    "--office/--actor override it. By default the checkers scan the whole checkout; pass\n" +
    "--changed-only to scan only the working tree's git-changed paths. --data-root admits into a\n" +
    "local metroplat data root instead (tests only). Prints one JSON summary line.\n";
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }
  let work = null;
  try {
    const root = argument("--root");
    const policyPath = argument("--policy");
    if (root === undefined) throw new Error("--root is required");
    const identity = policyPath === undefined ? { actor: undefined, office: undefined } : await readAllocationIdentity(policyPath);
    const hostsArgument = argument("--hosts");
    const budgetMsArgument = argument("--budget-ms");
    work = resolveWorkRail({ dataRoot: argument("--data-root") });
    const summary = await admitSetOfHealthWorkIntents({
      root: resolveFilepath([root]),
      budgetMs: budgetMsArgument === undefined ? undefined : Number(budgetMsArgument),
      changedOnly: argv.includes("--changed-only"),
      hosts: hostsArgument === undefined ? undefined : hostsArgument.split(","),
      checkoutBoundUnitsAllow: await readCheckoutBoundUnitsAllow(argument("--checkout-bound-units")),
      intentId: argument("--intent-id"),
      office: argument("--office") ?? identity.office,
      actor: argument("--actor") ?? identity.actor,
      work,
    });
    process.stdout.write(`${JSON.stringify({ rail: work.kind, ...summary })}\n`);
  } catch (error) {
    process.stderr.write(`admit-set-of-health-work-intents: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await work?.close();
  }
}
