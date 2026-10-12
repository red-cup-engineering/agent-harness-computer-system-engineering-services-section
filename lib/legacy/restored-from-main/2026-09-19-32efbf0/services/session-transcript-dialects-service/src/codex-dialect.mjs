import { homedir } from "node:os";
import { join } from "node:path";
import { dayShardedCandidateFiles, firstToolCallAccessors } from "./shared.mjs";

// TYPE NAMES AND PROVIDER CELLS BELOW ARE LOAD-BEARING. They are validated
// verbatim by modeled-union-dimension/src/codex-tool-observation.mjs (the
// admission side, in the ethereum-services-section tree) and are carried on
// disk and in published packages. Never rename them here.
const TOOL_OBSERVATION_PROVIDER_CELL = "urn:ame:codex-session-activity-provider:tool-observation";
const PULSE_PROVIDER_CELL = "urn:ame:codex-session-activity-provider:pulse-provider";
const TOOL_OBSERVATION_TYPE = "CodexToolInvocationObservation";
const TOOL_OBSERVATION_RECEIPT_TYPE = "CodexToolInvocationObservationReceipt";

const TOOL_CALL_ROW_TYPE = "response_item";
const TOOL_CALL_PAYLOAD_TYPES = Object.freeze(["custom_tool_call", "function_call"]);

// Unchanged from sensor.mjs's MARKET_PATTERN / PATCH_PATTERN / EXEC_PATTERN.
const MARKET_PATTERN = /contract_inference_work|inference.work.lot|inference-work-lot-market/u;
const PATCH_PATTERN = /apply_patch/u;
const EXEC_PATTERN = /exec_command/u;

/** Structural-only: is this row shaped like a tool call, regardless of whether it names one? */
function isToolCallRow(row) {
  return row?.type === TOOL_CALL_ROW_TYPE && TOOL_CALL_PAYLOAD_TYPES.includes(row.payload?.type);
}

function toolCallsOf(row) {
  if (!isToolCallRow(row)) return [];
  const payload = row.payload;
  if (typeof payload.name !== "string" || payload.name.length === 0) return [];
  const callId = typeof payload.call_id === "string" ? payload.call_id : typeof payload.callId === "string" ? payload.callId : null;
  return [{
    name: payload.name,
    transport: payload.type,
    callId,
    status: typeof payload.status === "string" ? payload.status : "not-reported",
  }];
}

/** Normalized classification of one transcript row, shared vocabulary across dialects where the concept transfers. */
function rowKind(row) {
  if (row?.type === "turn_context") return "turn-context";
  if (isToolCallRow(row)) return "tool-call";
  if (row?.type === "event_msg") {
    switch (row.payload?.type) {
      case "user_message": return "user-message";
      case "task_complete": return "task-complete";
      case "patch_apply_end": return "patch-apply-end";
      case "web_search_end": return "web-search-end";
      case "context_compacted": return "context-compacted";
      case "thread_goal_updated": return "thread-goal-updated";
      case "token_count": return "token-count";
      default: return "other";
    }
  }
  return "other";
}

// The base for collectColonyActivity's per-quantity displayOrder allocation
// (base+0..4 for the "work" quantities, base+10 for "politics", base+20 for
// "operations") — kept distinct per provider so a combined civic-pulse
// rendering that folds Claude and Codex quantities into one table never
// collides two providers onto the same column position.
const ACTIVITY_DISPLAY_ORDER_BASE = 120;

/**
 * Per-row activity tally for collectColonyActivity: how many of each
 * countable civic-pulse category this one row contributes, read entirely
 * off rowKind's explicit event vocabulary — unlike Claude, a Codex
 * transcript carries a distinct application-level row for a completed
 * turn ("task-complete"), a web search ("web-search-end"), and a context
 * compaction ("context-compacted"), so none of those need Claude's
 * tool-name or stop_reason inference.
 */
function activityTally(row) {
  const kind = rowKind(row);
  return {
    completedTurns: kind === "task-complete" ? 1 : 0,
    toolInvocations: isToolCallRow(row) ? 1 : 0,
    patchInvocations: kind === "patch-apply-end" ? 1 : 0,
    webInvocations: kind === "web-search-end" ? 1 : 0,
    userMessages: kind === "user-message" ? 1 : 0,
    compactions: kind === "context-compacted" ? 1 : 0,
  };
}

function modelOf(row) {
  return row?.type === "turn_context" && typeof row.payload?.model === "string" ? row.payload.model : null;
}

/** {input, cached, output, reasoning} from a token_count row, or null when the row is not one. */
function tokenUsageOf(row) {
  if (row?.type !== "event_msg" || row.payload?.type !== "token_count") return null;
  const usage = row.payload?.info?.total_token_usage;
  if (!usage) return null;
  return {
    input: usage.input_tokens ?? 0,
    cached: usage.cached_input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    reasoning: usage.reasoning_output_tokens ?? 0,
  };
}

/** Native Codex token counters, retaining each provider-reported counter exactly. */
function nativeTokenUsageOf(row) {
  if (row?.type !== "event_msg" || row.payload?.type !== "token_count") return null;
  const usage = row.payload?.info?.total_token_usage;
  if (!usage) return null;
  return Object.fromEntries(["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"].map((field) => [field, Number.isSafeInteger(usage[field]) && usage[field] >= 0 ? usage[field] : 0]));
}

/** The privacy floor: only metadata that was already public in shape, never message/input/output text. */
function safeMetadata(row) {
  return { timestamp: row.timestamp, type: row.type, payloadType: row.payload?.type ?? null, role: row.payload?.role ?? null, name: row.payload?.name ?? null };
}

export const codexSessionTranscriptDialect = Object.freeze({
  providerId: "urn:ame:codex-session-activity-provider",
  actorUrn: "urn:ame:codex-session-activity-provider",
  defaultSessionRoot: (explicitRoot, environment = process.env) => explicitRoot ?? environment.METROPLAT_CODEX_SESSION_ROOT ?? join(homedir(), ".codex", "sessions"),
  enumerateSessionFiles: (root, fromExclusive, toInclusive) => dayShardedCandidateFiles(root, fromExclusive, toInclusive),
  rowTimestamp: (row) => row?.timestamp,
  rowKind,
  modelOf,
  tokenUsageOf,
  nativeTokenUsageOf,
  isToolCallRow,
  toolCallsOf,
  ...firstToolCallAccessors(toolCallsOf),
  toolClassPatterns: Object.freeze({ market: MARKET_PATTERN, patch: PATCH_PATTERN, exec: EXEC_PATTERN }),
  safeMetadata,
  properNoun: "Codex",
  supportsOperationsDomain: true,
  activityDisplayOrderBase: ACTIVITY_DISPLAY_ORDER_BASE,
  activityTally,
  inferenceProcessKind: "codex-inference-process",
  recordTypes: Object.freeze({
    toolObservation: TOOL_OBSERVATION_TYPE,
    toolObservationReceipt: TOOL_OBSERVATION_RECEIPT_TYPE,
  }),
  providerCells: Object.freeze({
    pulse: PULSE_PROVIDER_CELL,
    toolObservation: TOOL_OBSERVATION_PROVIDER_CELL,
  }),
});
