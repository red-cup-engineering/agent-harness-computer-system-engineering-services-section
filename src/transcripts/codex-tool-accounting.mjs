/** Privacy-safe projection of transient native Codex transcript rows. */
const CALL_TYPES = new Set(["custom_tool_call", "function_call"]);
const RESULT_TYPES = new Set(["custom_tool_call_output", "function_call_output"]);
const callId = (payload) => typeof payload?.call_id === "string" && payload.call_id ? payload.call_id : typeof payload?.callId === "string" && payload.callId ? payload.callId : null;
function bytes(value) { if (typeof value === "string") return Buffer.byteLength(value); if (value === undefined) return 0; try { return Buffer.byteLength(JSON.stringify(value)); } catch { return 0; } }
function failed(value) { let candidate = value; if (typeof candidate === "string") { try { candidate = JSON.parse(candidate); } catch { return false; } } if (candidate === null || typeof candidate !== "object") return false; const exit = candidate.exit_code ?? candidate.exitCode; return candidate.isError === true || candidate.success === false || candidate.failed === true || (Number.isFinite(Number(exit)) && Number(exit) !== 0); }
function counts() { return { calls: 0, results: 0, missingResults: 0, failures: 0, waits: 0, retries: 0, outputBytes: 0 }; }

/**
 * Correlate result rows only by native `call_id`, then emit aggregate evidence.
 * Same-named calls after an observable failure are heuristic retries, never an
 * assertion of user intent or avoidability. Raw arguments, outputs, call IDs,
 * names, paths, prompts, and secrets are discarded before the return boundary.
 */
export function projectCodexToolAccounting(rows, { turnId = null } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("Codex tool accounting needs transcript rows");
  const turns = new Map(); let active = null;
  const ensure = (id, state = "interrupted") => { if (!turns.has(id)) turns.set(id, { id, state, calls: new Map(), orphanResults: 0, malformedCalls: 0 }); return turns.get(id); };
  for (const row of rows) {
    const payload = row?.payload ?? {};
    if (row?.type === "event_msg" && payload.type === "task_started" && typeof payload.turn_id === "string") { active = payload.turn_id; ensure(active); continue; }
    if (row?.type === "event_msg" && (payload.type === "task_complete" || payload.type === "turn_aborted") && typeof payload.turn_id === "string") { const turn = ensure(payload.turn_id); turn.state = payload.type === "task_complete" ? "completed" : "interrupted"; if (active === payload.turn_id) active = null; continue; }
    if (active === null || (turnId !== null && active !== turnId) || row?.type !== "response_item") continue;
    const turn = ensure(active);
    if (CALL_TYPES.has(payload.type)) { const id = callId(payload); if (id === null) turn.malformedCalls += 1; else turn.calls.set(id, { name: typeof payload.name === "string" ? payload.name : null, status: payload.status, result: null }); }
    if (RESULT_TYPES.has(payload.type)) { const id = callId(payload), call = id === null ? null : turn.calls.get(id); if (call === undefined || call === null) turn.orphanResults += 1; else call.result = { bytes: bytes(payload.output), failed: failed(payload.output) }; }
  }
  return Object.freeze({ type: "CodexToolAccounting", turns: Object.freeze([...turns.values()].filter((turn) => turnId === null || turn.id === turnId).map((turn) => {
    const aggregate = counts(), failedNames = new Set();
    for (const call of turn.calls.values()) { aggregate.calls += 1; const failure = ["failed", "error", "cancelled"].includes(call.status) || call.result?.failed === true; if (call.result) { aggregate.results += 1; aggregate.outputBytes += call.result.bytes; } else aggregate.missingResults += 1; if (failure) { aggregate.failures += 1; if (call.name) failedNames.add(call.name); } else if (call.name && failedNames.has(call.name)) aggregate.retries += 1; if (call.name && /(?:^|[_./-])wait(?:[_./-]|$)|wait_threads/u.test(call.name)) aggregate.waits += 1; }
    return Object.freeze({ turnId: turn.id, state: turn.state, counts: Object.freeze(aggregate), observation: Object.freeze({ callsWithNativeId: aggregate.calls, resultsCorrelatedByCallId: aggregate.results, resultsWithoutObservedCall: turn.orphanResults, malformedCallRows: turn.malformedCalls, coverage: aggregate.calls === 0 ? "no-tool-calls-observed" : aggregate.results === aggregate.calls ? "complete-for-observed-calls" : "partial-for-observed-calls" }), heuristicAvoidability: Object.freeze({ retries: aggregate.retries, label: "heuristic: later same-named call after observable failure; no intent or avoidability conclusion" }), privacy: Object.freeze({ transcriptRetained: false, rawPromptsRetained: false, rawToolOutputRetained: false, callIdsRetained: false }) });
  })) });
}
