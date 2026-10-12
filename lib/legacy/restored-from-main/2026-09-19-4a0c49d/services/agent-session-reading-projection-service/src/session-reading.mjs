const pressureWindow = 128;
const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const evidence = (value) => array(value).filter((item) => typeof item === "string");
const includes = (value, needle) => typeof value === "string" && value.includes(needle);
const hasEvidence = (value, needles) => evidence(value?.evidence).some((item) => needles.some((needle) => item.includes(needle)));

function matchesExact(value, session, trace) {
  return value?.session === session || value?.channel === session || value?.channel === `codex:${session}` || includes(value?.trace, session) || includes(value?.trace, trace) || includes(value?.subject, session) || hasEvidence(value, [session, trace]);
}
function matchesContext(value, focus, intent, paths) {
  const body = JSON.stringify(value).toLowerCase();
  const terms = (intent ?? "").toLowerCase().split(/[^a-z0-9]+/u).filter((item) => item.length > 3);
  return (focus !== null && body.includes(focus.toLowerCase())) || terms.some((term) => body.includes(term)) || paths.some((item) => item !== "" && (body.includes(item.toLowerCase()) || evidence(value?.evidence).includes(item)));
}
function exactOrContext(values, session, trace, focus, intent, paths) {
  const exact = values.filter((value) => matchesExact(value, session, trace));
  return Object.freeze({ exact, selected: exact.length > 0 ? exact : values.filter((value) => matchesContext(value, focus, intent, paths)), mode: exact.length > 0 ? "session" : "context" });
}
function compact(value) {
  if (value === null || typeof value !== "object") return value;
  const result = { ...value };
  if (Array.isArray(result.evidence)) result.evidence = Object.freeze(result.evidence.slice(0, 4));
  if (typeof result.text === "string") { result.preview = result.text.length <= 220 ? result.text : `${result.text.slice(0, 217)}...`; delete result.text; }
  return Object.freeze(result);
}
function binding(name, values) { return Object.freeze({ name, ready: values.length > 0, evidence: Object.freeze([...new Set(values.flatMap((value) => evidence(value?.evidence)))].slice(0, 6)) }); }
function pressure(id, severity, summary, next) { return Object.freeze({ id, severity, summary, next }); }
function iface(bin, purpose, params = {}) { return Object.freeze({ bin, purpose, params: Object.freeze(params) }); }

