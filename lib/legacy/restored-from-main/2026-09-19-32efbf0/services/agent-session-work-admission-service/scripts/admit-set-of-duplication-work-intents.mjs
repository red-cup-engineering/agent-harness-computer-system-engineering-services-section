#!/usr/bin/env node
// One effect: a DuplicationWorkIntentSet in (see
// @red-cup-engineering/derive-set-of-duplication-work-intents-service), each
// of its already-complete structured-intent entries admitted to the rail
// through MetroPlat's generic structured-work-intent-admit verb, plus one
// allocation per intent's task so each is a ready duty on the dispatch
// readout. Idempotent per intent id and per task cell. The rail is production
// MetroPlat at ops.561.group; --data-root is a test override.
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { isMain } from "@red-cup-engineering/javascript-file-main-guard-service";
import { resolveWorkRail } from "@red-cup-engineering/agent-work-computer-system-engineering-services-section/work-rail";
import { admitAllocationsForTasks } from "../src/work-allocation.mjs";
import { readAllocationIdentity } from "./read-allocation-identity.mjs";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";


/**
 * One bounded JSON document read from standard input, through the house's own
 * standard-input reader.
 * @param {number} [limit] - refuse an input larger than this many characters.
 * @returns {Promise<unknown>}
 */
async function readStandardInputJson(limit = 1024 * 1024) {
  const read = await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: process.stdin });
  if (read.text.length > limit) throw new Error(`standard input exceeds ${limit} characters`);
  return JSON.parse(read.text);
}

/**
 * Admits every intent of a DuplicationWorkIntentSet and allocates each one's task.
 * @param {object} options
 * @param {{type: string, intents: readonly object[]}} options.set
 * @param {ReturnType<typeof resolveWorkRail>} [options.work] - the rail; defaults to production.
 * @param {object} [options.binding] - a metroplat filesystem binding (tests); ignored when `work` is given.
 * @param {string} [options.office]
 * @param {string} [options.actor]
 * @param {() => Date} [options.now]
 * @param {Function} [options.admitFn]
 * @param {Function} [options.admitAllocationFn]
 * @returns {Promise<{intents: number, admitted: object[], rowsAppended: number, allocated: number, allocationsAppended: number}>}
 */
export async function admitSetOfDuplicationWorkIntents({ set, work, binding, office, actor, duty, now = () => new Date(), admitFn, admitAllocationFn }) {
  if (set?.type !== "DuplicationWorkIntentSet" || !Array.isArray(set.intents)) {
    throw new TypeError(`set must be a DuplicationWorkIntentSet with an intents array (got ${set?.type})`);
  }
  const rail = work ?? (admitFn && admitAllocationFn ? null : resolveWorkRail());
  const admit = admitFn ?? rail.admitFn;
  const admitAllocation = admitAllocationFn ?? rail.admitAllocationFn;
  const boundBinding = binding ?? rail?.binding ?? null;
  let rowsAppended = 0;
  let allocated = 0;
  let allocationsAppended = 0;
  const admitted = [];
  for (const intent of set.intents) {
    const at = now().toISOString();
    const subject = `structured-work-intent-${intent.id}`;
    const admission = await admit(boundBinding, intent, { at, subject });
    rowsAppended += admission.appended;
    const task = intent.items.at(-1);
    const allocation = await admitAllocationsForTasks({ tasks: [task], subject, office, actor, duty, at, binding: boundBinding, admitAllocationFn: admitAllocation });
    allocated += allocation.allocated;
    allocationsAppended += allocation.allocationsAppended;
    admitted.push({ intentId: intent.id, appended: admission.appended, status: admission.status });
  }
  return { intents: set.intents.length, admitted, rowsAppended, allocated, allocationsAppended };
}

function usage() {
  return "Usage: admit-set-of-duplication-work-intents [--set <json>] --policy <harness-policy.json> [--data-root <dir>] [--office <id>] [--actor <id>]\n" +
    "Reads a DuplicationWorkIntentSet (--set, else stdin; see\n" +
    "derive-set-of-duplication-work-intents) and admits each of its intents,\n" +
    "already-complete structured work intents, through metroplat's own\n" +
    "structured-work-intent-admit verb on the rail at ops.561.group, plus one\n" +
    "agency-work-allocation per intent's task so each is a ready duty.\n" +
    "--data-root admits into a local metroplat data root instead (tests only).\n" +
    "Prints one JSON summary line.\n";
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }
  let work = null;
  try {
    const setPath = argument("--set");
    const set = setPath === undefined ? await readStandardInputJson() : JSON.parse(await readFileText(resolveFilepath([setPath])));
    const policyPath = argument("--policy");
    const identity = policyPath === undefined ? {} : await readAllocationIdentity(policyPath);
    work = resolveWorkRail({ dataRoot: argument("--data-root") });
    const summary = await admitSetOfDuplicationWorkIntents({
      set,
      work,
      office: argument("--office") ?? identity.office,
      actor: argument("--actor") ?? identity.actor,
      duty: argument("--duty"),
    });
    process.stdout.write(`${JSON.stringify({ rail: work.kind, ...summary })}\n`);
  } catch (error) {
    process.stderr.write(`admit-set-of-duplication-work-intents: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await work?.close();
  }
}
