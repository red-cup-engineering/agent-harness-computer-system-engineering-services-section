// fold-harness-turns.test — exercises scripts/fold-harness-turns.mjs against a synthetic journal
// root (raw hand-appended rows, shaped exactly like observe-claude-lifecycle.mjs's own output)
// and a synthetic trace/office-seeds (never the real data/state/world.eavt or real actor carriers).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { constitute } from "@red-cup-engineering/eavt-services-section/constitute-entity";
import { appendEavtRow } from "@red-cup-engineering/eavt-services-section/append-eavt-row";
import { readEavtEntries } from "@red-cup-engineering/eavt-services-section/read-eavt-entries";
import { relations } from "@red-cup-engineering/eavt-services-section/select-relations";
import { put } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { ADMITTED_HARNESS_ACTORS } from "../src/harness-lifecycle.mjs";
import { findWorldAddressByName } from "@red-cup-engineering/flatfile-resource-graph-service/lagoon-world";
import { HARNESS_TURN_TYPE, readTurnEvents, fold } from "../scripts/fold-harness-turns.mjs";

const ADMITTED_ACTOR = ADMITTED_HARNESS_ACTORS[0];

function withDir(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "lagoon-fold-harness-turns-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function appendRawRow(root, row) {
  put(root, HARNESS_TURN_TYPE, { category: row.a, at: row.t, observation: row.v });
}

function observationRow({ category, event, t, sessionDigest, promptDigest, actor = ADMITTED_ACTOR }) {
  return {
    a: category,
    e: `ni:///sha-256;${category}-${t}`,
    t,
    v: {
      type: "BareCedarFogClaudeLifecycleObservation",
      version: 2,
      actor,
      event,
      occurredAt: t,
      sessionDigest,
      workspaceDigest: "sha256:workspace",
      ...(promptDigest !== undefined ? { promptDigest } : {}),
    },
  };
}

function writeGenesis(dir, name, attributes) {
  const { address, genesis: genesisRow } = constitute({ kind: "actor", attributes, t: "2026-08-31T00:00:00Z" });
  writeFileSync(path.join(dir, name), JSON.stringify({ address, genesisRow }));
  return { address, genesisRow };
}

// A minimal officeSeeds override for fold(): one office occupied by ADMITTED_ACTOR, no
// instruments — enough to satisfy seed-offices' own seed() without touching real repo carriers.
function syntheticOfficeSeeds(dir) {
  const { address, genesisRow } = writeGenesis(dir, "genesis.json", { harness: "test" });
  return [{ harness: "test", officeName: "claude-chief-of-staff-office", actorAddress: address, actorGenesisRow: genesisRow, role: "test-role", instruments: [] }];
}

function seedMachine(tracePath) {
  const machine = constitute({ kind: "machine", attributes: { name: "bare-cedar-fog" }, t: 1 });
  appendEavtRow({ path: tracePath, row: machine.genesis });
  return machine;
}

test("readTurnEvents admits real UserPromptSubmit/Stop observations and excludes SessionStart", () => {
  withDir((root) => {
    appendRawRow(root, observationRow({ category: "lifecycle.SessionStart", event: "SessionStart", t: "2026-09-02T00:00:00.000Z", sessionDigest: "sha256:s1" }));
    appendRawRow(root, observationRow({ category: "lifecycle.UserPromptSubmit", event: "UserPromptSubmit", t: "2026-09-02T00:00:01.000Z", sessionDigest: "sha256:s1", promptDigest: "sha256:p1" }));
    appendRawRow(root, observationRow({ category: "lifecycle.Stop", event: "Stop", t: "2026-09-02T00:00:02.000Z", sessionDigest: "sha256:s1" }));

    const events = readTurnEvents([root]);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.record.event), ["UserPromptSubmit", "Stop"]);
  });
});

test("readTurnEvents excludes an unadmitted actor and a UserPromptSubmit missing promptDigest", () => {
  withDir((root) => {
    appendRawRow(root, observationRow({ category: "lifecycle.UserPromptSubmit", event: "UserPromptSubmit", t: "2026-09-02T00:00:00.000Z", sessionDigest: "sha256:s1", promptDigest: "sha256:p1", actor: "urn:ame:legacy" }));
    appendRawRow(root, observationRow({ category: "lifecycle.UserPromptSubmit", event: "UserPromptSubmit", t: "2026-09-02T00:00:01.000Z", sessionDigest: "sha256:s2" }));
    assert.equal(readTurnEvents([root]).length, 0);
  });
});

