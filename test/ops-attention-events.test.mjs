import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ADMITTED_HARNESS_ACTORS, recordProviderCommission, recordSkillSelection } from "../src/harness-lifecycle.mjs";
import { DEFAULT_ATTENTION_EVENT_CONTRACT, projectOpsHarnessAttentionEvents } from "../src/ops-attention-events.mjs";

const [FIRST_ACTOR, SECOND_ACTOR] = ADMITTED_HARNESS_ACTORS;

function journal(t) {
  const root = mkdtempSync(join(tmpdir(), "harness-attention-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  recordSkillSelection({ root, actor: FIRST_ACTOR, turnId: "turn-1", skill: "maintain-harness", recordedAt: "2026-08-31T12:00:00.000Z" });
  recordSkillSelection({ root, actor: SECOND_ACTOR, turnId: "turn-2", skill: "census-existing-code", recordedAt: "2026-08-31T12:01:00.000Z" });
  recordProviderCommission({ root, actor: FIRST_ACTOR, turnId: "turn-3", agent: "harness-reviewer", task: "Forward-test the harness skill.", recordedAt: "2026-08-31T12:02:00.000Z" });
  return root;
}

test("attention events carry every recorded body through in recorded order, tagged with its journal identity", (t) => {
  const root = journal(t);
  const events = projectOpsHarnessAttentionEvents({ root, source: "some-harness" });
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(({ observedAt }) => observedAt), ["2026-08-31T12:00:00.000Z", "2026-08-31T12:01:00.000Z", "2026-08-31T12:02:00.000Z"]);
  assert.deepEqual(events[0].contract, DEFAULT_ATTENTION_EVENT_CONTRACT);
  assert.equal(events[0].contract.disposition, "local-adapter-only");
  assert.equal(events[0].source, "some-harness");
  assert.match(events[0].sourceEvent, /^ni:\/\/\/sha-256;/u);
  assert.equal(events[0].event.name, "maintain-harness");
  assert.equal(events[2].event.name, "harness-reviewer");
});

test("the source label is required and the contract is a parameter, never a literal about one endpoint", (t) => {
  const root = journal(t);
  assert.throws(() => projectOpsHarnessAttentionEvents({ root }), /source is required/u);
  const contract = { type: "ops.example/attention-event", version: 2, disposition: "local-adapter-only" };
  const events = projectOpsHarnessAttentionEvents({ root, source: "some-harness", contract });
  assert.deepEqual(events[0].contract, contract);
});

test("one journal root serving several harnesses projects only the requested actor when one is named", (t) => {
  const root = journal(t);
  const events = projectOpsHarnessAttentionEvents({ root, source: "first-harness", actor: FIRST_ACTOR });
  assert.equal(events.length, 2);
  assert.ok(events.every(({ event }) => event.actor === FIRST_ACTOR));
});
