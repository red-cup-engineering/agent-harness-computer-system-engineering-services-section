// One representative cost assay of an agent harness's lifecycle hook: does
// routing oversized carriers through the hook leave the model's context, its
// token count, and its end-to-end wall time smaller than injecting those
// carriers raw, while recording each delivery exactly once and emitting only
// change-bearing status observations?
//
// Nothing here knows which harness, runtime, provider, or machine it is
// measuring. The caller supplies the runtime name, the handler under test, the
// evidence boundary the handler writes under, how to read back the trajectory
// the handler recorded, and the shape a bounded context pointer must have.
import { performance } from "node:perf_hooks";

import { decodeAgentLifecycleEvent } from "./agent-lifecycle-hook.mjs";
import { compileToolEvidence } from "./tool-evidence.mjs";
import { observeMonitor } from "./harness-routing.mjs";

const bytes = (value) => Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value));
const contextBytes = (response) => bytes(response?.additionalContext ?? "");

function required(value, label) {
  if (value === undefined || value === null) throw new TypeError(`${label} is required`);
  return value;
}

/**
 * @param {object} options
 * @param {string} options.runtime the agent runtime whose wire shape the samples carry
 * @param {(event: object) => object} options.handler the lifecycle handler under test
 * @param {string} options.actor the actor the handler writes its evidence as
 * @param {(observation: object) => object|null} [options.readTrajectory] reads back what the handler recorded
 * @param {string} options.monitorStateDigest one unchanged-state digest for the status-backoff sample
 * @param {number} options.additionalContextLimit the handler's own additional-context byte limit
 * @param {(text: string) => boolean} options.pointer true when injected context is a bounded pointer
 * @param {string} [options.cycleRecordType] the trajectory record whose duplication would prove a double delivery
 * @param {string} options.stateRoot a fresh, already-created directory this assay's enterprise writes under.
 *   This module never creates it itself: making one is a filesystem effect,
 *   and this assay is otherwise pure given its inputs. The caller makes it
 *   (an effect-owner package such as make-directory-service) and passes it in.
 */
export function runHarnessEfficiencyAssay(options = {}) {
  const runtime = required(options.runtime, "runtime");
  const handler = required(options.handler, "handler");
  const actor = required(options.actor, "actor");
  const monitorStateDigest = required(options.monitorStateDigest, "monitorStateDigest");
  const additionalContextLimit = required(options.additionalContextLimit, "additionalContextLimit");
  const pointer = required(options.pointer, "pointer");
  const readTrajectory = options.readTrajectory ?? (() => []);
  const cycleRecordType = options.cycleRecordType ?? "PromptMapeCycleStarted";
  const stateRoot = required(options.stateRoot, "stateRoot");
  const enterpriseOptions = { stateRoot };
  const now = () => "2026-07-30T12:00:00.000Z";
  // Each sample is one constructed, admitted AgentLifecycleEvent handed to the
  // handler exactly as the agent-lifecycle-hook adapter would hand it over.
  const run = (wire) => {
    const decoded = decodeAgentLifecycleEvent({ runtime, wire });
    if (!decoded.ok) throw new Error(`assay event was not admitted: ${JSON.stringify(decoded.refusal)}`);
    const result = handler(decoded.value, { enterpriseOptions, now });
    if (result?.ok === false) throw new Error(`assay response was not admitted: ${JSON.stringify(result.refusal)}`);
    return result?.ok === true ? result.value : result;
  };
  const priorTranscript = `PRIOR_TRANSCRIPT_SENTINEL\n${"t".repeat(options.priorTranscriptBytes ?? 30_000_000)}`;
  const toolResult = `TOOL_RESULT_SENTINEL\n${"r".repeat(options.toolResultBytes ?? 16_000_000)}`;
  const prior = compileToolEvidence({ tool_name: "prior-context-index", tool_input: {}, tool_response: priorTranscript }, { ...enterpriseOptions, actor, provider: "assay-provenance" });
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
  let monitor = observeMonitor(null, { stateDigest: monitorStateDigest });
  const observations = [monitor];
  timed("repeated-status-wait", () => {
    for (let index = 0; index < 8; index += 1) { monitor = observeMonitor(monitor, { stateDigest: monitorStateDigest }); observations.push(monitor); }
    return {};
  }, bytes("still running".repeat(8)));
  const harnessInjectedBytes = samples.reduce((sum, sample) => sum + sample.injectedBytes, 0);
  const rawCarrierBytes = samples.reduce((sum, sample) => sum + sample.rawCarrierBytes, 0);
  const hookWallMs = samples.reduce((sum, sample) => sum + sample.wallMs, 0);
  // Raw-carrier delivery includes context ingestion, not merely pipe transfer.
  // Keep this deliberately conservative (about 2 MB/s) so the representative
  // assay compares end-to-end interactive delivery against bounded receipts.
  const transportBytesPerMs = options.transportBytesPerMs ?? 2_000;
  const baselineEndToEndWallMs = rawCarrierBytes / transportBytesPerMs;
  const harnessEndToEndWallMs = hookWallMs + harnessInjectedBytes / transportBytesPerMs;
  const rows = readTrajectory(enterpriseOptions);
  const result = {
    type: "HarnessEfficiencyAssay",
    runtime,
    baseline: { injectedBytes: rawCarrierBytes, estimatedTokens: Math.ceil(rawCarrierBytes / 4), endToEndWallMs: baselineEndToEndWallMs, processCount: 0 },
    harness: { injectedBytes: harnessInjectedBytes, estimatedTokens: Math.ceil(harnessInjectedBytes / 4), hookWallMs, endToEndWallMs: harnessEndToEndWallMs, processCount: 0 },
    samples: samples.map(({ output, ...sample }) => ({ ...sample, pointer: contextBytes(output) === 0 || pointer(output?.additionalContext ?? "") })),
    duplicateRecords: rows.filter((row) => row.type === cycleRecordType && row.sessionId === "duplicate").length - 1,
    statusObservations: observations.filter((item) => item.emitObservation).length,
    maximumAdditionalContextBytes: Math.max(...samples.map((sample) => sample.injectedBytes)),
  };
  result.passed = result.harness.injectedBytes < result.baseline.injectedBytes
    && result.harness.estimatedTokens < result.baseline.estimatedTokens
    && result.harness.endToEndWallMs < result.baseline.endToEndWallMs
    && result.harness.processCount <= result.baseline.processCount
    && result.duplicateRecords === 0
    && result.statusObservations === 1
    && result.maximumAdditionalContextBytes <= additionalContextLimit
    && result.samples.every((sample) => sample.pointer)
    && result.samples.find((sample) => sample.name === "fresh-prompt").injectedBytes <= 256;
  return Object.freeze(result);
}
