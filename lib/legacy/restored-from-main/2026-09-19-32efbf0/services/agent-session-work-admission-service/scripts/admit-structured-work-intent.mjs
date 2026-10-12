#!/usr/bin/env node
// admit-structured-work-intent — admits one already-complete structured work
// intent (an agent-work.structured-intent JSON document, typically a founder
// babble typed into cells with provenance spans) through metroplat's own
// structured-work-intent-admit verb on the rail at ops.561.group, plus one
// agency-work-allocation per task-level item so each is a ready duty.
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
 * @param {object} options
 * @param {object} options.intent - an agent-work.structured-intent document.
 * @param {object} [options.work] - a resolved work rail (tests).
 * @param {string} [options.office]
 * @param {string} [options.actor]
 * @param {() => Date} [options.now]
 * @returns {Promise<{intentId: string, appended: number, status: string|undefined, allocated: number, allocationsAppended: number}>}
 */
export async function admitStructuredWorkIntentDocument({ intent, work, office, actor, duty, now = () => new Date() }) {
  if (intent?.kind !== "agent-work.structured-intent" || typeof intent.id !== "string" || !Array.isArray(intent.items)) {
    throw new TypeError(`intent must be an agent-work.structured-intent with id and items (got ${intent?.kind})`);
  }
  const rail = work ?? resolveWorkRail();
  const at = now().toISOString();
  const subject = `structured-work-intent-${intent.id}`;
  const admission = await rail.admitFn(rail.binding, intent, { at, subject });
  const tasks = intent.items.filter((item) => /^task:/u.test(item.cell));
  const allocation = await admitAllocationsForTasks({ tasks, subject, office, actor, duty, at, binding: rail.binding, admitAllocationFn: rail.admitAllocationFn });
  return { intentId: intent.id, appended: admission.appended, status: admission.status, allocated: allocation.allocated, allocationsAppended: allocation.allocationsAppended };
}

function usage() {
  return "Usage: admit-structured-work-intent [--intent <json>] --policy <harness-policy.json> [--data-root <dir>] [--office <id>] [--actor <id>]\n" +
    "Reads one metroplat.work.structured-intent document (--intent, else stdin) and admits it\n" +
    "through the structured-work-intent-admit verb on the rail at ops.561.group, plus one\n" +
    "agency-work-allocation per task: item. --data-root admits into a local metroplat data\n" +
    "root instead (tests only). Prints one JSON summary line.\n";
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--help")) { process.stdout.write(usage()); process.exit(0); }
  let work = null;
  try {
    const intentPath = argument("--intent");
    const intent = intentPath === undefined ? await readStandardInputJson() : JSON.parse(await readFileText(resolveFilepath([intentPath])));
    const policyPath = argument("--policy");
    const identity = policyPath === undefined ? {} : await readAllocationIdentity(policyPath);
    work = resolveWorkRail({ dataRoot: argument("--data-root") });
    const summary = await admitStructuredWorkIntentDocument({
      intent,
      work,
      office: argument("--office") ?? identity.office,
      actor: argument("--actor") ?? identity.actor,
      duty: argument("--duty"),
    });
    process.stdout.write(`${JSON.stringify({ rail: work.kind, ...summary })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally {
    if (work) await work.close();
  }
}
