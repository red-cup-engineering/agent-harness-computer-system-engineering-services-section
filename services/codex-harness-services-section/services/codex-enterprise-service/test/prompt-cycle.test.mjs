import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { identity, readTrajectory } from "../src/enterprise.mjs";
import { admitPrompt, pausePromptCycleBoundary, processPromptCycle, promptWorkBoard, readPromptEvents, setPromptWorkState, toolUseDisposition } from "../src/prompt-cycle.mjs";

const now = () => "2026-07-27T23:30:00.000Z";
const fixture = () => ({ stateRoot: mkdtempSync(join(tmpdir(), "codex-prompt-cycle-")), now, enqueue: () => null });
const prompt = (session_id, turn_id, text) => ({ session_id, turn_id, prompt: text });
const authority = (admitted, resourceTradeReceipt = "urn:receipt:ephemeral-runner") => {
  const body = {
    type: "PromptResourcePlacementAuthority",
    version: 1,
    provider: "urn:ame:ephemeral-cloud-runner-provider",
    resourceTradeReceipt,
    executionClass: "ephemeral-cloud-runner",
    cycle: admitted.cycle.id,
    intent: admitted.placementIntent.id,
    workload: admitted.placementIntent.workload,
    singleUse: true,
  };
  return Object.freeze({ id: identity(body), ...body });
};

test("a prompt starts a persisted MAPE cycle over retained source data", () => {
  const options = fixture();
  const admitted = admitPrompt(prompt("session-1", "turn-1", "repair the harness"), options);
  assert.equal(admitted.interruption, false);
  assert.equal(admitted.cycle.type, "CodexMapeCycle");
  assert.ok(admitted.cycle.lots.some(({ stage }) => stage === "monitor"));
  assert.ok(admitted.cycle.lots.some(({ stage }) => stage === "execute"));
  assert.equal(readPromptEvents(options)[0].prompt, "repair the harness");
  assert.equal(readTrajectory(options).filter(({ type }) => type === "PromptMapeCycleStarted").length, 1);
  assert.deepEqual(
    readTrajectory(options).filter(({ type }) => type === "MapeKnowledgeArtifactObserved").map(({ knowledgeClass }) => knowledgeClass),
    ["LeaderMoveK", "RequirementK"],
  );
  assert.equal(admitted.placementIntent.type, "PromptResourcePlacementIntentOpened");
  assert.equal(admitted.placementIntent.placement.executionClass, "ephemeral-cloud-runner");
  assert.equal(admitted.placementIntent.placement.localMachineAccess, "none");
  assert.equal(readTrajectory(options).some(({ type }) => type === "PromptCloudWorkerStarted"), false);
});

test("a prompt cannot execute without a settled single-use resource placement authority", async () => {
  const options = fixture();
  const admitted = admitPrompt(prompt("session-1", "turn-1", "do not spawn locally"), options);
  await assert.rejects(processPromptCycle(admitted.cycle.id, { ...options, infer: async () => { throw new Error("must not be reached"); } }), /placement-authority-required/u);
  assert.equal(readTrajectory(options).some(({ type }) => type === "PromptCloudInferenceStarted"), false);
});

test("an interruption supersedes the prior cycle and denies its later tool execution", () => {
  const options = fixture();
  const first = admitPrompt(prompt("session-1", "turn-1", "continue the repair"), options);
  const correction = admitPrompt(prompt("session-1", "turn-2", "restart monitoring from this correction"), options);
  assert.equal(correction.interruption, true);
  assert.equal(correction.supersededCycle, first.cycle.id);
  assert.equal(toolUseDisposition({ session_id: "session-1", turn_id: "turn-1" }, options).allowed, false);
  assert.equal(toolUseDisposition({ session_id: "session-1", turn_id: "turn-2" }, options).allowed, true);
  const superseded = readTrajectory(options).find(({ type }) => type === "PromptMapeCycleSuperseded");
  assert.equal(superseded.cycle, first.cycle.id);
  assert.equal(superseded.supersededBy, correction.cycle.id);
});

