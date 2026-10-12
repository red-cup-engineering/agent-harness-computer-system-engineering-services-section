#!/usr/bin/env node
// Census: re-runs every target's own verification command and records the
// observed exit statuses as dated semantic records. Never read from a report:
// a target's truth is its command's exit status, observed fresh at census
// time. Red is recorded, never smoothed — the census always completes and
// always writes; it exits 0 when every target is green, 3 when any is red,
// and 1 on its own failure to run.
//
// Every machine-specific value is a parameter: the census-target record
// (`--targets`), the checkout the targets resolve against (`--root`), the
// journal custody root (`--journal-root`), and the unit the records are
// attributed to (`--unit`, which also names the semantic object kind).
//
// Commands run through the house command effect owner, never a shell. That
// owner's request carries no timeout, so a target command that hangs hangs
// the census; the prior in-machine copy passed spawnSync a 300s cap. Bounding
// it again needs a timeout on JavascriptNodeCommandExecutionRequest.
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { isMain } from "@red-cup-engineering/javascript-file-main-guard-service";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { createSemanticRecordJournal } from "@red-cup-engineering/semantic-record-journal-service";
import { statPath } from "@red-cup-engineering/stat-path-service";

export const OBJECT_KIND_SUFFIX = "census-record";

/**
 * Admits a census-target list: every target names an id, a path, and a
 * nonempty command.
 *
 * @param {unknown} targets
 * @returns {readonly object[]} the same targets, admitted.
 * @throws {Error} when the list or any target is malformed.
 */
export function validateTargets(targets) {
  if (!Array.isArray(targets)) {
    throw new Error('census: census-targets.json must have a "targets" array');
  }
  for (const target of targets) {
    if (!target.id || !target.path || !Array.isArray(target.command) || target.command.length === 0) {
      throw new Error(`census: malformed target entry (needs id, path, and a nonempty command array): ${JSON.stringify(target)}`);
    }
  }
  return targets;
}

/**
 * Re-runs every census target's own verification command and records the
 * observed exit statuses as dated semantic records.
 *
 * @param {object} options
 * @param {string} options.root - the checkout each target's `path` resolves against.
 * @param {readonly object[]} options.targets - the census targets to re-run.
 * @param {string} options.unit - the unit the records are attributed to; also the object-kind prefix.
 * @param {string} options.journalRoot - the journal custody root the records are written under.
 * @param {string} [options.objectKind] - overrides `<unit>.census-record`.
 * @param {typeof executeJavascriptNodeCommand} [options.execute] - the command effect owner; injectable for tests.
 * @param {typeof statPath} [options.stat] - the path observation owner; injectable for tests.
 * @returns {Promise<object>} a `CensusRun` summary naming the red targets.
 */
export async function runCensus({ root, targets, unit, journalRoot, objectKind, execute = executeJavascriptNodeCommand, stat = statPath } = {}) {
  for (const [name, value] of Object.entries({ root, unit, journalRoot })) {
    if (typeof value !== "string" || value === "") throw new Error(`census: ${name} is required`);
  }
  validateTargets(targets);
  const kind = objectKind ?? `${unit}.${OBJECT_KIND_SUFFIX}`;
  const startedAt = new Date();
  const results = [];

  for (const target of targets) {
    const directory = confinePath({ root, path: target.path }).path;
    const startedTargetAt = Date.now();
    let exit = null;
    let error = null;
    const observed = await stat({ path: directory });
    if (!observed.exists) {
      error = "target path does not exist";
    } else {
      const receipt = execute({
        type: "JavascriptNodeCommandExecutionRequest",
        version: 1,
        command: target.command[0],
        arguments: target.command.slice(1),
        directory,
        environment: null,
        input: null,
      });
      exit = receipt.result.status;
      if (receipt.result.error !== "") error = receipt.result.error;
      else if (exit !== 0) error = receipt.result.stderr.split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 500);
    }
    const record = {
      type: "CensusTargetObservation",
      census: startedAt.toISOString(),
      target: target.id,
      path: target.path,
      command: target.command.join(" "),
      exit,
      green: exit === 0,
      wallMs: Date.now() - startedTargetAt,
      observedAt: new Date().toISOString(),
      ...(error ? { error } : {}),
    };
    results.push(record);
    process.stderr.write(`${record.green ? "green" : "RED  "} ${target.id} exit=${exit} ${record.wallMs}ms\n`);
  }

  const journal = createSemanticRecordJournal({ root: journalRoot, objectKind: kind });
  for (const record of results) {
    journal.record({ category: `${unit}.census-target-observation`, recordedAt: record.observedAt, record, charge: { support: true, refutation: false } });
  }

  const red = results.filter((record) => !record.green);
  const summary = {
    type: "CensusRun",
    census: startedAt.toISOString(),
    unit,
    targets: results.length,
    green: results.length - red.length,
    red: red.map((record) => record.target),
    root: journal.root,
  };
  journal.record({ category: `${unit}.census-run-summary`, recordedAt: startedAt.toISOString(), record: summary, charge: { support: true, refutation: false } });
  return summary;
}

function usage() {
  return "Usage: run-census --targets <census-targets.json> --journal-root <dir> --unit <unit-id> [--root <checkout>] [--object-kind <kind>]\n"
    + "Each target path resolves against --root, which defaults to the working directory.\n";
}

if (isMain(import.meta.url)) {
  const targetsPath = argument("--targets");
  const journalRoot = argument("--journal-root");
  const unit = argument("--unit");
  if (targetsPath === undefined || journalRoot === undefined || unit === undefined) {
    process.stderr.write(usage());
    process.exit(1);
  }
  const root = confinePath({ root: argument("--root") ?? process.cwd() }).path;
  const targetsRecord = JSON.parse(await readFileText(resolveFilepath([targetsPath])));
  const summary = await runCensus({
    root,
    targets: targetsRecord.targets,
    unit,
    journalRoot: resolveFilepath([journalRoot]),
    objectKind: argument("--object-kind"),
  });
  summary.root = summary.root.startsWith(root) ? summary.root.slice(root.length + 1) : summary.root;
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(summary.red.length ? 3 : 0);
}
