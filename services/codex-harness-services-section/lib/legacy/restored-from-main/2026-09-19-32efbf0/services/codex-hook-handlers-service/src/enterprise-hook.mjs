// The Codex customer enterprise's own reading of one agent lifecycle event.
// This module is pure algebra over the typed event: it reaches no filesystem,
// spawns nothing, and resolves no path. Everything that touches the world --
// the machine's delegation policy, and the evidence boundary its receipts are
// written under -- is adopted or passed in by this package's script faces.
import { CONTINUE, block, respond } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { BOUNDED_DISCOVERY_EXECUTABLE, boundedDiscoveryRewrite, compileToolEvidence, declaredToolBudget, recordToolBudget } from "@red-cup-engineering/tool-evidence-bounding-service";
import { ACTOR, DEFAULT_STATE_ROOT, appendObservation, claimHookDelivery, identity } from "@red-cup-engineering/codex-agent-enterprise-service/enterprise";
import { observeNativeUsage } from "@red-cup-engineering/codex-agent-enterprise-service/native-usage";
import { governedMutationDisposition, pausePromptCycleBoundary, providerLaunchDisposition, toolUseDisposition } from "@red-cup-engineering/codex-agent-enterprise-service/prompt-cycle";
import { OBJECT_KIND_NAMESPACE, semanticIdentity } from "@red-cup-engineering/codex-agent-enterprise-service/semiotic-circuit";

const digest = (value) => semanticIdentity(value, `${OBJECT_KIND_NAMESPACE}.hook-material`).id;
export const HOOK_ADDITIONAL_CONTEXT_LIMIT = 512;
const EXACT_OBSERVATION_TOOL = "read_codex_tool_evidence";
// What every tool-evidence call this handler makes declares about itself:
// whose evidence it is, where that evidence is stored, which executable the
// bounded-discovery rewrite substitutes in, and -- through the evidence
// owner's own seam -- that its observations belong in this enterprise's
// trajectory rather than that package's default journal.
const EVIDENCE_BOUNDARY = Object.freeze({
  actor: ACTOR,
  stateRoot: DEFAULT_STATE_ROOT,
  discoveryScriptPath: BOUNDED_DISCOVERY_EXECUTABLE,
  appendObservation,
});

let adoptedLaunchPolicy;

/**
 * Adopt the machine's projected delegation policy for this process. A script
 * face reads the policy record through the file effect owner and adopts it
 * once; this module never reads it itself.
 */
export function adoptLaunchPolicy(policy) {
  if (policy === null || typeof policy !== "object") throw new TypeError("a delegation policy record is required");
  adoptedLaunchPolicy = policy;
  return policy;
}

function launchPolicy(options = {}) {
  const selected = options.launchPolicy ?? adoptedLaunchPolicy;
  if (selected === undefined) throw new TypeError("a delegation policy is required: pass options.launchPolicy, or adopt one with adoptLaunchPolicy");
  return selected;
}

export function hookDeliveryIdentity(input) {
  const hookEventName = String(input?.hook_event_name ?? "unknown");
  return identity({
    type: "CodexHookDelivery",
    version: 1,
    hookEventName,
    sessionId: input?.session_id ?? null,
    turnId: input?.turn_id ?? null,
    nativeEventId: input?.hook_event_id ?? input?.event_id ?? null,
    toolUseId: input?.tool_use_id ?? null,
    agentId: input?.agent_id ?? input?.subagent_id ?? null,
    payload: identity(input ?? null),
  });
}

function subagentCapability(input) {
  const kind = String(input.agent_type ?? input.subagent_type ?? "bounded-agent-work").replace(/[^a-zA-Z0-9._-]/gu, "-");
  const model = String(input.model ?? "unknown-model").replace(/[^a-zA-Z0-9._-]/gu, "-");
  return `urn:capability:codex-subagent:${kind}:${model}`;
}

