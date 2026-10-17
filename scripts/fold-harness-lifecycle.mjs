// fold-harness-lifecycle — reads each harness section's own skill-selected/provider-commissioned
// events as the store's `harness-lifecycle` records (the owner's reader), admission-
// filtered (see readLifecycleEvents), and appends each admitted event as a
// "duty" reported-by its actor and reported-at that actor's office (seed-offices.mjs must run
// first). Idempotent: a duty's constituteEntity address is content-derived from the event's own
// fields, so a re-fold appends nothing new.
// Run: node scripts/fold-harness-lifecycle.mjs [tracePath] (defaults below; overridable by argv/env).

import { findRepoRoot } from "../src/world-roots.mjs";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { constitute } from "@red-cup-engineering/eavt-services-section/constitute-entity";
import { appendEavtRow } from "@red-cup-engineering/eavt-services-section/append-eavt-row";
import { readEavtEntries } from "@red-cup-engineering/eavt-services-section/read-eavt-entries";
import { ADMITTED_HARNESS_ACTORS, assertHarnessLifecycleEvent, lifecycleEventsAt, SKILL_SELECTED_CATEGORY, PROVIDER_COMMISSIONED_CATEGORY } from "../src/harness-lifecycle.mjs";
import * as lagoonWorld from "@red-cup-engineering/flatfile-resource-graph-service/lagoon-world";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(__dirname);

// The world trace lives at computer-deployment-engine — the one seat licensed to hold it, not
// this script's own (now HARN) directory, and not LAGOON's former apps/lagoon (dissolved).
const DEPLOYMENT_ENGINE_APP_PATH =
  "lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-operating-system-services-section/apps/computer-deployment-engine";
// The path look.scm reads (data/state/world-state/world.eavt); null when run from an installed package with no tree.
const DEFAULT_TRACE_PATH = repoRoot === null ? null : path.join(repoRoot, DEPLOYMENT_ENGINE_APP_PATH, "data/state/world-state/world.eavt");
const HARNESS_SECTIONS_PREFIX =
  "lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-computer-services-section/services/computer-machine-services-section/services/persistent-computer-machine-services-section/services/bare-cedar-fog-services-section/services/bare-cedar-fog-inference-services-section/services";

/**
 * The journal roots this fold reads by default: each harness section's own directory.
 *
 * @type {string[]}
 */
export const DEFAULT_JOURNAL_ROOTS = repoRoot === null ? [] : [
  path.join(repoRoot, HARNESS_SECTIONS_PREFIX, "bare-cedar-fog-claude-services-section"),
  path.join(repoRoot, HARNESS_SECTIONS_PREFIX, "bare-cedar-fog-codex-services-section"),
];

const CATEGORIES = new Set([SKILL_SELECTED_CATEGORY, PROVIDER_COMMISSIONED_CATEGORY]);

/**
 * Reads every skill-selected/provider-commissioned event out of a set of journal roots, admitted
 * only when its own `type` names the shared package's event namespace
 * (`bare-cedar-fog.harness/<category>`), it passes assertHarnessLifecycleEvent, and its actor is
 * one of ADMITTED_HARNESS_ACTORS — actor admission is application-layer only (the schema's own
 * `actor` field is a plain nonempty string, never an enum), so a pre-migration event still
 * carrying a superseded `urn:ame:*` actor identity is structurally valid but not itself an
 * admitted duty; a root's feed can also carry other writers' rows sharing these same category
 * names (a real, pre-existing cross-custody collision on at least one harness section's own
 * journal). Neither case is coerced or thrown on — both are simply out of this fold's scope.
 *
 * @param {string[]} roots Journal roots (see DEFAULT_JOURNAL_ROOTS).
 * @returns {Array<{id: string, category: string, recordedAt: string, record: object}>} Events, in
 *   recordedAt order (ties broken by content id, for a stable fold order).
 */