test("a real Codex same-turn steer permits only the restarted correction generation", () => {
  const options = fixture();
  const first = admitPrompt(prompt("session-1", "turn-1", "old generation"), options);
  const correction = admitPrompt(prompt("session-1", "turn-1", "same-turn steering correction"), options);
  const restarted = toolUseDisposition({ session_id: "session-1", turn_id: "turn-1" }, options);
  assert.notEqual(correction.cycle.id, first.cycle.id);
  assert.equal(restarted.allowed, true);
  assert.equal(restarted.restartedGeneration, true);
  assert.equal(restarted.cycle, correction.cycle.id);
  admitPrompt(prompt("session-1", "turn-2", "later correction"), options);
  assert.equal(toolUseDisposition({ session_id: "session-1", turn_id: "turn-1" }, options).allowed, false);
});

test("a normal turn boundary pauses execution but leaves work visible across sessions", () => {
  const options = fixture();
  const first = admitPrompt(prompt("session-1", "turn-1", "first demand"), options);
  pausePromptCycleBoundary({ hook_event_name: "Stop", session_id: "session-1", turn_id: "turn-1" }, options);
  const next = admitPrompt(prompt("session-1", "turn-2", "next demand"), options);
  assert.equal(next.interruption, false);
  assert.equal(promptWorkBoard(options).find((item) => item.cycle === first.cycle.id).state, "open");
  assert.equal(promptWorkBoard(options).some((item) => item.prompt === "first demand"), true);
});

test("a distinct harness continuation resumes the monitored cycle after a turn boundary", () => {
  const options = fixture();
  const admitted = admitPrompt(prompt("session-1", "turn-1", "continue durable work"), options);
  pausePromptCycleBoundary({ hook_event_name: "Stop", session_id: "session-1", turn_id: "turn-1" }, options);

  const continuation = toolUseDisposition({ session_id: "session-1", turn_id: "turn-2" }, options);
  assert.equal(continuation.allowed, true);
  assert.equal(continuation.resumedAfterBoundary, true);
  assert.equal(continuation.cycle, admitted.cycle.id);
  assert.equal(toolUseDisposition({ session_id: "session-1", turn_id: "turn-1" }, options).allowed, false);

  const nextPrompt = admitPrompt(prompt("session-1", "turn-3", "a separately monitored demand"), options);
  assert.equal(nextPrompt.interruption, false);
  assert.equal(toolUseDisposition({ session_id: "session-1", turn_id: "turn-3" }, options).cycle, nextPrompt.cycle.id);
});

test("the persistent board changes state only through an explicit work update", () => {
  const options = fixture();
  const admitted = admitPrompt(prompt("session-1", "turn-1", "retain this exact demand"), options);
  pausePromptCycleBoundary({ hook_event_name: "Stop", session_id: "session-1", turn_id: "turn-1" }, options);
  assert.equal(promptWorkBoard(options)[0].state, "open");
  setPromptWorkState({ cycle: admitted.cycle.id, state: "completed", issuer: "urn:ame:bare-cedar-fog-codex", evidence: "receiver-visible outcome", observedAt: now() }, options);
  assert.equal(promptWorkBoard(options)[0].state, "completed");
  assert.equal(promptWorkBoard(options)[0].prompt, "retain this exact demand");
});

test("a delegated child turn may use tools under the active parent cycle while a stale known turn remains denied", () => {
  const options = fixture();
  admitPrompt(prompt("session-1", "turn-1", "parent work"), options);
  assert.equal(toolUseDisposition({ session_id: "session-1", turn_id: "child-turn" }, options).delegatedTurn, true);
  admitPrompt(prompt("session-1", "turn-2", "correction"), options);
  assert.equal(toolUseDisposition({ session_id: "session-1", turn_id: "turn-1" }, options).allowed, false);
});

