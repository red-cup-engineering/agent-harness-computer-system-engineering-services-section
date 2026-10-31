// Recovered native tool accounting: bounded read of source observed by the CLI carrier.
// The full provider-neutral transcript dialects are services/session-transcript-dialects.
// Only structural counts leave this module, never prompt, arguments, outputs, paths, or call ids.
import { lstatSync, readFileSync } from "node:fs";
import { projectCodexToolAccounting } from "./codex-tool-accounting.mjs";

export const DEFAULT_ACCOUNTING_MAX_BYTES = 4 * 1024 * 1024;

/** Native identity and mutation coordinates for reusing a completed transcript read. */
export function nativeTranscriptFingerprint(stat) {
  const fields = ["dev", "ino", "size", "mtimeMs", "ctimeMs"];
  if (!stat || !fields.every((field) => Number.isFinite(stat[field]))) return undefined;
  return Object.fromEntries(fields.map((field) => [field, stat[field]]));
}

export function sameNativeTranscript(left, right) {
  return left !== undefined && right !== undefined
    && ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((field) => Number.isFinite(left[field]) && left[field] === right[field]);
}
export function projectClaudeToolAccounting(rows) {
  if (!Array.isArray(rows)) throw new TypeError("Claude tool accounting needs transcript rows");
  const calls = new Map(), errorsByName = new Set(), orphans = new Set();
  let malformedCallRows = 0;
  for (const row of rows) {
    if (row?.isSidechain === true) continue;
    for (const block of row?.type === "assistant" && Array.isArray(row.message?.content) ? row.message.content : []) {
      if (block?.type !== "tool_use" || typeof block.name !== "string" || block.name.length === 0) continue;
      const call = { name: block.name, callId: typeof block.id === "string" ? block.id : null };
      if (!call.callId) { malformedCallRows++; continue; }
      if (!calls.has(call.callId)) calls.set(call.callId, { name: call.name, result: false, failed: false, bytes: 0, retry: errorsByName.has(call.name) });
    }
    if (row?.type !== "user" || !Array.isArray(row.message?.content)) continue;
    for (const block of row.message.content) {
      if (block?.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
      const call = calls.get(block.tool_use_id);
      if (!call) { orphans.add(block.tool_use_id); continue; }
      if (call.result) continue;
      call.result = true; call.failed = block.is_error === true;
      call.bytes = Buffer.byteLength(typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""));
      if (call.failed) errorsByName.add(call.name);
    }
  }
  const counts = { calls: calls.size, results: 0, missingResults: 0, failures: 0, waits: 0, retries: 0, outputBytes: 0 };
  for (const call of calls.values()) {
    if (call.result) { counts.results++; counts.outputBytes += call.bytes; } else counts.missingResults++;
    if (call.failed) counts.failures++;
    if (call.retry) counts.retries++;
    if (/(?:^|[_./-])wait(?:[_./-]|$)|wait_threads/u.test(call.name)) counts.waits++;
  }
  return Object.freeze({ type: "ClaudeToolAccounting", counts: Object.freeze(counts),
    observation: Object.freeze({ callsWithNativeId: counts.calls, resultsCorrelatedByCallId: counts.results,
      resultsWithoutObservedCall: orphans.size, malformedCallRows,
      coverage: counts.calls === 0 ? "no-tool-calls-observed" : counts.calls === counts.results ? "complete-for-observed-calls" : "partial-for-observed-calls" }),
    heuristicAvoidability: Object.freeze({ retries: counts.retries, label: "heuristic only; not proof of avoidable work" }),
    privacy: Object.freeze({ transcriptRetained: false, rawPromptsRetained: false, rawToolOutputRetained: false, callIdsRetained: false }) });
}
export function observeNativeToolAccounting({ runtime, evidence, before = Infinity, maxBytes = DEFAULT_ACCOUNTING_MAX_BYTES } = {}) {
  if (runtime !== "claude" && runtime !== "codex") throw new TypeError("unknown transcript dialect");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("maxBytes must be positive");
  const providerId = runtime === "claude" ? "urn:ame:claude-session-activity-provider" : "urn:ame:codex-session-activity-provider";
  const unavailable = (reason, details = {}) => Object.freeze({ type: "NativeToolAccountingObservation", provider: providerId, status: "unavailable", reason, ...details });
  if (typeof evidence !== "string" || !evidence.includes("#")) return unavailable("missing-observed-source");
  const source = evidence.slice(0, evidence.lastIndexOf("#"));
  if (!source.endsWith(".jsonl")) return unavailable("not-a-native-transcript");
  try {
    const st = lstatSync(source);
    if (!st.isFile() || st.isSymbolicLink()) return unavailable("non-regular-file");
    if (st.size > maxBytes) return unavailable("bounded-read-exceeded", { sourceBytes: st.size, maxBytes });
    const rows = []; let malformedRows = 0;
    for (const line of readFileSync(source, "utf8").split(/\r?\n/u)) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { malformedRows++; continue; }
      const at = Date.parse(row?.timestamp);
      if (Number.isFinite(at) && at <= before) rows.push(row);
    }
    return Object.freeze({ type: "NativeToolAccountingObservation", provider: providerId, status: "observed",
      sourceBytes: st.size, observedRows: rows.length, malformedRows,
      accounting: runtime === "codex" ? projectCodexToolAccounting(rows) : projectClaudeToolAccounting(rows) });
  } catch (error) { return unavailable(error?.code === "ENOENT" ? "missing-native-transcript" : "native-transcript-unreadable"); }
}