/** Join explicit journal projections into one bounded agent-session reading. */
export function projectAgentSessionReading(sources, params = {}, options = {}) {
  if (sources === null || typeof sources !== "object") throw new TypeError("sources must be an object");
  const generatedAt = text(options.generatedAt ?? params.generatedAt) ?? new Date().toISOString();
  const session = text(params.session ?? params.session_id) ?? "unknown-session";
  const trace = text(params.trace) ?? `codex.hook:${session}`;
  const focus = text(params.focus), intent = text(params.intent ?? params.q);
  const paths = Object.freeze((Array.isArray(params.paths) ? params.paths : typeof params.paths === "string" ? params.paths.split(",") : []).map(text).filter(Boolean));
  const operations = array(sources.operations?.entries), work = array(sources.work?.items), messages = array(sources.messages?.messages), findings = array(sources.findings?.findings);
  const operationSet = exactOrContext(operations, session, trace, focus, intent, paths), workSet = exactOrContext(work, session, trace, focus, intent, paths), messageSet = exactOrContext(messages, session, trace, focus, intent, paths), findingSet = exactOrContext(findings, session, trace, focus, intent, paths);
  const admissions = array(sources.context?.admissions).filter((value) => matchesContext(value, focus, intent, paths));
  const assessments = array(sources.context?.assessments).filter((value) => matchesContext(value, focus, intent, paths));
  const checkpoints = array(sources.checkpoints?.checkpoints), latestCheckpoint = checkpoints[0] ?? null;
  const pressures = [];
  if (session === "unknown-session") pressures.push(pressure("session-unknown", "watch", "No session id was supplied.", "Pass session or session_id so the application can join evidence."));
  if (operationSet.exact.length === 0) pressures.push(pressure("operations-unbound", "watch", `Trace ${trace} has no matched operation entries.`, "Record or import an operation with the current session trace."));
  if (workSet.exact.length === 0) pressures.push(pressure("work-unbound", "watch", "No work item is bound to this session.", "Start or update work with session evidence."));
  if (messageSet.exact.length === 0) pressures.push(pressure("messages-unbound", "watch", "No message is bound to this session.", "Record a message for the session channel."));
  if (findingSet.exact.length === 0) pressures.push(pressure("findings-unbound", "watch", "No durable finding is bound to this session.", "Record a session finding."));
  if (assessments.some((item) => item.drift === true)) pressures.push(pressure("session-drift", "block", "A matched context assessment reports drift.", "Admit corrective context and reassess."));
  const recent = operationSet.exact.slice(0, pressureWindow), recentOver = recent.filter((item) => ["over", "huge"].includes(item.budgetBand));
  if (recentOver.length > 0) pressures.push(pressure("session-budget", "watch", `${recentOver.length}/${recent.length} recent matched operations exceed context budget.`, "Replace raw payloads with compact projections."));
  const base = Object.freeze({ session, trace, ...(focus === null ? {} : { focus }), ...(intent === null ? {} : { intent }) });
  return Object.freeze({
    kind: "agent-session.reading", generatedAt, domain: Object.freeze({ session, trace, focus, intent, paths }),
    codomain: Object.freeze({ ready: pressures.every((item) => item.severity !== "block"), bindings: Object.freeze([binding("operations", operationSet.exact), binding("work", workSet.exact), binding("messages", messageSet.exact), binding("findings", findingSet.exact), binding("context", [...admissions, ...assessments]), binding("checkpoint", latestCheckpoint === null ? [] : [latestCheckpoint])]), pressures: Object.freeze(pressures), nextInterfaces: Object.freeze([iface("read-session-phase", "read current phase bindings", base), iface("read-operations-ledger", "inspect operation evidence"), iface("read-messages", "inspect session messages", { channel: `codex:${session}` }), iface("create-checkpoint", "record current journal witnesses", { label: `read-session-${session}` })]) }),
    operations: Object.freeze({ total: operations.length, matched: operationSet.selected.length, exact: operationSet.exact.length, mode: operationSet.mode, entries: Object.freeze(operationSet.selected.slice(0, 8).map(compact)), totals: Object.freeze({ estimatedTokens: operationSet.selected.reduce((sum, item) => sum + (Number(item.estimatedTokens) || 0), 0), overBudgetEntries: operationSet.selected.filter((item) => ["over", "huge"].includes(item.budgetBand)).length, recentOverBudgetEntries: recentOver.length, costUsd: Math.round(operationSet.selected.reduce((sum, item) => sum + (Number(item.costUsd) || 0), 0) * 1e6) / 1e6 }) }),
    work: Object.freeze({ matched: workSet.selected.length, exact: workSet.exact.length, mode: workSet.mode, items: Object.freeze(workSet.selected.slice(0, 5).map(compact)) }),
    messages: Object.freeze({ matched: messageSet.selected.length, exact: messageSet.exact.length, mode: messageSet.mode, channels: Object.freeze(array(sources.messages?.channels).slice(0, 8).map(compact)), entries: Object.freeze(messageSet.selected.slice(-12).map(compact)) }),
    context: Object.freeze({ admissions: Object.freeze(admissions.slice(0, 4).map(compact)), assessments: Object.freeze(assessments.slice(0, 6).map(compact)) }),
    checkpoint: Object.freeze({ latest: latestCheckpoint === null ? null : compact(latestCheckpoint), count: checkpoints.length }),
    findings: Object.freeze({ matched: findingSet.selected.length, exact: findingSet.exact.length, mode: findingSet.mode, entries: Object.freeze(findingSet.selected.slice(0, 12).map(compact)), recall: Object.freeze(array(sources.findings?.recall).filter((item) => item.session === session)) }),
    stateless: Object.freeze({ claim: "session state is projected from supplied journal readings", memoryScope: "one application run", transport: "json-interface" }),
  });
}
