import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import {
  ADMITTED_HARNESS_ACTORS,
  assertHarnessLifecycleEvent,
  HARNESS_LIFECYCLE_EVENT_SCHEMA,
  HARNESS_LIFECYCLE_TYPE,
  COORDINATION_COMMISSIONED_EVENT_TYPE,
  COORDINATION_ACKNOWLEDGED_EVENT_TYPE,
  COORDINATION_COMPLETED_EVENT_TYPE,
  COORDINATION_REFUSED_EVENT_TYPE,
  acknowledgeCoordination,
  completeCoordination,
  recordCoordinationCommission,
  reduceCoordinationLifecycle,
  refuseCoordination,
  PROVIDER_COMMISSIONED_EVENT_TYPE,
  recordProviderCommission,
  recordSkillSelection,
  SKILL_SELECTED_EVENT_TYPE,
  summarizeHarnessLifecycle,
} from "../src/harness-lifecycle.mjs";
import { recordHarnessProviderCommission } from "../scripts/record-harness-provider-commission.mjs";
import { recordHarnessSkillSelection } from "../scripts/record-harness-skill-selection.mjs";
import { isMain } from "../src/cli.mjs";

const CODEX = "actor:WWOM5azg-fTrn1Id0YVbz5AhppbnFny_W5Xl-rKgSs4";
const CLAUDE = "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw";