export function readLifecycleEvents(roots) {
  const events = [];
  for (const root of roots) {
    // The writers record lifecycle events as `harness-lifecycle` records of the store; the owner reads them once each.
    for (const { id, category, recordedAt, record } of lifecycleEventsAt(root, [...CATEGORIES])) {
      if (!record || record.type !== `bare-cedar-fog.harness/${category}`) continue;
      if (!ADMITTED_HARNESS_ACTORS.includes(record.actor)) continue;
      try {
        assertHarnessLifecycleEvent(record);
      } catch {
        continue;
      }
      if (typeof id !== "string") continue;
      events.push({ id, category, recordedAt, record });
    }
  }
  events.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id));
  return events;
}

/**
 * The smallest honest attribute mapping off one lifecycle event's own fields: its category as
 * "activity", and whichever of name/turn/task the event itself carries.
 *
 * @param {{category: string, record: object}} event One event from readLifecycleEvents.
 * @returns {object} A constituteEntity-ready attributes object.
 */
export function dutyAttributes({ category, record }) {
  const { name, turn, task } = record;
  return { activity: category, name, turn, ...(task === undefined ? {} : { task }) };
}

// existingGenesisAddresses mirrors the sibling seeders' own local dedupe helper exactly.
function existingGenesisAddresses(rows) {
  const addresses = new Set();
  for (const row of rows) if (row.a === "constituted") addresses.add(row.e);
  return addresses;
}

/**
 * Folds every lifecycle event from `roots` into `tracePath` as a duty entity reported-by its
 * actor and reported-at that actor's office: idempotent (each event's duty address is
 * content-derived from its own fields, so a re-fold appends nothing already present).
 *
 * @param {string[]} roots Journal roots (see DEFAULT_JOURNAL_ROOTS).
 * @param {string} tracePath Path to the on-disk EAVT trace to fold into (created if missing).
 * @returns {Array<{kind: string, skipped: boolean, detail: string}>} One entry per event considered.
 * @throws {Error} When an event's actor occupies no constituted office (run seed-offices.mjs first).
 */
export function fold(roots, tracePath) {
  mkdirSync(path.dirname(tracePath), { recursive: true });
  let rows = existsSync(tracePath) ? readEavtEntries({ path: tracePath }) : [];
  const already = existingGenesisAddresses(rows);
  const results = [];

  for (const event of readLifecycleEvents(roots)) {
    const t = Date.parse(event.recordedAt);
    if (Number.isNaN(t)) throw new TypeError(`fold-harness-lifecycle: event ${event.id} has an unparseable recordedAt: ${JSON.stringify(event.recordedAt)}`);

    const { address, genesis: genesisRow } = constitute({ kind: "duty", attributes: dutyAttributes(event), t });
    if (already.has(address)) {
      results.push({ kind: event.category, skipped: true, detail: address });
      continue;
    }

    const actorAddress = event.record.actor;
    const officeAddress = lagoonWorld.findWorldAddressByAttribute(rows, "occupant", actorAddress);
    if (officeAddress === undefined) {
      throw new Error(`fold-harness-lifecycle: no office occupied by ${actorAddress} on disk at ${tracePath} — run seed-offices.mjs first`);
    }

    const reportedBy = { e: address, a: "reported-by", v: actorAddress, t };
    const reportedAt = { e: address, a: "reported-at", v: officeAddress, t };
    appendEavtRow({ path: tracePath, row: genesisRow });
    appendEavtRow({ path: tracePath, row: reportedBy });
    appendEavtRow({ path: tracePath, row: reportedAt });
    rows = [...rows, genesisRow, reportedBy, reportedAt];
    already.add(address);
    results.push({ kind: event.category, skipped: false, detail: address });
  }

  return results;
}

// Only run when invoked directly (so tests can import readLifecycleEvents/fold without side effects).
if (import.meta.url === `file://${process.argv[1]}`) {
  const tracePath = process.argv[2] || process.env.LAGOON_WORLD_TRACE_PATH || DEFAULT_TRACE_PATH;
  if (!tracePath) { console.error("fold-harness-lifecycle: no tree found; give a trace path or set LAGOON_WORLD_TRACE_PATH"); process.exit(2); }
  const results = fold(DEFAULT_JOURNAL_ROOTS, tracePath);
  for (const { kind, skipped, detail } of results) {
    console.log(`${skipped ? "skip (already folded)" : "appended"}: ${kind} ${detail}`);
  }
}
