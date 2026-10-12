// seed-offices — constitutes one office per harness actor (Claude, Codex) located-in
// bare-cedar-fog, moves the actor there, and constitutes one workbench per instrument the actor
// actually wields — straight from actor-genesis.json plus each harness's own "mcpServers" carrier
// (.mcp.json / the Codex agent-harness JSON). Idempotent like seed-world.mjs: content-addressed,
// deterministic t, read-back dedupe before every append.
// Run: node scripts/seed-offices.mjs [tracePath] (defaults below; overridable by argv/env).

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { constitute } from "@red-cup-engineering/eavt-services-section/constitute-entity";
import { appendEavtRow } from "@red-cup-engineering/eavt-services-section/append-eavt-row";
import { readEavtEntries } from "@red-cup-engineering/eavt-services-section/read-eavt-entries";
import * as lagoonWorld from "@red-cup-engineering/flatfile-resource-graph-service/lagoon-world";

// findRepoRoot, folded local to this script — see fold-harness-lifecycle.mjs's own copy for why.
function findRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("seed-offices: could not find repo root (no .git above " + startDir + ")");
    dir = parent;
  }
}

// The verification direction of constitute()'s own <kind>:<digest> address law (eavt's own
// monolith carried this as entityAddress before its decomposition into single-function
// subpaths; see eavt's scripts/eavt-verbs.mjs for the fuller note): split the address on its
// first ":" to recover kind, then recompute the same address from the genesis row's own a/v/t.
function entityAddress(genesisRow) {
  const kind = genesisRow.e.slice(0, genesisRow.e.indexOf(":"));
  return constitute({ kind, attributes: genesisRow.v, t: genesisRow.t }).address;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(__dirname);

// The world trace lives at computer-deployment-engine — the one seat licensed to hold it, not
// this script's own (now HARN) directory, and not LAGOON's former apps/lagoon (dissolved).
const DEPLOYMENT_ENGINE_APP_PATH =
  "lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-operating-system-services-section/apps/computer-deployment-engine";
const DEFAULT_TRACE_PATH = path.join(repoRoot, DEPLOYMENT_ENGINE_APP_PATH, "data/state/world.eavt");
const DEFAULT_MACHINE_NAME = "bare-cedar-fog";

// The office-founding's own fixed witness time (2026-09-01: the founder's "an office as a place
// you go to, with a workbench" MUD reframe) — deterministic across every run, exactly like
// seed-world.mjs's own record-derived baseT.
const DEFAULT_MEASURED_AT = "2026-09-01T00:00:00Z";

const CLAUDE_GENESIS_PATH = path.join(
  repoRoot,
  "lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-computer-services-section/services/computer-machine-services-section/services/persistent-computer-machine-services-section/services/bare-cedar-fog-services-section/services/bare-cedar-fog-inference-services-section/services/bare-cedar-fog-claude-services-section/content/harness/actor-genesis.json",
);
const CODEX_GENESIS_PATH = path.join(
  repoRoot,
  "lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-computer-services-section/services/computer-machine-services-section/services/persistent-computer-machine-services-section/services/bare-cedar-fog-services-section/services/bare-cedar-fog-inference-services-section/services/bare-cedar-fog-codex-services-section/agents/harness/actor-genesis.json",
);
const CLAUDE_MCP_CONFIG_PATH = path.join(repoRoot, ".mcp.json");
const CODEX_AGENT_HARNESS_PATH = path.join(
  repoRoot,
  "lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-computer-services-section/services/computer-machine-services-section/services/persistent-computer-machine-services-section/services/bare-cedar-fog-services-section/services/bare-cedar-fog-inference-services-section/services/bare-cedar-fog-codex-services-section/agents/harness/codex-agent-harness.json",
);

/**
 * The two harness offices this seeder constitutes, straight from each harness's own committed
 * carriers. Exported so tests (and any future third harness) can point it at synthetic carriers.
 *
 * @type {Array<{harness: string, officeName: string, genesisPath: string, mcpServersPath: string}>}
 */
export const DEFAULT_HARNESS_SOURCES = [
  { harness: "claude", officeName: "claude-chief-of-staff-office", genesisPath: CLAUDE_GENESIS_PATH, mcpServersPath: CLAUDE_MCP_CONFIG_PATH },
  { harness: "codex", officeName: "codex-chief-of-staff-office", genesisPath: CODEX_GENESIS_PATH, mcpServersPath: CODEX_AGENT_HARNESS_PATH },
];

/**
 * Reads one harness actor's already-minted genesis carrier and verifies it: the genesis row's own
 * derived address (per eavt's entityAddress law) must reproduce the file's recorded `address` —
 * this seeder trusts nothing it cannot re-derive.
 *
 * @param {string} p Path to an actor-genesis.json carrier.
 * @returns {{address: string, genesisRow: object}} The verified identity to constitute (or confirm
 *   already constituted) in the world trace.
 * @throws {TypeError} When the carrier's recorded address does not match its own genesis row.
 */
export function readActorGenesis(p) {
  const { address, genesisRow } = JSON.parse(readFileSync(p, "utf8"));
  const recomputed = entityAddress(genesisRow);
  if (recomputed !== address) {
    throw new TypeError(`seed-offices: ${p} recorded address ${JSON.stringify(address)} does not match its own genesis row (recomputed ${JSON.stringify(recomputed)})`);
  }
  return { address, genesisRow };
}

/**
 * Reads one harness's own instrument-wiring carrier (.mcp.json for Claude, the Codex
 * agent-harness JSON for Codex — both carry a top-level "mcpServers" table keyed by server name)
 * and lists the instruments actually wielded: every entry whose own "enabled" field is not exactly
 * `false` (.mcp.json carries no such field at all, so every Claude entry passes).
 *
 * @param {string} p Path to a carrier with a top-level "mcpServers" object.
 * @returns {string[]} Instrument names, in the carrier's own key order.
 * @throws {TypeError} When the carrier has no "mcpServers" object.
 */
export function readWieldedInstruments(p) {
  const config = JSON.parse(readFileSync(p, "utf8"));
  const servers = config.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new TypeError(`seed-offices: ${p} has no "mcpServers" object`);
  }
  return Object.entries(servers)
    .filter(([, serverConfig]) => serverConfig?.enabled !== false)
    .map(([name]) => name);
}

