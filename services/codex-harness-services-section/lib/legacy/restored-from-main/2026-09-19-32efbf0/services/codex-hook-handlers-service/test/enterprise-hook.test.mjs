import assert from "node:assert/strict";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { AGENT_LIFECYCLE_EVENT_TYPE, CONTINUE } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { decodeAgentLifecycleEvent } from "@red-cup-engineering/agent-lifecycle-hook-service/event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { codexEnterpriseConfiguration } from "@red-cup-engineering/codex-agent-enterprise-service/configuration";
import { HOOK_ADDITIONAL_CONTEXT_LIMIT, adoptLaunchPolicy, observeCodexEnterpriseLifecycle } from "../src/enterprise-hook.mjs";

// The handler is pure algebra and reads no policy itself, so this suite adopts
// the configured machine's delegation policy exactly as the script face does.
const configuration = codexEnterpriseConfiguration();
adoptLaunchPolicy(JSON.parse(readFileSync(resolve(configuration.agentsRoot, configuration.harnessPolicy), "utf8")).delegationPolicy);

// Every handler call in this suite goes through one constructed, admitted
// AgentLifecycleEvent, exactly as the adapter would hand it over.
function lifecycleEvent(wire) {
  const decoded = decodeAgentLifecycleEvent({ runtime: "codex", wire });
  assert.equal(decoded.ok, true, JSON.stringify(decoded.refusal));
  return decoded.value;
}
function handle(wire, options) {
  const result = observeCodexEnterpriseLifecycle(lifecycleEvent(wire), options);
  return result?.ok === false ? (() => { throw new Error(JSON.stringify(result.refusal)); })() : (result?.ok === true ? result.value : result);
}
import { TERRITORY, position, readTrajectory } from "@red-cup-engineering/codex-agent-enterprise-service/enterprise";
import { admitPrompt, pausePromptCycleBoundary, providerLaunchDisposition } from "@red-cup-engineering/codex-agent-enterprise-service/prompt-cycle";
import { compileToolEvidence } from "@red-cup-engineering/tool-evidence-bounding-service";

const AT = "2026-07-26T21:00:00.000Z";
const fixture = () => ({ stateRoot: mkdtempSync(join(tmpdir(), "codex-enterprise-hook-")) });
const run = (input, enterpriseOptions, options = {}) => handle(input, { enterpriseOptions, now: () => AT, ...options });



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
  assert.equal(rows.filter(({ type, sessionId }) => type === "PromptMapeCycleStarted" && sessionId === "session-turns").length, 0);
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