function subagentOperation(input) {
  return digest({
    session: input.session_id ?? "unknown",
    turn: input.turn_id ?? null,
    agent: input.agent_id ?? input.subagent_id ?? "unknown",
    type: input.agent_type ?? input.subagent_type ?? "unknown",
    model: input.model ?? "unknown",
  });
}
function observableSubagentResources(input) {
  const usage = input.usage ?? input.token_usage ?? null;
  const quantities = usage && typeof usage === "object" ? {
    inputTokens: Number.isSafeInteger(usage.input_tokens ?? usage.inputTokens) ? (usage.input_tokens ?? usage.inputTokens) : null,
    outputTokens: Number.isSafeInteger(usage.output_tokens ?? usage.outputTokens) ? (usage.output_tokens ?? usage.outputTokens) : null,
    cachedInputTokens: Number.isSafeInteger(usage.cached_input_tokens ?? usage.cachedInputTokens) ? (usage.cached_input_tokens ?? usage.cachedInputTokens) : null,
  } : null;
  const result = typeof input.last_assistant_message === "string" ? { amount: Buffer.byteLength(input.last_assistant_message), unit: "bytes", retained: false } : null;
  const elapsed = typeof input.elapsed_seconds === "number" && Number.isFinite(input.elapsed_seconds) ? { amount: input.elapsed_seconds, unit: "seconds" } : null;
  return { tokens: quantities, result, elapsed };
}

function providerProvenance(input) {
  const value = input?.provider ?? input?.provider_id ?? input?.provider_name;
  return typeof value === "string" && value.trim() ? value.trim() : "provider-native";
}

/**
 * The Codex customer enterprise's own reading of one agent lifecycle event:
 * it claims the delivery exactly once, records what the event witnesses in the
 * enterprise trajectory, bounds oversized tool output into addressable
 * evidence, and rules on tool permission where the enterprise's own governance
 * applies. It decides; it never reads stdin, parses arguments, or writes a
 * wire shape — the agent-lifecycle-hook adapter owns all three.
 *
 * @param {object} event one AgentLifecycleEvent
 * @returns {object} one AgentLifecycleResponse, or a Result carrying one
 */
