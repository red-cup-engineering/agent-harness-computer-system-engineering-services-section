// seed-offices.test — exercises scripts/seed-offices.mjs against synthetic genesis/mcp carriers
// and a synthetic trace written to a tmp file (never the real data/state/world.eavt).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { constitute } from "@red-cup-engineering/eavt-services-section/constitute-entity";
import { appendEavtRow } from "@red-cup-engineering/eavt-services-section/append-eavt-row";
import { readEavtEntries } from "@red-cup-engineering/eavt-services-section/read-eavt-entries";
import { lookWorld } from "@red-cup-engineering/flatfile-resource-graph-service/lagoon-world";
import { deriveOfficeSeeds, readActorGenesis, readWieldedInstruments, seed } from "../scripts/seed-offices.mjs";

// entityAddress, mirroring seed-offices.mjs's own local helper exactly (see its own comment for
// why: eavt's monolith carried this as entityAddress before its decomposition into single-function
// subpaths, and no subpath revives it — a re-derivation check like this one is this test's own,
// not a capability eavt itself still owns).
function entityAddress(genesisRow) {
  const kind = genesisRow.e.slice(0, genesisRow.e.indexOf(":"));
  return constitute({ kind, attributes: genesisRow.v, t: genesisRow.t }).address;
}

function withDir(fn) {
  const dir = mkdtempSync(path.join(scratchRoot(), "lagoon-seed-offices-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeGenesis(dir, name, attributes) {
  const { address, genesis: genesisRow } = constitute({ kind: "actor", attributes, t: "2026-08-31T00:00:00Z" });
  const p = path.join(dir, name);
  writeFileSync(p, JSON.stringify({ address, genesisRow }));
  return { path: p, address, genesisRow };
}

test("readActorGenesis verifies and returns the recorded identity", () => {
  withDir((dir) => {
    const { path: genesisPath, address } = writeGenesis(dir, "genesis.json", { harness: "test" });
    const result = readActorGenesis(genesisPath);
    assert.equal(result.address, address);
  });
});

test("readActorGenesis throws when the recorded address does not match its own genesis row", () => {
  withDir((dir) => {
    const { path: genesisPath } = writeGenesis(dir, "genesis.json", { harness: "test" });
    writeFileSync(genesisPath, JSON.stringify({ address: "actor:tampered", genesisRow: { e: "actor:tampered", a: "constituted", v: { harness: "test" }, t: "2026-08-31T00:00:00Z" } }));
    assert.throws(() => readActorGenesis(genesisPath), TypeError);
  });
});

test("readWieldedInstruments keeps entries not explicitly disabled, in key order", () => {
  withDir((dir) => {
    const p = path.join(dir, "mcp.json");
    writeFileSync(p, JSON.stringify({ mcpServers: { alpha: {}, beta: { enabled: true }, gamma: { enabled: false } } }));
    assert.deepEqual(readWieldedInstruments(p), ["alpha", "beta"]);
  });
});

test("readWieldedInstruments throws when the carrier has no mcpServers object", () => {
  withDir((dir) => {
    const p = path.join(dir, "mcp.json");
    writeFileSync(p, JSON.stringify({}));
    assert.throws(() => readWieldedInstruments(p), TypeError);
  });
});

test("deriveOfficeSeeds composes genesis identity and wielded instruments per source", () => {
  withDir((dir) => {
    const { path: genesisPath, address } = writeGenesis(dir, "genesis.json", { office: "test-role" });
    const mcpPath = path.join(dir, "mcp.json");
    writeFileSync(mcpPath, JSON.stringify({ mcpServers: { "tool-one": {} } }));

    const [seedEntry] = deriveOfficeSeeds([{ harness: "test", officeName: "test-office", genesisPath, mcpServersPath: mcpPath }]);
    assert.equal(seedEntry.actorAddress, address);
    assert.equal(seedEntry.role, "test-role");
    assert.deepEqual(seedEntry.instruments, ["tool-one"]);
  });
});

function seedMachine(tracePath) {
  const machine = constitute({ kind: "machine", attributes: { name: "bare-cedar-fog" }, t: 1 });
  appendEavtRow({ path: tracePath, row: machine.genesis });
  return machine;
}

test("seed throws when bare-cedar-fog has never been constituted", () => {
  withDir((dir) => {
    const tracePath = path.join(dir, "world.eavt");
    assert.throws(() => seed([], tracePath), Error);
  });
});

test("seed constitutes the actor, its office, and one workbench per instrument, located-in correctly", () => {
  withDir((dir) => {
    const { address: actorAddress, genesisRow: actorGenesisRow } = writeGenesis(dir, "genesis.json", { office: "test-role" });
    const seeds = [{ harness: "test", officeName: "test-office", actorAddress, actorGenesisRow, role: "test-role", instruments: ["tool-one", "tool-two"] }];

    const tracePath = path.join(dir, "world.eavt");
    seedMachine(tracePath);
    const results = seed(seeds, tracePath);

    assert.ok(results.every((r) => r.skipped === false), "every row is new on a first run");

    const found = lookWorld(tracePath, "test-office");
    assert.equal(found.placeAttributes.occupant, actorAddress);
    assert.equal(found.placeAttributes.role, "test-role");
    assert.equal(found.things.length, 3, "the actor plus two workbenches");
    assert.ok(found.things.some((t) => t.address === actorAddress));
    assert.deepEqual(
      found.things.filter((t) => t.address !== actorAddress).map((t) => t.attributes.name).sort(),
      ["tool-one", "tool-two"],
    );
  });
});

test("seed is idempotent: re-running against the same seeds and trace appends nothing new", () => {
  withDir((dir) => {
    const { address: actorAddress, genesisRow: actorGenesisRow } = writeGenesis(dir, "genesis.json", { office: "test-role" });
    const seeds = [{ harness: "test", officeName: "test-office", actorAddress, actorGenesisRow, role: "test-role", instruments: ["tool-one"] }];

    const tracePath = path.join(dir, "world.eavt");
    seedMachine(tracePath);
    seed(seeds, tracePath);
    const before = readEavtEntries({ path: tracePath }).length;

    const second = seed(seeds, tracePath);
    assert.ok(second.every((r) => r.skipped === true), "every row is already present on a re-run");
    assert.equal(readEavtEntries({ path: tracePath }).length, before, "no new rows appended");
  });
});

test("seed keeps entityAddress-verifiable genesis rows for both actor and office", () => {
  withDir((dir) => {
    const { address: actorAddress, genesisRow: actorGenesisRow } = writeGenesis(dir, "genesis.json", { office: "test-role" });
    const seeds = [{ harness: "test", officeName: "test-office", actorAddress, actorGenesisRow, role: "test-role", instruments: [] }];

    const tracePath = path.join(dir, "world.eavt");
    seedMachine(tracePath);
    seed(seeds, tracePath);

    const rows = readEavtEntries({ path: tracePath });
    const genesisRows = rows.filter((r) => r.a === "constituted");
    for (const row of genesisRows) assert.equal(entityAddress(row), row.e, `genesis row ${row.e} re-derives its own address`);
  });
});