/**
 * Derives the full office-seeding plan from every harness source's own carriers — no invented
 * facts, only what the genesis and instrument carriers already say.
 *
 * @param {Array<{harness: string, officeName: string, genesisPath: string, mcpServersPath: string}>} [sources]
 * @returns {Array<{harness: string, officeName: string, actorAddress: string,
 *   actorGenesisRow: object, role: *, instruments: string[]}>}
 */
export function deriveOfficeSeeds(sources = DEFAULT_HARNESS_SOURCES) {
  return sources.map(({ harness, officeName, genesisPath, mcpServersPath }) => {
    const { address, genesisRow } = readActorGenesis(genesisPath);
    return {
      harness,
      officeName,
      actorAddress: address,
      actorGenesisRow: genesisRow,
      role: genesisRow.v?.office,
      instruments: readWieldedInstruments(mcpServersPath),
    };
  });
}

// existingGenesisAddresses/hasRow mirror seed-world.mjs / seed-systemd-services.mjs's own local
// dedupe helpers exactly — no shared abstraction invented for two three-line predicates.
function existingGenesisAddresses(rows) {
  const addresses = new Set();
  for (const row of rows) if (row.a === "constituted") addresses.add(row.e);
  return addresses;
}
function hasRow(rows, e, a, v) {
  return rows.some((r) => r.e === e && r.a === a && r.v === v);
}

/**
 * Seeds every harness office, its actor, and its wielded-instrument workbenches into an on-disk
 * EAVT trace: idempotent, since every append is preceded by a read-back dedupe check, and every
 * derived address is a deterministic content-address (same seeds + same trace state => same
 * addresses => nothing new to append on a re-run).
 *
 * @param {Array<{harness: string, officeName: string, actorAddress: string, actorGenesisRow:
 *   object, role: *, instruments: string[]}>} seeds From deriveOfficeSeeds.
 * @param {string} tracePath Path to the on-disk EAVT trace to seed (created if missing).
 * @param {{measuredAt?: string, machineName?: string}} [opts]
 * @returns {Array<{kind: string, skipped: boolean, detail: string}>} One entry per row considered.
 * @throws {TypeError} When measuredAt does not parse.
 * @throws {Error} When machineName has no constituted entity on disk yet (run seed-world.mjs first).
 */