export function observeCodexEnterpriseLifecycle(event, options = {}) {
  const input = event?.native ?? event;
  if (["SessionStart", "UserPromptSubmit"].includes(input.hook_event_name)) return CONTINUE; // Native root instructions and memories already supply startup context.
  const enterpriseOptions = options.enterpriseOptions ?? {};
  // Admission is pure and must run before lifecycle de-duplication. Otherwise
  // retrying one denied or defaulted native spawn would silently receive {}.
  const launch = input.hook_event_name === "PreToolUse"
    ? providerLaunchDisposition(input, { ...enterpriseOptions, launchPolicy: launchPolicy(options) })
    : null;
  if (launch) {
    if (!launch.allowed) return block(launch.reason);
    if (launch.applies && launch.updatedInput) return respond({
      systemMessage: "Bounded provider work defaults to Terra with medium reasoning.",
      permission: { decision: "allow" },
      updatedInput: launch.updatedInput,
    });
  }
  const deliveryIdentity = hookDeliveryIdentity(input);
  const delivery = (options.claimDelivery ?? claimHookDelivery)(deliveryIdentity, enterpriseOptions);
  if (!delivery.claimed) return CONTINUE;
  const at = (options.now ?? (() => new Date().toISOString()))();
  const common = { actor: ACTOR, hookDelivery: deliveryIdentity, sessionFace: digest(input.session_id ?? "unknown"), turn: input.turn_id ?? null, observedAt: at };
  let output = CONTINUE;
  if (input.hook_event_name === "PreToolUse") {
    const budget = declaredToolBudget(input);
    recordToolBudget(input, budget, { ...EVIDENCE_BOUNDARY, ...enterpriseOptions, observedAt: at });
    const rewrite = boundedDiscoveryRewrite(input, { ...EVIDENCE_BOUNDARY, budget, provider: providerProvenance(input) });
    const governedInput = rewrite ? { ...input, tool_input: rewrite.updatedInput } : input;
    if (!launch.applies) {
      const governance = governedMutationDisposition(governedInput);
      if (!governance.allowed) return block(governance.reason);
      const disposition = toolUseDisposition(input, enterpriseOptions);
      if (!disposition.allowed) return block(disposition.reason);
    }
    if (rewrite) return respond({
      systemMessage: `Bounded ${budget.phase} capture is active; raw evidence will remain content-addressed outside premium context.`,
      permission: { decision: "allow" },
      updatedInput: rewrite.updatedInput,
    });
    const tool = String(input.tool_name ?? "unknown");
    const market = /^(?:Agent|spawn_agent|collaboration\.spawn_agent)$/u.test(tool) || /^mcp__.*(?:market|enterprise|supplier|capability)/u.test(tool);
    appendObservation({ type: market ? "SupplierCoordinationObserved" : "DirectCodexExecutionObserved", ...common, toolClass: tool, invocation: digest(input.tool_input ?? {}), argumentsRetained: false }, enterpriseOptions);
  } else if (input.hook_event_name === "PostToolUse") {
    const response = input.tool_response ?? null;
    appendObservation({ type: "CodexExecutionResultObserved", ...common, toolClass: String(input.tool_name ?? "unknown"), result: digest(response), failed: response?.isError === true || response?.success === false || Number(response?.exit_code ?? response?.exitCode ?? 0) !== 0, resultRetained: false }, enterpriseOptions);
    const evidence = compileToolEvidence(input, { ...EVIDENCE_BOUNDARY, ...enterpriseOptions, provider: providerProvenance(input), observedAt: at });
    // Exact output remains retrievable as a receipt. Do not replace or halt the
    // native tool result: the interactive agent needs that result to work.
    void evidence;
  } else if (input.hook_event_name === "SubagentStart") {
    appendObservation({
      type: "SupplierWorkStartedObserved",
      ...common,
      provider: providerProvenance(input),
      capability: subagentCapability(input),
      operation: subagentOperation(input),
      model: input.model ?? "unknown",
      providerReceiptSource: "provider-native Codex SubagentStart lifecycle",
      transcriptRetained: false,
    }, enterpriseOptions);
  } else if (input.hook_event_name === "SubagentStop") {
    const operation = subagentOperation(input);
    appendObservation({
      type: "SupplierExchangeObserved",
      ...common,
      provider: providerProvenance(input),
      capability: subagentCapability(input),
      receipt: `urn:${operation}`,
      protocol: "CodexSubagentLifecycle",
      providerDisposition: input.status ?? input.reason ?? "unknown",
      candidateDisposition: "pending-customer-disposition",
      providerReceiptSource: "provider-native Codex SubagentStop lifecycle",
      resources: observableSubagentResources(input),
      transcriptRetained: false,
    }, enterpriseOptions);
  } else if (input.hook_event_name === "Stop" || input.hook_event_name === "SessionEnd") {
    if (input.turn_id) pausePromptCycleBoundary(input, { ...enterpriseOptions, now: options.now });
    appendObservation({ type: "CodexLifecycleBoundaryObserved", ...common, boundary: input.hook_event_name, reason: input.reason ?? null }, enterpriseOptions);
    const gauges = (options.observeUsage ?? observeNativeUsage)({ sessionId: input.session_id, turnId: input.turn_id, includeWeekly: false });
    if (gauges.latestTurn) appendObservation({ type: "CodexNativeUsageGaugeObserved", ...common, gauge: gauges.latestTurn, weekly: gauges.weekly, monetaryPricePerToken: "unknown", source: "provider-native Codex rollout receipt; transcript not retained" }, enterpriseOptions);
  }
  // These lifecycle hooks are observational only. Interactive context is
  // supplied by the host and must not be inflated with enterprise locators.
  if (input.hook_event_name === "PostToolUse") return CONTINUE;
  return output;
}
