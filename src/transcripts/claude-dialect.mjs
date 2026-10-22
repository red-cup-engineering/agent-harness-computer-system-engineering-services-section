import { homedir } from "node:os";
import { join } from "node:path";
import { firstToolCallAccessors, flatMtimeCandidateFiles } from "./shared.mjs";

const PULSE_PROVIDER_CELL = "urn:ame:claude-session-activity-provider:pulse-provider";
const TOOL_OBSERVATION_PROVIDER_CELL = "urn:ame:claude-session-activity-provider:tool-observation";
// Minted fresh for this provider (never seen by any admission logic yet, so
// nothing prohibits it) — but shaped identically to Codex's pair so a later
// consumer that already knows how to read one knows how to read the other.
const TOOL_OBSERVATION_TYPE = "ClaudeToolInvocationObservation";
const TOOL_OBSERVATION_RECEIPT_TYPE = "ClaudeToolInvocationObservationReceipt";

// Claude's inference-market analogue: this repo's own MCP ledger/market
// servers are named mcp__<enterprise-or-market-name>__<operation>, e.g.
// mcp__bare-cedar-fog-claude-enterprise__open_claude_demand — see
// /home/emsenn/info/.mcp.json. Mirrors Codex's MARKET_PATTERN, which
// matches the Codex-side inference-work-lot-market MCP tool names.
const MARKET_PATTERN = /^mcp__.*(?:market|enterprise)__/iu;
const PATCH_PATTERN = /^(?:Edit|Write|NotebookEdit)$/u;
const EXEC_PATTERN = /^Bash$/u;

function escapedProjectDirName(repoRoot) {
  // Claude Code's own on-disk convention for a project's session directory
  // name: every run of characters outside [A-Za-z0-9_] becomes one "-".
  // Verified against /home/emsenn/.claude/projects/-home-emsenn-info for
  // repo root /home/emsenn/info.
  return repoRoot.replaceAll(/[^A-Za-z0-9_]+/gu, "-");
}

function defaultSessionRoot(repoRoot = process.cwd()) {
  return join(homedir(), ".claude", "projects", escapedProjectDirName(repoRoot));
}

/**
 * Is this row a real Leader/user-authored turn — row.message.content is the
 * plain string Claude Code writes for one — rather than a tool_result
 * carrier row? Deliberately boolean, not the text itself: nothing in this
 * seam or its collectors is permitted to read transcript text, so the
 * accessor that would tempt one to was never given a way to return it.
 */
function isPlainUserTextRow(row) {
  if (row?.type !== "user") return false;
  return typeof row.message?.content === "string";
}

/** Structural-only: does this row carry at least one tool_use-shaped block, regardless of whether it names one? */
function isToolCallRow(row) {
  if (row?.type !== "assistant") return false;
  const content = row.message?.content;
  return Array.isArray(content) && content.some((block) => block?.type === "tool_use");
}

/** Zero or more tool_use content blocks on one assistant row (a Claude row is not one-call-per-line the way Codex's is). */
function toolCallsOf(row) {
  if (row?.type !== "assistant") return [];
  const content = row.message?.content;
  if (!Array.isArray(content)) return [];
  const calls = [];
  for (const block of content) {
    if (block?.type === "tool_use" && typeof block.name === "string" && block.name.length > 0) {
      calls.push({ name: block.name, transport: "tool_use", callId: typeof block.id === "string" ? block.id : null });
    }
  }
  return calls;
}

/** Zero or more tool_result content blocks on one user row, {toolUseId, isError} only — never their content. */
function toolResultsOf(row) {
  if (row?.type !== "user") return [];
  const content = row.message?.content;
  if (!Array.isArray(content)) return [];
  const results = [];
  for (const block of content) {
    if (block?.type === "tool_result" && typeof block.tool_use_id === "string") {
      results.push({ toolUseId: block.tool_use_id, isError: block.is_error === true });
    }
  }
  return results;
}

/** Normalized classification of one transcript row, shared vocabulary across dialects where the concept transfers. */
function rowKind(row) {
  if (row?.type === "assistant") return isToolCallRow(row) ? "tool-call" : "assistant-message";
  if (row?.type === "user") {
    if (toolResultsOf(row).length > 0) return "tool-result";
    return isPlainUserTextRow(row) ? "user-message" : "other";
  }
  return "other";
}

