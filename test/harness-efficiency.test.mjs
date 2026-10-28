import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import { join } from "node:path";
import test from "node:test";
import { CONTINUE, respond } from "../src/agent-lifecycle-hook.mjs";
import { runHarnessEfficiencyAssay } from "../src/harness-efficiency.mjs";

const ACTOR = "urn:ame:harness-efficiency-test-caller";
const STATE_DIGEST = "ni:///sha-256;AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const POINTER = /^ADDRESS [a-z0-9/-]+\. RESOLVE [a-z_]+\.$/u;
const scratch = [];
process.on("exit", () => { for (const root of scratch) rmSync(root, { recursive: true, force: true }); });

// One representative handler standing in for any harness's: it records each
// delivery once and answers oversized carriers with a bounded pointer rather
// than the carrier itself.
function boundedHandler(recorded) {
  const claimed = new Set();
  return (event) => {
    const key = `${event.session?.id}:${event.event}:${event.native?.hook_event_id ?? event.session?.turnId}`;
    if (claimed.has(key)) return CONTINUE;
    claimed.add(key);
    recorded.push({ type: "PromptMapeCycleStarted", sessionId: event.session?.id });
    if (event.event !== "PostToolUse") return CONTINUE;
    return respond({ additionalContext: "ADDRESS runtime/actor/subject. RESOLVE observe_evidence." });
  };
}

function assay(overrides = {}) {
  const recorded = [];
  const stateRoot = mkdtempSync(join(scratchRoot(), "harness-efficiency-test-"));
  scratch.push(stateRoot);
  return runHarnessEfficiencyAssay({
    runtime: "codex",
    handler: boundedHandler(recorded),
    actor: ACTOR,
    monitorStateDigest: STATE_DIGEST,
    additionalContextLimit: 512,
    pointer: (text) => POINTER.test(text),
    readTrajectory: () => recorded,
    stateRoot,
    ...overrides,
  });
}

test("synthetic conformance measures context bytes without claiming operating cost or latency", { timeout: 30_000 }, () => {
  const result = assay();
  assert.equal(result.type, "HarnessEfficiencyAssay");
  assert.equal(result.runtime, "codex");
  assert.equal(result.passed, true, JSON.stringify({ ...result, samples: result.samples }, null, 2));
  assert.ok(result.harness.injectedBytes < result.baseline.injectedBytes);
  assert.equal(result.scope, "synthetic-context-delivery");
  assert.equal(result.operatingCost.status, "unmeasured");
  assert.equal(Object.hasOwn(result.baseline, "endToEndWallMs"), false);
  assert.equal(Object.hasOwn(result.harness, "processCount"), false);
  assert.ok(result.baseline.injectedBytes < 100_000);
  assert.equal(result.duplicateRecords, 0);
  assert.equal(result.statusObservations, 1);
  assert.ok(result.maximumAdditionalContextBytes <= 512);
});

test("the assay names nothing about a harness itself: runtime, handler, actor, digest, limit, and pointer are all required", () => {
  for (const missing of ["runtime", "handler", "actor", "monitorStateDigest", "additionalContextLimit", "pointer"]) {
    assert.throws(() => assay({ [missing]: undefined }), new RegExp(`${missing} is required`, "u"), missing);
  }
});

test("a handler that injects an unbounded carrier instead of a pointer fails the assay", () => {
  const result = assay({ handler: (event) => (event.event === "PostToolUse" ? respond({ additionalContext: "x".repeat(4096) }) : CONTINUE) });
  assert.equal(result.passed, false);
  assert.ok(result.maximumAdditionalContextBytes > 512);
});
