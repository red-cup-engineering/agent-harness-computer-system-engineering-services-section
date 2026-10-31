import { performance } from "node:perf_hooks";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handle, HOOK_ADDITIONAL_CONTEXT_LIMIT } from "./codex-enterprise-hook.mjs";
import { readTrajectory } from "./enterprise.mjs";
import { compileToolEvidence } from "./tool-evidence.mjs";
import { observeMonitor } from "./harness-routing.mjs";
import { semanticIdentity } from "./semiotic-circuit.mjs";

const bytes = (value) => Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));
const contextBytes = (output) => bytes(output?.hookSpecificOutput?.additionalContext ?? "");
const ADDRESS = "codex/actor/bare-cedar-fog-codex";
const pointer = (value) => new RegExp(`^ADDRESS ${ADDRESS}/(?:continuity/session-start|evidence/current-tool-result)\\. TYPE [A-Za-z]+(?:[A-Za-z]|Locator)*\\. RESOLVE observe_codex_[a-z_]+\\.(?: READ [a-z0-9_, ]+\\.)?$`, "u").test(value)
  || new RegExp(`^ADDRESS ${ADDRESS}/prompt-cycle/active\\. TYPE CodexPromptContextLocator\\. RESOLVE observe_codex_prompt_context\\. READ [a-z0-9_, ]+\\.(?: CORRECTION active; restart Monitor before actuation\\.)?$`, "u").test(value);

export function runHarnessEfficiencyAssay(options = {}) {
  const stateRoot = options.stateRoot ?? mkdtempSync(join(tmpdir(), "codex-harness-efficiency-"));
  const enterpriseOptions = { stateRoot };
  const now = () => "2026-07-30T12:00:00.000Z";
  const run = (input) => handle(input, { enterpriseOptions, now, enqueuePromptCycle: () => null, retrieveCorrections: () => { throw new Error("hot prompt path scanned transcript"); } });
  const priorTranscript = `PRIOR_TRANSCRIPT_SENTINEL\n${"t".repeat(options.priorTranscriptBytes ?? 30_000_000)}`;
  const toolResult = `TOOL_RESULT_SENTINEL\n${"r".repeat(options.toolResultBytes ?? 16_000_000)}`;
  const prior = compileToolEvidence({ tool_name: "prior-context-index", tool_input: {}, tool_response: priorTranscript }, { ...enterpriseOptions, provider: "assay-provenance" });
  const samples = [];
  const timed = (name, action, rawCarrierBytes) => {
    const started = performance.now();
    const output = action();
    const wallMs = performance.now() - started;
    samples.push({ name, rawCarrierBytes, injectedBytes: contextBytes(output), wallMs, output });
    return output;
  };
  timed("fresh-prompt", () => run({ hook_event_name: "UserPromptSubmit", session_id: "assay", turn_id: "1", prompt: "fresh representative prompt" }), bytes("fresh representative prompt"));
  timed("interrupted-prompt-30mb-prior", () => run({ hook_event_name: "UserPromptSubmit", session_id: "assay", turn_id: "2", prompt: "correction", prior_context_receipt: prior.receipt.id }), bytes(priorTranscript) + bytes("correction"));
  timed("tool-result-16mb", () => run({ hook_event_name: "PostToolUse", session_id: "assay", turn_id: "2", tool_use_id: "large", tool_name: "representative-tool", tool_input: {}, tool_response: { output: toolResult } }), bytes(toolResult));
  const duplicate = { hook_event_name: "UserPromptSubmit", hook_event_id: "shared-native", session_id: "duplicate", turn_id: "1", prompt: "one delivery" };
  timed("duplicate-user-delivery", () => run(duplicate), bytes(duplicate.prompt));
  timed("duplicate-project-delivery", () => run(duplicate), bytes(duplicate.prompt));
  timed("subagent-completion", () => run({ hook_event_name: "SubagentStop", hook_event_id: "sub-stop", session_id: "assay", turn_id: "2", agent_id: "stable-agent", agent_type: "bounded", status: "completed", last_assistant_message: "addressed result" }), bytes("addressed result"));
  const unchangedState = semanticIdentity({ state: "unchanged" }, "bare-cedar-fog-codex.harness-monitor-state").id;
  let monitor = observeMonitor(null, { stateDigest: unchangedState });
  const observations = [monitor];
  timed("repeated-status-wait", () => {
    for (let index = 0; index < 8; index += 1) { monitor = observeMonitor(monitor, { stateDigest: unchangedState }); observations.push(monitor); }
    return {};
  }, bytes("still running".repeat(8)));
  const harnessInjectedBytes = samples.reduce((sum, sample) => sum + sample.injectedBytes, 0);
  const rawCarrierBytes = samples.reduce((sum, sample) => sum + sample.rawCarrierBytes, 0);
  const hookWallMs = samples.reduce((sum, sample) => sum + sample.wallMs, 0);
  const transportBytesPerMs = options.transportBytesPerMs ?? 4_000;
  const baselineEndToEndWallMs = rawCarrierBytes / transportBytesPerMs;
  const harnessEndToEndWallMs = hookWallMs + harnessInjectedBytes / transportBytesPerMs;
  const rows = readTrajectory(enterpriseOptions);
  const result = {
    type: "CodexHarnessEfficiencyAssay",
    baseline: { injectedBytes: rawCarrierBytes, estimatedTokens: Math.ceil(rawCarrierBytes / 4), endToEndWallMs: baselineEndToEndWallMs, processCount: 0 },
    harness: { injectedBytes: harnessInjectedBytes, estimatedTokens: Math.ceil(harnessInjectedBytes / 4), hookWallMs, endToEndWallMs: harnessEndToEndWallMs, processCount: 0 },
    samples: samples.map(({ output, ...sample }) => ({ ...sample, pointer: contextBytes(output) === 0 || pointer(output?.hookSpecificOutput?.additionalContext ?? "") })),
    duplicateRecords: rows.filter((row) => row.type === "PromptMapeCycleStarted" && row.sessionId === "duplicate").length - 1,
    statusObservations: observations.filter((item) => item.emitObservation).length,
    maximumAdditionalContextBytes: Math.max(...samples.map((sample) => sample.injectedBytes)),
  };
  result.passed = result.harness.injectedBytes < result.baseline.injectedBytes
    && result.harness.estimatedTokens < result.baseline.estimatedTokens
    && result.harness.endToEndWallMs < result.baseline.endToEndWallMs
    && result.harness.processCount <= result.baseline.processCount
    && result.duplicateRecords === 0
    && result.statusObservations === 1
    && result.maximumAdditionalContextBytes <= HOOK_ADDITIONAL_CONTEXT_LIMIT
    && result.samples.every((sample) => sample.pointer)
    && result.samples.find((sample) => sample.name === "fresh-prompt").injectedBytes <= 256;
  return Object.freeze(result);
}