export function seed(seeds, tracePath, { measuredAt = DEFAULT_MEASURED_AT, machineName = DEFAULT_MACHINE_NAME } = {}) {
  mkdirSync(path.dirname(tracePath), { recursive: true });

  const baseT = Date.parse(measuredAt);
  if (Number.isNaN(baseT)) {
    throw new TypeError(`seed-offices: measuredAt is not a parseable date: ${JSON.stringify(measuredAt)}`);
  }

  let rows = existsSync(tracePath) ? readEavtEntries({ path: tracePath }) : [];
  const machineAddress = lagoonWorld.findWorldAddressByName(rows, machineName);
  if (machineAddress === undefined) {
    throw new Error(`seed-offices: no constituted machine named ${JSON.stringify(machineName)} on disk at ${tracePath} — run seed-world.mjs first`);
  }

  const already = existingGenesisAddresses(rows);
  let tCounter = 0;
  const nextT = () => baseT + tCounter++;
  const results = [];

  const appendRow = (row, kind, detail) => {
    if (hasRow(rows, row.e, row.a, row.v)) {
      results.push({ kind, skipped: true, detail });
      return;
    }
    appendEavtRow({ path: tracePath, row });
    rows = [...rows, row];
    results.push({ kind, skipped: false, detail });
  };

  const constituteIfNew = (address, genesisRow, kind, detail) => {
    if (already.has(address)) {
      results.push({ kind, skipped: true, detail });
      return;
    }
    appendEavtRow({ path: tracePath, row: genesisRow });
    rows = [...rows, genesisRow];
    already.add(address);
    results.push({ kind, skipped: false, detail });
  };

  for (const seedEntry of seeds) {
    const { harness, officeName, actorAddress, actorGenesisRow, role, instruments } = seedEntry;

    // 1. the actor itself: already minted (actor-genesis.json), only ever missing on a fresh trace.
    constituteIfNew(actorAddress, actorGenesisRow, "actor", harness);

    // 2. the office: a place, located-in the machine.
    const { address: officeAddress, genesis: officeGenesisRow } = constitute({
      kind: "office",
      attributes: { name: officeName, occupant: actorAddress, role },
      t: nextT(),
    });
    constituteIfNew(officeAddress, officeGenesisRow, "office", officeName);
    appendRow({ e: officeAddress, a: "located-in", v: machineAddress, t: nextT() }, "located-in", `${officeName} -> ${machineName}`);

    // 3. the actor moves into its office.
    appendRow({ e: actorAddress, a: "located-in", v: officeAddress, t: nextT() }, "located-in", `${harness} -> ${officeName}`);

    // 4. one workbench per real instrument this harness actually wields.
    for (const instrument of instruments) {
      const { address: workbenchAddress, genesis: workbenchGenesisRow } = constitute({
        kind: "workbench",
        attributes: { name: instrument },
        t: nextT(),
      });
      constituteIfNew(workbenchAddress, workbenchGenesisRow, "workbench", instrument);
      appendRow({ e: workbenchAddress, a: "located-in", v: officeAddress, t: nextT() }, "located-in", `${instrument} -> ${officeName}`);
    }
  }

  return results;
}

// Only run when invoked directly (so tests can import deriveOfficeSeeds/seed without side effects).
if (import.meta.url === `file://${process.argv[1]}`) {
  const tracePath = process.argv[2] || process.env.LAGOON_WORLD_TRACE_PATH || DEFAULT_TRACE_PATH;
  const results = seed(deriveOfficeSeeds(), tracePath);
  for (const { kind, skipped, detail } of results) {
    console.log(`${skipped ? "skip (already present)" : "appended"}: ${kind} ${detail}`);
  }
}
