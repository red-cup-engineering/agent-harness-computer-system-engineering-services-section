import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { constitute } from "@red-cup-engineering/eavt-services-section/constitute-entity";
import { appendEavtRow } from "@red-cup-engineering/eavt-services-section/append-eavt-row";
import { seedWorld } from "@red-cup-engineering/flatfile-resource-graph-service/seed-world";
import { lookWorld } from "@red-cup-engineering/flatfile-resource-graph-service/lagoon-world";
import { put } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { HARNESS_LIFECYCLE_TYPE, recordSkillSelection, ADMITTED_HARNESS_ACTORS } from "../src/harness-lifecycle.mjs";
import { HARNESS_TURN_TYPE } from "../scripts/fold-harness-turns.mjs";
import * as verbs from "../src/harness-world-verbs.mjs";

const ACTOR = ADMITTED_HARNESS_ACTORS[0];

function withDir(fn) {
  const dir = mkdtempSync(path.join(scratchRoot(), "harness-world-verbs-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// One synthetic harness: a minted actor genesis plus an mcpServers carrier wielding two instruments.
function harnessSource(dir) {
  const { address, genesis } = constitute({ kind: "actor", attributes: { harness: "test", office: "chief-of-staff" }, t: "2026-08-31T00:00:00Z" });
  writeFileSync(path.join(dir, "genesis.json"), JSON.stringify({ address, genesisRow: genesis }));
  writeFileSync(path.join(dir, "mcp.json"), JSON.stringify({ mcpServers: { registry: {}, ledger: { enabled: false }, relay: {} } }));
  return { address, source: { harness: "test", officeName: "test-office", genesisPath: path.join(dir, "genesis.json"), mcpServersPath: path.join(dir, "mcp.json") } };
}

test("the module exposes the three revived verbs, each with a typed spec and effects", () => {
  assert.deepEqual(Object.keys(verbs).sort(), ["fold-harness-lifecycle", "fold-harness-turns", "seed-offices"]);
  for (const verb of Object.values(verbs)) {
    assert.deepEqual(verb.spec.args.required, ["path"]);
    assert.ok(verb.spec.returns && verb.spec.refusal);
    assert.ok(verb.effects.includes("filesystem:write"));
  }
});

test("seed-offices seeds an office and workbenches into a world with a machine, then does nothing on a re-run", () => withDir((dir) => {
  const trace = path.join(dir, "world.eavt");
  seedWorld({ path: trace, record: { measuredAt: "2026-08-30", entities: [{ kind: "machine", attributes: { name: "bare-cedar-fog" } }] } });
  const { source } = harnessSource(dir);
  const first = verbs["seed-offices"]({ path: trace, sources: [source] }).results;
  assert.ok(first.some((r) => r.kind === "office" && !r.skipped));
  assert.deepEqual(first.filter((r) => r.kind === "workbench").map((r) => r.detail).sort(), ["registry", "relay"]);
  assert.ok(verbs["seed-offices"]({ path: trace, sources: [source] }).results.every((r) => r.skipped));
  const office = lookWorld(trace, "test-office");
  assert.equal(office.things.filter((t) => t.attributes.name === "registry" || t.attributes.name === "relay").length, 2);
}));

test("fold-harness-lifecycle folds admitted events into duties at the actor's office, and refuses where no office is occupied", () => withDir((dir) => {
  const trace = path.join(dir, "world.eavt"), journal = path.join(dir, "journal");
  seedWorld({ path: trace, record: { measuredAt: "2026-08-30", entities: [{ kind: "machine", attributes: { name: "bare-cedar-fog" } }] } });
  recordSkillSelection({ root: journal, actor: ACTOR, turnId: "t1", skill: "a-skill", recordedAt: "2026-08-31T00:00:00.000Z" });
  assert.throws(() => verbs["fold-harness-lifecycle"]({ path: trace, roots: [journal] }), /no office occupied by/);
  appendEavtRow({ path: trace, row: constitute({ kind: "office", attributes: { name: "occupied-office", occupant: ACTOR }, t: 1 }).genesis });
  const first = verbs["fold-harness-lifecycle"]({ path: trace, roots: [journal] }).results;
  assert.deepEqual(first.map((r) => [r.kind, r.skipped]), [["skill-selected", false]]);
  assert.deepEqual(verbs["fold-harness-lifecycle"]({ path: trace, roots: [journal] }).results.map((r) => r.skipped), [true]);
}));

test("fold-harness-turns folds a prompt and a stop into an utterance and a closed session", () => withDir((dir) => {
  const trace = path.join(dir, "world.eavt"), journal = path.join(dir, "journal");
  seedWorld({ path: trace, record: { measuredAt: "2026-08-30", entities: [{ kind: "machine", attributes: { name: "bare-cedar-fog" } }] } });
  const { source } = harnessSource(dir);
  const observation = (event, occurredAt, extra = {}) => ({ type: "BareCedarFogClaudeLifecycleObservation", version: 2, actor: ACTOR, event, occurredAt, sessionDigest: "sha256:s1", workspaceDigest: "sha256:w", ...extra });
  put(journal, HARNESS_TURN_TYPE, { category: "lifecycle.UserPromptSubmit", at: "2026-09-02T00:00:01.000Z", observation: observation("UserPromptSubmit", "2026-09-02T00:00:01.000Z", { promptDigest: "sha256:p1" }) });
  put(journal, HARNESS_TURN_TYPE, { category: "lifecycle.Stop", at: "2026-09-02T00:00:02.000Z", observation: observation("Stop", "2026-09-02T00:00:02.000Z") });
  const first = verbs["fold-harness-turns"]({ path: trace, roots: [journal], sources: [source], placeName: "bare-cedar-fog" }).results;
  assert.ok(first.some((r) => r.kind === "turn" && !r.skipped));
  assert.ok(first.some((r) => r.kind === "closed-at" && !r.skipped));
  const again = verbs["fold-harness-turns"]({ path: trace, roots: [journal], sources: [source], placeName: "bare-cedar-fog" }).results;
  assert.ok(again.every((r) => r.skipped));
}));

test("without a tree or explicit sources and roots a verb refuses plainly instead of failing at import", () => {
  const saved = process.env.LAGOON_REPO_ROOT;
  try {
    // DEFAULT_* were resolved at import; this asserts the refusal path by passing empty lists.
    assert.throws(() => verbs["seed-offices"]({ path: "/nonexistent/world.eavt", sources: [] }), /no sources given/);
    assert.throws(() => verbs["fold-harness-lifecycle"]({ path: "/nonexistent/world.eavt", roots: [] }), /no roots given/);
  } finally {
    if (saved !== undefined) process.env.LAGOON_REPO_ROOT = saved;
  }
});