// The base for collectColonyActivity's per-quantity displayOrder allocation
// (base+0..4 for the "work" quantities, base+10 for "politics", base+20 for
// "operations" when supported) — kept distinct per provider so a combined
// civic-pulse rendering that folds Claude and Codex quantities into one
// table never collides two providers onto the same column position.
const ACTIVITY_DISPLAY_ORDER_BASE = 150;

// Claude's built-in web tools. A direct name-set check local to this
// dialect: unlike Codex, a Claude transcript row carries no distinct
// "web-search" row kind, only an ordinary tool_use block naming one of
// these tools.
const WEB_TOOL_NAMES = new Set(["WebSearch", "WebFetch"]);

/**
 * Per-row activity tally for collectColonyActivity: how many of each
 * countable civic-pulse category this one row contributes. A completed turn
 * is an assistant row whose stop_reason is "end_turn" (Claude has no
 * distinct row kind for this, unlike Codex's "task-complete" event); a web
 * invocation is a tool call naming one of WEB_TOOL_NAMES (Claude has no
 * distinct row kind for this either, unlike Codex's "web-search-end"
 * event). Claude's transcripts carry no context-compaction signal, so
 * compactions is always 0 here — see collectColonyActivity's caller for why
 * that is a deliberate refusal, not an oversight.
 */
function activityTally(row) {
  const increment = { completedTurns: 0, toolInvocations: 0, patchInvocations: 0, webInvocations: 0, userMessages: 0, compactions: 0 };
  if (row?.type === "assistant" && row.message?.stop_reason === "end_turn") increment.completedTurns = 1;
  for (const call of toolCallsOf(row)) {
    increment.toolInvocations += 1;
    if (PATCH_PATTERN.test(call.name)) increment.patchInvocations += 1;
    if (WEB_TOOL_NAMES.has(call.name)) increment.webInvocations += 1;
  }
  if (isPlainUserTextRow(row)) increment.userMessages = 1;
  return increment;
}

function modelOf(row) {
  return row?.type === "assistant" && typeof row.message?.model === "string" ? row.message.model : null;
}

/**
 * {input, cached, output, reasoning} from an assistant row's usage block,
 * or null when the row carries none. Claude's Messages API does not report
 * a separate reasoning-token count the way Codex's total_token_usage does,
 * so reasoning is always 0 here rather than guessed.
 */
function tokenUsageOf(row) {
  if (row?.type !== "assistant") return null;
  const usage = row.message?.usage;
  if (!usage) return null;
  return {
    input: usage.input_tokens ?? 0,
    cached: (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
    output: usage.output_tokens ?? 0,
    reasoning: 0,
  };
}

/** The privacy floor: never transcript text, never tool arguments/outputs — only what shape a row already publicly carries. */
function safeMetadata(row) {
  const calls = toolCallsOf(row);
  return { timestamp: row.timestamp ?? null, type: row.type, payloadType: rowKind(row), role: row.message?.role ?? null, name: calls[0]?.name ?? null };
}

export const claudeSessionTranscriptDialect = Object.freeze({
  providerId: "urn:ame:claude-session-activity-provider",
  actorUrn: "urn:ame:claude-session-activity-provider",
  defaultSessionRoot,
  enumerateSessionFiles: (root, fromExclusive, toInclusive) => flatMtimeCandidateFiles(root, fromExclusive, toInclusive),
  rowTimestamp: (row) => row?.timestamp ?? null,
  rowKind,
  modelOf,
  tokenUsageOf,
  isToolCallRow,
  toolCallsOf,
  toolResultsOf,
  isPlainUserTextRow,
  ...firstToolCallAccessors(toolCallsOf),
  toolClassPatterns: Object.freeze({ market: MARKET_PATTERN, patch: PATCH_PATTERN, exec: EXEC_PATTERN }),
  safeMetadata,
  properNoun: "Claude",
  supportsOperationsDomain: false,
  activityDisplayOrderBase: ACTIVITY_DISPLAY_ORDER_BASE,
  activityTally,
  inferenceProcessKind: "claude-inference-process",
  recordTypes: Object.freeze({
    toolObservation: TOOL_OBSERVATION_TYPE,
    toolObservationReceipt: TOOL_OBSERVATION_RECEIPT_TYPE,
  }),
  providerCells: Object.freeze({
    pulse: PULSE_PROVIDER_CELL,
    toolObservation: TOOL_OBSERVATION_PROVIDER_CELL,
  }),
});