test("free-cloud candidate is materialized as content-addressed pending work items", async () => {
  const options = fixture();
  const admitted = admitPrompt(prompt("session-1", "turn-1", "repair prompt intake"), options);
  const result = await processPromptCycle(admitted.cycle.id, {
    ...options,
    placementAuthority: authority(admitted),
    infer: async () => ({
      provider: "urn:ame:gemini-inference-team",
      receipt: "ni:///sha-256;provider-receipt",
      product: { workItems: [{ objective: "assay prompt intake", desiredOutcome: "prompt becomes a work item", completionConditions: ["fresh hook process emits the item"], dependencies: [] }] },
    }),
  });
  assert.equal(result.disposition, "work-items-compiled");
  assert.equal(result.record.workItems[0].state, "pending");
  assert.match(result.record.workItems[0].id, /^urn:sha256:[a-f0-9]{64}$/u);
  assert.equal(result.record.acceptance, "pending-codex-integration-and-customer-outcome");
});

test("provider output arriving after an interruption is discarded", async () => {
  const options = fixture();
  const first = admitPrompt(prompt("session-1", "turn-1", "old demand"), options);
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const running = processPromptCycle(first.cycle.id, {
    ...options,
    placementAuthority: authority(first),
    infer: async () => { await waiting; return { provider: "urn:ame:gemini-inference-team", receipt: "urn:receipt:late", product: { workItems: [{ objective: "old", desiredOutcome: "old", completionConditions: ["old"], dependencies: [] }] } }; },
  });
  admitPrompt(prompt("session-1", "turn-2", "correction"), options);
  release();
  assert.equal((await running).disposition, "superseded-after-inference");
  assert.equal(readTrajectory(options).some((row) => row.type === "PromptWorkItemsCompiled" && row.cycle === first.cycle.id), false);
  const attempt = readTrajectory(options).find((row) => row.type === "PromptCloudInferenceStarted" && row.cycle === first.cycle.id);
  assert.match(attempt.attempt, /^urn:sha256:[a-f0-9]{64}$/u);
  assert.equal(readTrajectory(options).find((row) => row.type === "PromptCloudInferenceDiscarded" && row.cycle === first.cycle.id).attempt, attempt.attempt);
});

test("cloud retries retain one cycle while receiving distinct persisted attempt identities", async () => {
  const options = fixture();
  const admitted = admitPrompt(prompt("session-1", "turn-1", "retry this exact demand"), options);
  await assert.rejects(processPromptCycle(admitted.cycle.id, { ...options, placementAuthority: authority(admitted, "urn:receipt:first-attempt"), infer: async () => { throw new Error("provider unavailable"); } }), /provider unavailable/u);
  const result = await processPromptCycle(admitted.cycle.id, {
    ...options,
    placementAuthority: authority(admitted, "urn:receipt:second-attempt"),
    infer: async (_prompt, _start, context) => ({ provider: "urn:ame:gemini-inference-team", receipt: `urn:receipt:${context.attempt}`, product: { workItems: [{ objective: "retry", desiredOutcome: "settled", completionConditions: ["receipt exists"], dependencies: [] }] } }),
  });
  const attempts = readTrajectory(options).filter((row) => row.type === "PromptCloudInferenceStarted" && row.cycle === admitted.cycle.id);
  assert.equal(result.disposition, "work-items-compiled");
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0].attempt, attempts[1].attempt);
  assert.equal(result.record.attempt, attempts[1].attempt);
});

test("an interruption refuses a late placement authority before provider work", async () => {
  const options = fixture();
  const first = admitPrompt(prompt("session-1", "turn-1", "in-flight demand"), options);
  admitPrompt(prompt("session-1", "turn-2", "interrupt and restart"), options);
  assert.deepEqual(await processPromptCycle(first.cycle.id, { ...options, placementAuthority: authority(first), infer: async () => { throw new Error("must not be reached"); } }), { disposition: "superseded-before-inference", cycle: first.cycle.id });
  assert.equal(readTrajectory(options).some((row) => row.type === "PromptResourcePlacementAuthorityConsumed" && row.cycle === first.cycle.id), false);
});
