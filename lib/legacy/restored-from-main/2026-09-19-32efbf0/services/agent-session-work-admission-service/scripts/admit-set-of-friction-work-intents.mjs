#!/usr/bin/env node
// One effect: a session-frictions readout in, its frictions admitted to the
// rail as structured work-intent tasks (one per friction group, under the
// standing core-stability plan) and allocated to an office so each is a
// ready duty on the dispatch readout. Idempotent per session and day. The
// rail is production MetroPlat at ops.561.group; --data-root is a test override.
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { isMain } from "@red-cup-engineering/javascript-file-main-guard-service";
import { READOUT_KIND, buildFrictionWorkIntent, tasksFromFrictions } from "../src/session-frictions.mjs";
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
 * Admits every friction in a session-frictions readout as one structured
 * intent (one task per friction group) plus one allocation per task.
 * @param {object} options
 * @param {object} options.readout - a `agent-session.session-frictions` readout.
 * @param {ReturnType<typeof resolveWorkRail>} [options.work] - the rail; defaults to production.
 * @param {object} [options.binding] - a metroplat filesystem binding (tests); ignored when `work` is given.
 * @param {string} [options.intentId]
 * @param {string} [options.office]
 * @param {string} [options.actor]
 * @param {() => Date} [options.now]
 * @param {Function} [options.admitFn]
 * @param {Function} [options.admitAllocationFn]
 * @returns {Promise<{frictions: number, admitted: number, intentId: string|null, rowsAppended: number, allocated: number, allocationsAppended: number}>}
 */
export async function admitFrictionWorkIntents({ readout, work, binding, intentId, office, actor, now = () => new Date(), admitFn, admitAllocationFn }) {
  if (readout?.kind !== READOUT_KIND) throw new Error(`readout kind must be ${READOUT_KIND} (got ${readout?.kind})`);
  const tasks = tasksFromFrictions(readout.frictions, { sessionDigest: readout.sessionDigest ?? null });
  if (tasks.length === 0) return { frictions: 0, admitted: 0, intentId: null, rowsAppended: 0, allocated: 0, allocationsAppended: 0 };
  const rail = work ?? (admitFn && admitAllocationFn ? null : resolveWorkRail());
  const admit = admitFn ?? rail.admitFn;
  const admitAllocation = admitAllocationFn ?? rail.admitAllocationFn;
  const boundBinding = binding ?? rail?.binding ?? null;
  const day = now().toISOString().slice(0, 10);
  const session = readout.sessionDigest ? readout.sessionDigest.replace(/^sha256:/u, "").slice(0, 12) : "unknown";
  const resolvedIntentId = intentId ?? `friction-work-intents-${day}-${session}`;
  const intent = buildFrictionWorkIntent({ id: resolvedIntentId, tasks });
  const at = now().toISOString();
  const subject = `structured-work-intent-${resolvedIntentId}`;
  const admission = await admit(boundBinding, intent, { at, subject });
  const { allocated, allocationsAppended } = await admitAllocationsForTasks({ tasks, subject, office, actor, at, binding: boundBinding, admitAllocationFn: admitAllocation });
  return { frictions: readout.frictions.length, admitted: tasks.length, intentId: resolvedIntentId, rowsAppended: admission.appended, allocated, allocationsAppended };
}

function usage() {
  return "Usage: admit-set-of-friction-work-intents [--readout <json>] --policy <harness-policy.json> [--data-root <dir>] [--intent-id <id>] [--office <id>] [--actor <id>]\n" +
    "Reads a agent-session.session-frictions readout (--readout, else stdin) and admits\n" +
    "one structured work-intent task per friction group under plan:2026-09-03-core-stability,\n" +
    "then one agency-work-allocation per task so each is a ready duty on the rail at\n" +
    "ops.561.group. --data-root admits into a local metroplat data root instead (tests only).\n" +
    "Prints one JSON line.\n";
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }
  let work = null;
  try {
    const readoutPath = argument("--readout");
    const readout = readoutPath === undefined ? await readStandardInputJson() : JSON.parse(await readFileText(resolveFilepath([readoutPath])));
    const policyPath = argument("--policy");
    const identity = policyPath === undefined ? {} : await readAllocationIdentity(policyPath);
    work = resolveWorkRail({ dataRoot: argument("--data-root") });
    const summary = await admitFrictionWorkIntents({
      readout,
      work,
      intentId: argument("--intent-id"),
      office: argument("--office") ?? identity.office,
      actor: argument("--actor") ?? identity.actor,
    });
    process.stdout.write(`${JSON.stringify({ rail: work.kind, ...summary })}\n`);
  } catch (error) {
    process.stderr.write(`admit-set-of-friction-work-intents: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await work?.close();
  }
}
