// fold-harness-lifecycle.test — exercises scripts/fold-harness-lifecycle.mjs against a synthetic
// journal root (written through the real recordSkillSelection/recordProviderCommission writers,
// plus hand-appended legacy/malformed rows) and a synthetic trace (never real production carriers).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { constitute } from "@red-cup-engineering/eavt-services-section/constitute-entity";
import { appendEavtRow } from "@red-cup-engineering/eavt-services-section/append-eavt-row";
import { readEavtEntries } from "@red-cup-engineering/eavt-services-section/read-eavt-entries";
import { put } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { HARNESS_LIFECYCLE_TYPE, recordSkillSelection, recordProviderCommission, ADMITTED_HARNESS_ACTORS } from "../src/harness-lifecycle.mjs";
import { lookWorld } from "@red-cup-engineering/flatfile-resource-graph-service/lagoon-world";
import { readLifecycleEvents, dutyAttributes, fold } from "../scripts/fold-harness-lifecycle.mjs";

const ADMITTED_ACTOR = ADMITTED_HARNESS_ACTORS[0];

function withDir(fn) {
  const dir = mkdtempSync(path.join(scratchRoot(), "lagoon-fold-harness-lifecycle-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A hand-put lifecycle record, bypassing the real writer — for exercising records this
// fold must NOT admit (a differently-typed event, an unadmitted actor).
function appendRawRow(root, row) {
  put(root, HARNESS_LIFECYCLE_TYPE, { category: row.a, at: row.t, event: row.v });
}

test("readLifecycleEvents admits real skill-selected and provider-commissioned events", () => {
  withDir((root) => {
    recordSkillSelection({ root, actor: ADMITTED_ACTOR, turnId: "turn-1", skill: "test-skill", recordedAt: "2026-08-31T00:00:00.000Z" });
    recordProviderCommission({ root, actor: ADMITTED_ACTOR, turnId: "turn-1", agent: "test-agent", task: "test task", recordedAt: "2026-08-31T00:00:01.000Z" });

    const events = readLifecycleEvents([root]);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => e.category).sort(), ["provider-commissioned", "skill-selected"]);
    assert.ok(events.every((e) => e.record.actor === ADMITTED_ACTOR));
  });
});

test("readLifecycleEvents excludes a legacy differently-typed row sharing the same category name", () => {
  withDir((root) => {
    appendRawRow(root, {
      a: "skill-selected",
      e: "ni:///sha-256;legacy-row",
      t: "2026-08-31T00:00:00.000Z",
      v: { type: "bare-cedar-fog.codex-harness/skill-selected", version: 1, actor: ADMITTED_ACTOR, turn: "turn-1", name: "legacy-skill" },
    });
    assert.equal(readLifecycleEvents([root]).length, 0);
  });
});

test("readLifecycleEvents excludes an event whose actor is not admitted (e.g. a superseded urn:ame identity)", () => {
  withDir((root) => {
    appendRawRow(root, {
      a: "skill-selected",
      e: "ni:///sha-256;unadmitted-actor-row",
      t: "2026-08-31T00:00:00.000Z",
      v: { type: "bare-cedar-fog.harness/skill-selected", version: 1, actor: "urn:ame:bare-cedar-fog-codex", turn: "turn-1", name: "old-skill" },
    });
    assert.equal(readLifecycleEvents([root]).length, 0);
  });
});

test("readLifecycleEvents excludes a structurally malformed row (missing a required field)", () => {
  withDir((root) => {
    appendRawRow(root, {
      a: "skill-selected",
      e: "ni:///sha-256;malformed-row",
      t: "2026-08-31T00:00:00.000Z",
      v: { type: "bare-cedar-fog.harness/skill-selected", version: 1, actor: ADMITTED_ACTOR, turn: "turn-1" }, // missing "name"
    });
    assert.equal(readLifecycleEvents([root]).length, 0);
  });
});

test("dutyAttributes maps an event's own fields, omitting task when absent", () => {
  const skillEvent = { category: "skill-selected", record: { actor: ADMITTED_ACTOR, turn: "turn-1", name: "test-skill" } };
  assert.deepEqual(dutyAttributes(skillEvent), { activity: "skill-selected", name: "test-skill", turn: "turn-1" });

  const providerEvent = { category: "provider-commissioned", record: { actor: ADMITTED_ACTOR, turn: "turn-1", name: "test-agent", task: "do the thing" } };
  assert.deepEqual(dutyAttributes(providerEvent), { activity: "provider-commissioned", name: "test-agent", turn: "turn-1", task: "do the thing" });
});

function seedMachineAndOffice(tracePath) {
  const machine = constitute({ kind: "machine", attributes: { name: "bare-cedar-fog" }, t: 1 });
  const office = constitute({ kind: "office", attributes: { name: "test-office", occupant: ADMITTED_ACTOR }, t: 2 });
  appendEavtRow({ path: tracePath, row: machine.genesis });
  appendEavtRow({ path: tracePath, row: office.genesis });
  appendEavtRow({ path: tracePath, row: { e: office.address, a: "located-in", v: machine.address, t: 2 } });
  return { machine, office };
}

test("fold throws when the event's actor occupies no constituted office", () => {
  withDir((root) => {
    recordSkillSelection({ root, actor: ADMITTED_ACTOR, turnId: "turn-1", skill: "test-skill", recordedAt: "2026-08-31T00:00:00.000Z" });
    const dir = mkdtempSync(path.join(scratchRoot(), "lagoon-fold-trace-"));
    const tracePath = path.join(dir, "world.eavt");
    try {
      assert.throws(() => fold([root], tracePath), Error);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("fold appends a duty entity reported-by its actor and reported-at its office", () => {
  withDir((root) => {
    recordSkillSelection({ root, actor: ADMITTED_ACTOR, turnId: "turn-1", skill: "test-skill", recordedAt: "2026-08-31T00:00:00.000Z" });

    const dir = mkdtempSync(path.join(scratchRoot(), "lagoon-fold-trace-"));
    const tracePath = path.join(dir, "world.eavt");
    try {
      seedMachineAndOffice(tracePath);
      const results = fold([root], tracePath);
      assert.equal(results.length, 1);
      assert.equal(results[0].skipped, false);

      const found = lookWorld(tracePath, "test-office");
      assert.equal(found.recentDuties.length, 1);
      assert.equal(found.recentDuties[0].attributes.name, "test-skill");
      assert.equal(found.recentDuties[0].attributes.activity, "skill-selected");

      const rows = readEavtEntries({ path: tracePath });
      const dutyAddress = found.recentDuties[0].address;
      assert.ok(rows.some((r) => r.e === dutyAddress && r.a === "reported-by" && r.v === ADMITTED_ACTOR));
      assert.ok(rows.some((r) => r.e === dutyAddress && r.a === "reported-at" && r.v === found.address));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("fold is idempotent: re-folding the same events appends nothing new", () => {
  withDir((root) => {
    recordSkillSelection({ root, actor: ADMITTED_ACTOR, turnId: "turn-1", skill: "test-skill", recordedAt: "2026-08-31T00:00:00.000Z" });

    const dir = mkdtempSync(path.join(scratchRoot(), "lagoon-fold-trace-"));
    const tracePath = path.join(dir, "world.eavt");
    try {
      seedMachineAndOffice(tracePath);
      fold([root], tracePath);
      const before = readEavtEntries({ path: tracePath }).length;

      const second = fold([root], tracePath);
      assert.ok(second.every((r) => r.skipped === true));
      assert.equal(readEavtEntries({ path: tracePath }).length, before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