function temporaryRoot(t, label) {
  const root = mkdtempSync(join(tmpdir(), `${label}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("CLI main detection accepts direct and symlinked entry paths", (t) => {
  const root = temporaryRoot(t, "harness-lifecycle-cli");
  const modulePath = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
  const symlinkPath = join(root, "cli-link.mjs");
  symlinkSync(modulePath, symlinkPath);
  const moduleUrl = pathToFileURL(modulePath).href;
  assert.equal(isMain(moduleUrl, modulePath), true);
  assert.equal(isMain(moduleUrl, symlinkPath), true);
  assert.equal(isMain(moduleUrl, undefined), false);
});

test("the object kind and event types are harness-neutral, and actor is a provisional validated string, never a closed schema enum", () => {
  assert.equal(HARNESS_LIFECYCLE_TYPE, "harness-lifecycle");
  assert.equal(HARNESS_LIFECYCLE_EVENT_SCHEMA.$id, "urn:bare-cedar-fog:harness-lifecycle-event:v1");
  assert.equal(SKILL_SELECTED_EVENT_TYPE, "bare-cedar-fog.harness/skill-selected");
  assert.equal(PROVIDER_COMMISSIONED_EVENT_TYPE, "bare-cedar-fog.harness/provider-commissioned");
  // Distinguishable and both currently admitted, not a closed universe.
  assert.ok(ADMITTED_HARNESS_ACTORS.includes(CODEX));
  assert.ok(ADMITTED_HARNESS_ACTORS.includes(CLAUDE));
  assert.notEqual(CODEX, CLAUDE);
  for (const variant of HARNESS_LIFECYCLE_EVENT_SCHEMA.oneOf) {
    assert.equal(variant.properties.actor.type, "string");
    assert.ok(!Object.hasOwn(variant.properties.actor, "const"), "actor must never be welded to one harness at the schema layer");
    assert.ok(!Object.hasOwn(variant.properties.actor, "enum"), "actor admission is an application-layer concern, not a closed schema enum");
  }
});

test("the schema admits any nonempty-string actor (identity admission happens at the recording layer, not here)", () => {
  for (const actor of [...ADMITTED_HARNESS_ACTORS, "urn:ame:some-future-harness"]) {
    const event = { type: SKILL_SELECTED_EVENT_TYPE, version: 1, actor, turn: "turn-1", name: "align-to-roadmap" };
    assert.equal(assertHarnessLifecycleEvent(event), event);
  }
  assert.throws(
    () => assertHarnessLifecycleEvent({ type: SKILL_SELECTED_EVENT_TYPE, version: 1, actor: "", turn: "turn-1", name: "x" }),
    /actor is not a conforming string/u,
  );
});

test("recording still refuses an actor outside the current provisional admitted set", (t) => {
  const root = temporaryRoot(t, "harness-lifecycle-provisional-admission");
  assert.throws(
    () => recordSkillSelection({ root, actor: "urn:ame:some-other-harness", turnId: "turn-1", skill: "x" }),
    /actor is not an admitted harness actor/u,
  );
});

test("each variant rejects the other variant's type and shape", () => {
  assert.throws(
    () => assertHarnessLifecycleEvent({ type: "bare-cedar-fog.codex-harness/skill-selected", version: 1, actor: CODEX, turn: "t", name: "n" }),
    /type is not admitted by urn:bare-cedar-fog:harness-lifecycle-event:v1/u,
  );
  assert.throws(
    () => assertHarnessLifecycleEvent({ type: PROVIDER_COMMISSIONED_EVENT_TYPE, version: 1, actor: CODEX, turn: "t", name: "n" }),
    /missing task/u,
  );
  assert.throws(
    () => assertHarnessLifecycleEvent({ type: SKILL_SELECTED_EVENT_TYPE, version: 1, actor: CLAUDE, turn: "t", name: "n", task: "extra" }),
    /unadmitted property: task/u,
  );
  assert.throws(
    () => assertHarnessLifecycleEvent({ type: SKILL_SELECTED_EVENT_TYPE, version: 2, actor: CLAUDE, turn: "t", name: "n" }),
    /version differs from its schema constant/u,
  );
});

test("recording requires an explicit admitted actor and never defaults to one harness", (t) => {
  const root = temporaryRoot(t, "harness-lifecycle-actor");
  assert.throws(() => recordSkillSelection({ root, turnId: "turn-1", skill: "x" }), /actor is required/u);
  assert.throws(() => recordSkillSelection({ root, actor: "urn:ame:not-a-harness", turnId: "turn-1", skill: "x" }), /actor is not an admitted harness actor/u);
  assert.throws(() => recordSkillSelection({ root, actor: CODEX, skill: "x" }), /turnId is required/u);
  assert.throws(() => recordProviderCommission({ root, actor: CLAUDE, turnId: "turn-1", agent: "node-programming" }), /missing task/u);
  assert.throws(() => recordProviderCommission({ root, actor: CLAUDE, turnId: "turn-1", agent: "node-programming", task: "" }), /task is required/u);
});

test("both actors round-trip through a journal root and validate against the one shared schema", (t) => {
  for (const actor of ADMITTED_HARNESS_ACTORS) {
    const root = temporaryRoot(t, "harness-lifecycle-round-trip");
    const skill = recordSkillSelection({ root, actor, turnId: "turn-1", skill: "maintain-codex-harness", recordedAt: "2026-08-31T12:00:00.000Z" });
    const provider = recordProviderCommission({ root, actor, turnId: "turn-1", agent: "node-programming", task: "Generalize the journal.", recordedAt: "2026-08-31T12:01:00.000Z" });
    assert.match(skill.id, /^ni:\/\/\/sha-256;/u);
    assert.match(provider.id, /^ni:\/\/\/sha-256;/u);
    assert.equal(skill.event.actor, actor);
    assert.equal(provider.event.actor, actor);
    assert.equal(assertHarnessLifecycleEvent(skill.event), skill.event);
    assert.equal(assertHarnessLifecycleEvent(provider.event), provider.event);

    const summary = summarizeHarnessLifecycle({ root });
    assert.equal(summary.type, "bare-cedar-fog.harness-attention-summary.v1");
    assert.equal(summary.eventCount, 2);
    assert.deepEqual(summary.selectedSkills.map(({ name, count }) => [name, count]), [["maintain-codex-harness", 1]]);
    assert.deepEqual(summary.commissionedProviders.map(({ name, count }) => [name, count]), [["node-programming", 1]]);
    assert.match(summary.interpretation, /not proof of quality/u);
  }
});

test("one journal root carries both harnesses' events without either shadowing the other", (t) => {
  const root = temporaryRoot(t, "harness-lifecycle-shared-root");
  recordSkillSelection({ root, actor: CODEX, turnId: "turn-1", skill: "shared-skill", recordedAt: "2026-08-31T12:00:00.000Z" });
  recordSkillSelection({ root, actor: CLAUDE, turnId: "turn-1", skill: "shared-skill", recordedAt: "2026-08-31T12:00:01.000Z" });
  assert.equal(summarizeHarnessLifecycle({ root }).eventCount, 2);
});

test("the shared operations take their actor and root from explicit flags", (t) => {
  const root = temporaryRoot(t, "harness-lifecycle-operations");
  const skill = recordHarnessSkillSelection(["--root", root, "--actor", CLAUDE, "--turn", "turn-7", "--skill", "census-existing-code"]);
  const provider = recordHarnessProviderCommission(["--root", root, "--actor", CODEX, "--turn", "turn-7", "--agent", "Explore", "--task", "Sweep consumers."]);
  assert.equal(skill.event.actor, CLAUDE);
  assert.equal(skill.event.type, SKILL_SELECTED_EVENT_TYPE);
  assert.equal(provider.event.actor, CODEX);
  assert.equal(provider.event.type, PROVIDER_COMMISSIONED_EVENT_TYPE);
  assert.equal(assertHarnessLifecycleEvent(skill.event), skill.event);
  assert.equal(assertHarnessLifecycleEvent(provider.event), provider.event);
});

test("the shared operations fall back to HARNESS_LIFECYCLE_ACTOR only when no --actor flag is given, and a flag always wins", (t) => {
  const root = temporaryRoot(t, "harness-lifecycle-env-actor");
  const previous = process.env.HARNESS_LIFECYCLE_ACTOR;
  t.after(() => {
    if (previous === undefined) delete process.env.HARNESS_LIFECYCLE_ACTOR;
    else process.env.HARNESS_LIFECYCLE_ACTOR = previous;
  });

  process.env.HARNESS_LIFECYCLE_ACTOR = CLAUDE;
  const viaEnv = recordHarnessSkillSelection(["--root", root, "--turn", "turn-8", "--skill", "align-to-roadmap"]);
  assert.equal(viaEnv.event.actor, CLAUDE);

  const viaFlagOverEnv = recordHarnessProviderCommission(["--root", root, "--actor", CODEX, "--turn", "turn-8", "--agent", "Explore", "--task", "Sweep."]);
  assert.equal(viaFlagOverEnv.event.actor, CODEX);

  delete process.env.HARNESS_LIFECYCLE_ACTOR;
  assert.throws(
    () => recordHarnessSkillSelection(["--root", root, "--turn", "turn-9", "--skill", "x"]),
    /actor is required/u,
    "with no flag and no env var, the shared script still refuses to guess an actor",
  );
});


test("a content-addressed coordination envelope carries immutable inputs, route, allocation, receiver condition, and ordered terminal evidence", (t) => {
  const root = temporaryRoot(t, "harness-coordination");
  const commissioned = recordCoordinationCommission({
    root, actor: CODEX, turnId: "weiqi-1", receiverActor: CLAUDE,
    capability: "weiqi-engineering", channel: "codex-collaboration", workClass: "bounded-inference",
    allocationBasisPoints: 7000, inputRefs: ["ni:///sha-256;source-prompt"], route: "offer:terra-medium", receiverCondition: "CEO receives consumer evidence.",
    recordedAt: "2026-09-09T12:00:00.000Z",
  });
  assert.equal(commissioned.event.type, COORDINATION_COMMISSIONED_EVENT_TYPE);
  assert.match(commissioned.id, /^ni:\/\/\/sha-256;/u);
  const acknowledged = acknowledgeCoordination({ root, actor: CLAUDE, turnId: "weiqi-1", coordination: commissioned.id, recordedAt: "2026-09-09T12:01:00.000Z" });
  const completed = completeCoordination({ root, actor: CLAUDE, turnId: "weiqi-1", coordination: commissioned.id, resultRefs: ["ni:///sha-256;receiver-evidence"], recordedAt: "2026-09-09T12:02:00.000Z" });
  assert.equal(acknowledged.event.type, COORDINATION_ACKNOWLEDGED_EVENT_TYPE);
  assert.equal(completed.event.type, COORDINATION_COMPLETED_EVENT_TYPE);
  assert.equal(reduceCoordinationLifecycle([{ record: commissioned.event }, { record: acknowledged.event }, { record: completed.event }]), "completed");
  assert.throws(() => reduceCoordinationLifecycle([{ record: commissioned.event }, { record: completed.event }]), /invalid coordination lifecycle transition/u);
  assert.throws(() => recordCoordinationCommission({ root, actor: CODEX, turnId: "t", receiverActor: CLAUDE, capability: "x", channel: "x", workClass: "x", allocationBasisPoints: 0, inputRefs: ["x"], route: "x", receiverCondition: "x" }), /allocationBasisPoints/u);
  const refused = refuseCoordination({ root, actor: CLAUDE, turnId: "weiqi-2", coordination: commissioned.id, refusal: "receiver unavailable", recordedAt: "2026-09-09T12:03:00.000Z" });
  assert.equal(refused.event.type, COORDINATION_REFUSED_EVENT_TYPE);
});

test("the inference-purchased event type exists and is admitted by the same schema", () => {
  const variant = HARNESS_LIFECYCLE_EVENT_SCHEMA.oneOf.find((candidate) => candidate.properties?.type?.const === "bare-cedar-fog.harness/inference-purchased");
  assert.ok(variant, "the schema must admit inference-purchased as a third oneOf variant");
  assert.deepEqual([...variant.required].sort(), ["actor", "exchangeId", "latencySeconds", "model", "outcome", "price", "provider", "turn", "type", "version"]);
});