test("fold turns a UserPromptSubmit into an utterance spoken-at the place, turn-of its session", () => {
  withDir((root) => {
    appendRawRow(root, observationRow({ category: "lifecycle.UserPromptSubmit", event: "UserPromptSubmit", t: "2026-09-02T00:00:01.000Z", sessionDigest: "sha256:s1", promptDigest: "sha256:p1" }));

    withDir((dir) => {
      const tracePath = path.join(dir, "world.eavt");
      seedMachine(tracePath);
      const officeSeeds = syntheticOfficeSeeds(dir);

      const results = fold([root], tracePath, { officeSeeds });
      const turnResult = results.find((r) => r.kind === "turn");
      assert.equal(turnResult.skipped, false);

      const rows = readEavtEntries({ path: tracePath });
      const placeAddress = findWorldAddressByName(rows, "bare-cedar-fog");
      const [utteranceAddress] = relations({ rows, attribute: "spoken-at", value: placeAddress }).map((row) => row.e);
      assert.ok(utteranceAddress?.startsWith("utterance:"), "the utterance is spoken-at bare-cedar-fog");
      assert.equal(rows.find((r) => r.e === utteranceAddress && r.a === "constituted").v.text, "sha256:p1");

      assert.ok(rows.some((r) => r.e === utteranceAddress && r.a === "spoken-by" && r.v === ADMITTED_ACTOR));
      assert.ok(rows.some((r) => r.e === utteranceAddress && r.a === "turn-of" && r.v.startsWith("session:")));
      assert.ok(rows.some((r) => r.e === utteranceAddress && r.a === "occurred-at" && r.v === "2026-09-02T00:00:01.000Z"));
    });
  });
});

test("fold appends a closed-at row against the session on a Stop event", () => {
  withDir((root) => {
    appendRawRow(root, observationRow({ category: "lifecycle.UserPromptSubmit", event: "UserPromptSubmit", t: "2026-09-02T00:00:01.000Z", sessionDigest: "sha256:s1", promptDigest: "sha256:p1" }));
    appendRawRow(root, observationRow({ category: "lifecycle.Stop", event: "Stop", t: "2026-09-02T00:00:02.000Z", sessionDigest: "sha256:s1" }));

    withDir((dir) => {
      const tracePath = path.join(dir, "world.eavt");
      seedMachine(tracePath);
      const officeSeeds = syntheticOfficeSeeds(dir);

      fold([root], tracePath, { officeSeeds });
      const rows = readEavtEntries({ path: tracePath });
      const sessionAddress = rows.find((r) => r.a === "turn-of")?.v;
      assert.ok(sessionAddress?.startsWith("session:"));
      assert.ok(rows.some((r) => r.e === sessionAddress && r.a === "closed-at" && r.v === "2026-09-02T00:00:02.000Z"));
    });
  });
});

test("fold is idempotent: re-folding the same events appends nothing new", () => {
  withDir((root) => {
    appendRawRow(root, observationRow({ category: "lifecycle.UserPromptSubmit", event: "UserPromptSubmit", t: "2026-09-02T00:00:01.000Z", sessionDigest: "sha256:s1", promptDigest: "sha256:p1" }));
    appendRawRow(root, observationRow({ category: "lifecycle.Stop", event: "Stop", t: "2026-09-02T00:00:02.000Z", sessionDigest: "sha256:s1" }));

    withDir((dir) => {
      const tracePath = path.join(dir, "world.eavt");
      seedMachine(tracePath);
      const officeSeeds = syntheticOfficeSeeds(dir);

      fold([root], tracePath, { officeSeeds });
      const before = readEavtEntries({ path: tracePath }).length;

      const second = fold([root], tracePath, { officeSeeds });
      assert.ok(second.every((r) => r.skipped === true));
      assert.equal(readEavtEntries({ path: tracePath }).length, before);
    });
  });
});