test("native model-selecting spawn requires a bounded assignment and defaults its actual fields", () => {
  const enterpriseOptions = fixture();
  const refused = run({ hook_event_name: "PreToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { prompt: "bounded work" } }, enterpriseOptions);
  assert.equal(refused.disposition, "block");
  assert.match(refused.reason, /bounded assignment/u);

  for (const tool_name of ["spawn_agent", "collaboration.spawn_agent"]) {
    const output = run({ hook_event_name: "PreToolUse", session_id: "session-1", turn_id: "turn-1", tool_name, tool_input: { task_name: "read-owner", prompt: "bounded work" } }, enterpriseOptions);
    assert.equal(output.permission.decision, "allow");
    assert.deepEqual(output.updatedInput, { task_name: "read-owner", prompt: "bounded work", model: "gpt-5.6-terra", reasoning_effort: "medium", fork_turns: "none" });
  }
});

test("repeated native spawn payloads retain their admission decision after hook delivery de-duplication", () => {
  const enterpriseOptions = fixture();
  const denied = { hook_event_name: "PreToolUse", session_id: "session-repeat", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { prompt: "bounded work" } };
  assert.deepEqual(run(denied, enterpriseOptions), run(denied, enterpriseOptions));

  const defaulted = { hook_event_name: "PreToolUse", session_id: "session-repeat", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { task_name: "read-owner", prompt: "bounded work" } };
  assert.deepEqual(run(defaulted, enterpriseOptions), run(defaulted, enterpriseOptions));
});

test("prompt-only providers receive configured methods once without changing their assignment", () => {
  const launchPolicy = {
    default: { model: "gpt-5.6-terra", reasoning_effort: "medium" },
    instructionPreamble: "Use the installed shared engineering method and relevant skills. The assignment determines scope.",
  };
  const assignment = { task_name: "consolidate", message: "Change only the three fixture consumers.", fork_turns: "none" };
  const first = providerLaunchDisposition({ tool_name: "collaboration.spawn_agent", tool_input: assignment }, { launchPolicy });
  assert.equal(first.allowed, true);
  assert.equal(first.updatedInput.message, launchPolicy.instructionPreamble + "\n\n" + assignment.message);
  assert.equal(first.updatedInput.fork_turns, "none");
  assert.equal(assignment.message, "Change only the three fixture consumers.");
  const repeated = providerLaunchDisposition({ tool_name: "collaboration.spawn_agent", tool_input: first.updatedInput }, { launchPolicy });
  assert.equal(repeated.updatedInput, undefined);
});

test("model-selecting spawn refuses when the authored launch policy is unavailable", () => {
  const result = providerLaunchDisposition({ tool_name: "collaboration.spawn_agent", tool_input: { task_name: "read-owner" } });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /declared provider selection/u);
});

test("spawn model exceptions require assignment policy and cannot inherit full history", () => {
  const enterpriseOptions = fixture();
  const selected = run({ hook_event_name: "PreToolUse", session_id: "session-2", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { task_name: "implement", model: "gpt-6-astra", reasoning_effort: "high", fork_turns: "none" } }, enterpriseOptions);
  assert.equal(selected.disposition, "block");
  const overridden = run(
    { hook_event_name: "PreToolUse", session_id: "session-2", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { task_name: "implement", model: "gpt-6-astra", reasoning_effort: "high", fork_turns: "2" } },
    enterpriseOptions,
    { launchPolicy: { default: { model: "gpt-5.6-terra", reasoning_effort: "medium" }, assignmentOverrides: { implement: { model: "gpt-6-astra", reasoning_effort: "high" } } } },
  );
  assert.equal(overridden.disposition, "continue");
  for (const fork_turns of ["all", "0"]) {
    const refused = run({ hook_event_name: "PreToolUse", session_id: "session-2", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { task_name: "read-owner", fork_turns } }, enterpriseOptions);
    assert.equal(refused.disposition, "block");
    assert.match(refused.reason, /fork_turns/u);
  }
  const conflicting = run({ hook_event_name: "PreToolUse", session_id: "session-2", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { task_name: "read-owner", model: "gpt-5.6-terra", reasoning_effort: "high" } }, enterpriseOptions);
  assert.equal(conflicting.disposition, "block");
  const obsoleteField = run({ hook_event_name: "PreToolUse", session_id: "session-2", turn_id: "turn-1", tool_name: "collaboration.spawn_agent", tool_input: { task_name: "read-owner", thinking: "medium" } }, enterpriseOptions);
  assert.equal(obsoleteField.disposition, "block");
  assert.match(obsoleteField.reason, /reasoning_effort/u);
});

test("follow-up remains available after an ordinary prompt interruption", () => {
  const enterpriseOptions = fixture();
  admitPrompt({ session_id: "session-2", turn_id: "turn-1", prompt: "initial bounded work" }, enterpriseOptions);
  pausePromptCycleBoundary({ hook_event_name: "Stop", session_id: "session-2", turn_id: "turn-1" }, enterpriseOptions);
  const followup = run({ hook_event_name: "PreToolUse", session_id: "session-2", turn_id: "turn-2", tool_name: "collaboration.followup_task", tool_input: { target: "read-owner", message: "resume approved work" } }, enterpriseOptions);
  assert.deepEqual(followup, CONTINUE);
});

test("unknown legacy Agent surface is not treated as a model-selecting spawn boundary", () => {
  const enterpriseOptions = fixture();
  const output = run({ hook_event_name: "PreToolUse", session_id: "session-2", turn_id: "turn-1", tool_name: "Agent", tool_input: { task_name: "read-owner" } }, enterpriseOptions);
  assert.deepEqual(output, CONTINUE);
});

test("ordinary Git commands are not intercepted", () => {
  const enterpriseOptions = fixture();
  for (const command of ["git status", "git mv old new", "git push --recurse-submodules=check"]) {
    const admitted = run({ hook_event_name: "PreToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "Bash", tool_input: { cmd: command } }, enterpriseOptions);
    assert.equal(admitted.disposition, "continue", command);
  }
  const admitted = run({ hook_event_name: "PreToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "mcp__union__github_software_induction", tool_input: {} }, enterpriseOptions);
  assert.equal(admitted.disposition, "continue");
});

test("post-tool evidence is captured without interrupting the native result", () => {
  const enterpriseOptions = fixture();
  const small = run({ hook_event_name: "PostToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "Bash", tool_input: { cmd: "printf ok" }, tool_response: { output: "ok\n" }, model: "gpt-5.6-sol" }, enterpriseOptions);
  assert.deepEqual(small, CONTINUE);
  const large = run({ hook_event_name: "PostToolUse", session_id: "session-1", turn_id: "turn-1", tool_name: "Bash", tool_input: { cmd: "git status" }, tool_response: { output: " M file.mjs\n".repeat(5000) }, model: "gpt-5.6-sol" }, enterpriseOptions);
  assert.deepEqual(large, CONTINUE);
});

test("the active Leader move admits explicit workspace patches but rejects path escape", () => {
  const enterpriseOptions = fixture();
  const harness = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "+++ b/lib/some-owner/services/some-services-section/.assay\n",
  }, enterpriseOptions);
  assert.equal(harness.disposition, "continue");
  const absoluteHarness = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: `*** Begin Patch\n*** Add File: ${TERRITORY}/lib/some-owner/services/some-services-section/.assay\n+ok\n*** End Patch\n`,
  }, enterpriseOptions);
  assert.equal(absoluteHarness.disposition, "continue");
  const codexHarness = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "+++ b/lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/services/inference-services-section/services/llm-services-section/services/openai-services-section/services/codex-harness-services-section/src/hook.mjs\n",
  }, enterpriseOptions);
  assert.equal(codexHarness.disposition, "continue");
  const project = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "+++ b/lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/services/example.mjs\n",
  }, enterpriseOptions);
  assert.equal(project.disposition, "continue");
  const escape = run({
    hook_event_name: "PreToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_name: "apply_patch",
    tool_input: "*** Begin Patch\n*** Add File: ../outside-workspace\n+no\n*** End Patch\n",
  }, enterpriseOptions);
  assert.equal(escape.disposition, "block");
});

for (const event of ["SessionStart", "UserPromptSubmit"]) {
  test(event + " leaves context to native instructions without scanning or writing", () => {
    const enterpriseOptions = fixture();
    const forbidden = () => { throw Error("startup must not scan or mutate"); };
    const output = run({hook_event_name:event, prior_context_receipt:"x".repeat(2000000)}, enterpriseOptions, {
      readOffice: forbidden, readWorkBoard: forbidden, observeUsage: forbidden,
      claimDelivery: forbidden,
    });
    assert.deepEqual(output, CONTINUE);
    assert.deepEqual(readdirSync(enterpriseOptions.stateRoot), []);
  });
}
