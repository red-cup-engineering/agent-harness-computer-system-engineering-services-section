import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { handle, HOOK_ADDITIONAL_CONTEXT_LIMIT } from "../src/codex-enterprise-hook.mjs";
import { position, readTrajectory } from "../src/enterprise.mjs";
import { compileToolEvidence } from "../src/tool-evidence.mjs";

const AT = "2026-07-26T21:00:00.000Z";
const fixture = () => ({ stateRoot: mkdtempSync(join(tmpdir(), "codex-enterprise-hook-")) });
const run = (input, enterpriseOptions, options = {}) => handle(input, { enterpriseOptions, now: () => AT, enqueuePromptCycle: () => null, ...options });
test("a Leader move records its cycle without injecting enterprise context", () => {
  const enterpriseOptions = fixture();
  const output = run({ hook_event_name: "UserPromptSubmit", session_id: "session-1", turn_id: "turn-1", prompt: "fix the parser's reported error" }, enterpriseOptions);
  assert.deepEqual(output, {});
  assert.doesNotMatch(JSON.stringify(readTrajectory(enterpriseOptions)), /fix the parser's reported error/u);
});

test("prompt submission has no interactive hook payload", () => {
  const enterpriseOptions = fixture();
  const output = run({ hook_event_name: "UserPromptSubmit", session_id: "session-1", turn_id: "turn-1", prompt: "translate this move" }, enterpriseOptions);
  assert.deepEqual(output, {});
});

test("identical user- and project-level hook delivery converges before prompt lifecycle effects", () => {
  const enterpriseOptions = fixture();
  const delivery = { hook_event_name: "UserPromptSubmit", session_id: "session-duplicate", turn_id: "turn-duplicate", prompt: "record this exact move once" };
  const first = run(delivery, enterpriseOptions, { retrieveCorrections: () => "PRIOR CORRECTIONS: none." });
  const duplicate = run(delivery, enterpriseOptions, { retrieveCorrections: () => "PRIOR CORRECTIONS: none." });
  const rows = readTrajectory(enterpriseOptions);
  assert.deepEqual(first, {});
  assert.deepEqual(duplicate, {});
  assert.equal(rows.filter(({ type }) => type === "PromptMapeCycleStarted").length, 1);
  assert.equal(rows.filter(({ type }) => type === "LeaderMoveObserved").length, 1);
  assert.equal(rows.filter(({ type }) => type === "PromptMapeCycleSuperseded").length, 0);
});

test("distinct native tool, subagent, and turn identities remain distinct events", () => {
  const enterpriseOptions = fixture();
  const tool = { hook_event_name: "PreToolUse", session_id: "session-distinct", turn_id: "turn-1", tool_name: "functions.exec", tool_input: { cmd: "true" } };
  run({ ...tool, tool_use_id: "tool-1" }, enterpriseOptions);
  run({ ...tool, tool_use_id: "tool-2" }, enterpriseOptions);

  const subagent = { hook_event_name: "SubagentStart", session_id: "session-distinct", turn_id: "turn-1", agent_type: "bounded", model: "gpt-test" };
  run({ ...subagent, agent_id: "agent-1" }, enterpriseOptions);
  run({ ...subagent, agent_id: "agent-2" }, enterpriseOptions);

  run({ hook_event_name: "UserPromptSubmit", session_id: "session-turns", turn_id: "turn-1", prompt: "same text" }, enterpriseOptions, { retrieveCorrections: () => "PRIOR CORRECTIONS: none." });
  run({ hook_event_name: "UserPromptSubmit", session_id: "session-turns", turn_id: "turn-2", prompt: "same text" }, enterpriseOptions, { retrieveCorrections: () => "PRIOR CORRECTIONS: none." });

  const rows = readTrajectory(enterpriseOptions);
  assert.equal(rows.filter(({ type }) => type === "ToolBoundaryBudgetDeclared").length, 2);
  assert.equal(rows.filter(({ type }) => type === "DirectCodexExecutionObserved").length, 2);
  assert.equal(rows.filter(({ type }) => type === "SupplierWorkStartedObserved").length, 2);
  assert.equal(rows.filter(({ type, sessionId }) => type === "PromptMapeCycleStarted" && sessionId === "session-turns").length, 2);
});

test("multi-megabyte prior context is addressed and never replayed on the prompt boundary", () => {
  const enterpriseOptions = fixture();
  const sentinel = "PRIOR_SOURCE_PROMPT_MUST_NOT_REPLAY";
  const prior = compileToolEvidence({ tool_name: "prior-context-index", tool_input: {}, tool_response: `${sentinel}\n${"x".repeat(2_000_000)}` }, { ...enterpriseOptions, provider: "test-provenance" });
  const output = run({ hook_event_name: "UserPromptSubmit", session_id: "session-1", turn_id: "turn-1", prompt: "Notebook context request", prior_context_receipt: prior.receipt.id }, enterpriseOptions, {
    retrieveCorrections: () => { throw new Error("hot prompt path scanned prior transcript"); },
  });
  assert.deepEqual(output, {});
});

test("a fresh session records continuity without injecting a locator", () => {
  const enterpriseOptions = fixture();
  run({ hook_event_name: "UserPromptSubmit", session_id: "session-1", turn_id: "turn-1", prompt: "finish the cloud migration without a laptop proxy" }, enterpriseOptions);
  run({ hook_event_name: "Stop", session_id: "session-1", turn_id: "turn-1" }, enterpriseOptions);
  const output = run({ hook_event_name: "SessionStart", session_id: "session-2" }, enterpriseOptions);
  assert.deepEqual(output, {});
});

test("session start has no interactive hook payload", () => {
  const enterpriseOptions = fixture();
  const output = run({ hook_event_name: "SessionStart", session_id: "session-1", source: "startup" }, enterpriseOptions);
  const second = run({ hook_event_name: "SessionStart", session_id: "session-2", source: "startup" }, enterpriseOptions);
  assert.deepEqual(output, {});
  assert.deepEqual(second, {});
});

test("subagent lifecycle records provider work and exchange evidence but no customer acceptance or resource fact", () => {
  const enterpriseOptions = fixture();
  const lifecycle = { session_id: "session-1", turn_id: "turn-1", agent_id: "agent-1", agent_type: "independent_diagnosis", model: "gpt-5.6-terra" };
  run({ hook_event_name: "SubagentStart", ...lifecycle }, enterpriseOptions);
  run({ hook_event_name: "SubagentStop", ...lifecycle, status: "completed", last_assistant_message: "private provider result" }, enterpriseOptions);
  const rows = readTrajectory(enterpriseOptions);
  assert.equal(rows.filter(({ type }) => type === "SupplierWorkStartedObserved").length, 1);
  assert.equal(rows.filter(({ type }) => type === "SupplierExchangeObserved").length, 1);
  assert.equal(rows.filter(({ type }) => type === "CustomerOutcomeObserved").length, 0);
  assert.equal(rows.filter(({ type }) => type === "CodexResourceObserved").length, 0);
  assert.doesNotMatch(JSON.stringify(rows), /private provider result/u);
  const pressure = position(enterpriseOptions).supplierPressure[0];
  assert.equal(pressure.provider, "provider-native");
  assert.equal(pressure.attempts, 1);
  assert.equal(pressure.accepted, 0);
  assert.equal(pressure.acceptanceYield.numerator, "0");
});

test("native provider delegation remains available and is metered at its lifecycle boundary", () => {
  const enterpriseOptions = fixture();
  const output = run({ hook_event_name: "PreToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "Agent", tool_input: { prompt: "bounded work" } }, enterpriseOptions);
  assert.deepEqual(output, {});
  assert.equal(readTrajectory(enterpriseOptions).some(({ type, tool }) => type === "ToolBoundaryBudgetDeclared" && tool === "Agent"), true);
});

test("ordinary Git commands are not intercepted", () => {
  const enterpriseOptions = fixture();
  for (const command of ["git status", "git mv old new", "git push --recurse-submodules=check"]) {
    const admitted = run({ hook_event_name: "PreToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "Bash", tool_input: { cmd: command } }, enterpriseOptions);
    assert.equal(admitted.hookSpecificOutput, undefined, command);
  }
  const admitted = run({ hook_event_name: "PreToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "mcp__union__github_software_induction", tool_input: {} }, enterpriseOptions);
  assert.equal(admitted.hookSpecificOutput, undefined);
});

test("post-tool evidence is captured without interrupting the native result", () => {
  const enterpriseOptions = fixture();
  const small = run({ hook_event_name: "PostToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "Bash", tool_input: { cmd: "printf ok" }, tool_response: { output: "ok\n" }, model: "gpt-5.6-sol" }, enterpriseOptions);
  assert.deepEqual(small, {});
  const large = run({ hook_event_name: "PostToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "Bash", tool_input: { cmd: "git status" }, tool_response: { output: " M file.mjs\n".repeat(5000) }, model: "gpt-5.6-sol" }, enterpriseOptions);
  assert.deepEqual(large, {});
});

test("the active Leader move admits explicit workspace patches but rejects path escape", () => {
  const enterpriseOptions = fixture();
  const harness = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "+++ b/lib/emsenn/services/union-services-section/services/computer-services-section/services/computer-machine-services-section/services/persistent-computer-machine-services-section/service/bare-cedar-fog-services-section/bare-cedar-fog-inference-services-section/services/bare-cedar-fog-codex-services-section/src/prompt-cycle.mjs\n",
  }, enterpriseOptions);
  assert.equal(harness.hookSpecificOutput, undefined);
  const absoluteHarness = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "*** Begin Patch\n*** Add File: /home/emsenn/info/lib/emsenn/services/union-services-section/services/computer-services-section/services/computer-machine-services-section/services/persistent-computer-machine-services-section/service/bare-cedar-fog-services-section/bare-cedar-fog-inference-services-section/services/bare-cedar-fog-codex-services-section/.assay\n+ok\n*** End Patch\n",
  }, enterpriseOptions);
  assert.equal(absoluteHarness.hookSpecificOutput, undefined);
  const codexHarness = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "+++ b/lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/services/inference-services-section/services/llm-services-section/services/openai-services-section/services/codex-harness-services-section/src/hook.mjs\n",
  }, enterpriseOptions);
  assert.equal(codexHarness.hookSpecificOutput, undefined);
  const project = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "+++ b/lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/services/example.mjs\n",
  }, enterpriseOptions);
  assert.equal(project.hookSpecificOutput, undefined);
  const escape = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "*** Begin Patch\n*** Add File: ../outside-workspace\n+no\n*** End Patch\n",
  }, enterpriseOptions);
  assert.equal(escape.hookSpecificOutput.permissionDecision, "deny");
});
