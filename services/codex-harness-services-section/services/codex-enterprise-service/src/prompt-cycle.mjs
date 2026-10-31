import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTOR, DEFAULT_STATE_ROOT, appendObservation, identity, readTrajectory } from "./enterprise.mjs";
import { compileCodexMapeCycle, recordCodexMapeArtifact } from "./mape-office.mjs";
import { semanticFileKey } from "./semiotic-circuit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = resolve(HERE, "../scripts/process-prompt-cycle.mjs");
const CUSTOMER = "urn:leader:emsenn";

function root(options = {}) { return resolve(options.stateRoot ?? process.env.CODEX_ENTERPRISE_STATE_ROOT ?? DEFAULT_STATE_ROOT); }
function sessionStatePath(sessionId, options = {}) { return join(root(options), "prompt-session-state", `${semanticFileKey(identity(sessionId))}.json`); }
function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is required`);
  return value;
}
function rows(options = {}) {
  return readTrajectory(options).filter((row) => row.type === "CodexLeaderPromptEvent");
}
function appendPrompt(body, options = {}) {
  return appendObservation(body, options).record;
}
function readSessionState(sessionId, options = {}) {
  const path = sessionStatePath(sessionId, options);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { generation: 0, active: null, resumable: null };
}
function writeSessionState(sessionId, state, options = {}) {
  const path = sessionStatePath(sessionId, options);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}
function activeCycle(sessionId, options = {}) {
  return readSessionState(sessionId, options).active;
}

const WORK_STATES = new Set(["open", "in-progress", "blocked", "completed", "withdrawn"]);

export function promptWorkBoard(options = {}) {
  const trajectory = readTrajectory(options);
  const prompts = rows(options);
  const compiled = new Map(trajectory.filter((row) => row.type === "PromptWorkItemsCompiled").map((row) => [row.cycle, row]));
  const superseded = new Map(trajectory.filter((row) => row.type === "PromptMapeCycleSuperseded").map((row) => [row.cycle, row]));
  const changes = trajectory.filter((row) => row.type === "PromptWorkStateChanged");
  return Object.freeze(prompts.map((prompt) => {
    const changed = changes.findLast((row) => row.cycle === prompt.cycle);
    const replaced = superseded.get(prompt.cycle);
    const state = changed?.state ?? (replaced ? "withdrawn" : "open");
    return Object.freeze({
      id: prompt.id,
      cycle: prompt.cycle,
      state,
      sessionId: prompt.sessionId,
      turnId: prompt.turnId,
      observedAt: prompt.observedAt,
      prompt: prompt.prompt,
      supersededBy: replaced?.supersededBy ?? null,
      workItems: Object.freeze(compiled.get(prompt.cycle)?.workItems ?? []),
      evidence: changed?.evidence ?? null,
      updatedAt: changed?.observedAt ?? prompt.observedAt,
    });
  }).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))));
}

export function setPromptWorkState(input, options = {}) {
  const cycle = nonempty(input.cycle, "cycle");
  const state = nonempty(input.state, "state");
  if (!WORK_STATES.has(state)) throw new TypeError(`unsupported prompt work state ${state}`);
  const prompt = rows(options).find((row) => row.cycle === cycle);
  if (!prompt) throw new TypeError(`unknown prompt work cycle ${cycle}`);
  return appendObservation({
    type: "PromptWorkStateChanged",
    actor: ACTOR,
    customer: CUSTOMER,
    cycle,
    promptEvent: prompt.id,
    state,
    issuer: nonempty(input.issuer, "issuer"),
    evidence: nonempty(input.evidence, "evidence"),
    observedAt: nonempty(input.observedAt, "observedAt"),
  }, options).record;
}

export function admitPrompt(input, options = {}) {
  const sessionId = nonempty(input.session_id, "session_id");
  const turnId = nonempty(input.turn_id, "turn_id");
  const prompt = nonempty(input.prompt ?? input.user_prompt, "prompt");
  const observedAt = (options.now ?? (() => new Date().toISOString()))();
  const sessionState = readSessionState(sessionId, options);
  const previous = sessionState.active;
  const generation = sessionState.generation + 1;
  const source = `codex-session:${sessionId}:turn:${turnId}:prompt:${identity(prompt)}`;
  const compiled = compileCodexMapeCycle({ leaderMove: { customer: CUSTOMER, desiredOutcome: prompt, source } });
  if (previous) {
    appendObservation({
      type: "PromptMapeCycleSuperseded", actor: ACTOR, sessionId, cycle: previous.cycle,
      supersededBy: compiled.id, priorTurnId: previous.turnId, correctionTurnId: turnId,
      reason: "new UserPromptSubmit arrived before the prior turn boundary; re-monitor before further execution", observedAt,
    }, options);
  }
  const promptRecord = appendPrompt({
    type: "CodexLeaderPromptEvent", actor: ACTOR, customer: CUSTOMER, sessionId, turnId,
    generation, observedAt, prompt, promptDigest: identity(prompt), interruption: previous !== null,
    supersedes: previous?.cycle ?? null, cycle: compiled.id,
  }, options);
  appendObservation({
    type: "PromptMapeCycleStarted", actor: ACTOR, customer: CUSTOMER, sessionId, turnId,
    generation, promptEvent: promptRecord.id, promptDigest: promptRecord.promptDigest,
    cycle: compiled.id, lots: compiled.lots, interruption: previous !== null,
    supersedes: previous?.cycle ?? null, observedAt,
  }, options);
  const monitorLot = compiled.lots.find((lot) => lot.skill === "monitor-leader-move");
  for (const knowledgeClass of ["LeaderMoveK", "RequirementK"]) {
    recordCodexMapeArtifact({
      cycle: compiled.id,
      workLot: monitorLot,
      skill: "monitor-leader-move",
      knowledgeClass,
      issuer: ACTOR,
      payloadDigest: compiled.move,
      sourceReceipts: [promptRecord.promptDigest, promptRecord.id],
      knowledgeReceipts: { LeaderExpressionK: promptRecord.promptDigest },
      observedAt,
    }, options);
  }
  writeSessionState(sessionId, { generation, resumable: null, active: {
    type: "PromptMapeCycleStarted", sessionId, turnId, generation, cycle: compiled.id,
    promptEvent: promptRecord.id, interruption: previous !== null, supersedes: previous?.cycle ?? null,
  } }, options);
  const placementIntent = enqueuePromptCycle(compiled.id, options);
  return Object.freeze({ promptEvent: promptRecord, cycle: compiled, placementIntent, interruption: previous !== null, supersededCycle: previous?.cycle ?? null });
}

export function enqueuePromptCycle(cycle, options = {}) {
  const selected = nonempty(cycle, "cycle");
  const start = readTrajectory(options).find((row) => row.type === "PromptMapeCycleStarted" && row.cycle === selected);
  if (!start) throw new TypeError(`unknown prompt cycle ${selected}`);
  const existing = readTrajectory(options).find((row) => row.type === "PromptResourcePlacementIntentOpened" && row.cycle === selected);
  if (existing) return existing;
  return appendObservation({
    type: "PromptResourcePlacementIntentOpened",
    version: 1,
    actor: ACTOR,
    customer: CUSTOMER,
    sessionId: start.sessionId,
    turnId: start.turnId,
    cycle: selected,
    promptEvent: start.promptEvent,
    workload: "urn:workload:codex-prompt-to-work-items",
    outputClass: "PromptWorkItemSet",
    placement: {
      executionClass: "ephemeral-cloud-runner",
      localMachineAccess: "none",
      cpu: { mode: "metered" },
      memory: { mode: "metered" },
      storage: { mode: "ephemeral", durableOutputs: ["provider-receipt", "work-item-candidate"] },
      network: { mode: "metered-egress", purpose: "inference-provider-exchange" },
      gpu: { mode: "optional-priced-offer" },
    },
    admission: "awaiting-provider-offer-settlement-and-single-use-placement-authority",
    observedAt: start.observedAt,
  }, options).record;
}

function placementAuthorityBody(authority) {
  if (authority === null || typeof authority !== "object" || Array.isArray(authority)) throw new TypeError("prompt-resource-placement-authority-required");
  return Object.fromEntries(Object.entries(authority).filter(([key]) => key !== "id"));
}

function claimPromptPlacement(cycle, authority, options = {}) {
  const body = placementAuthorityBody(authority);
  if (authority.id !== identity(body)) throw new TypeError("prompt-resource-placement-authority-identity-mismatch");
  if (body.type !== "PromptResourcePlacementAuthority" || body.version !== 1 || body.singleUse !== true) throw new TypeError("single-use-prompt-resource-placement-authority-required");
  if (body.cycle !== cycle) throw new TypeError("prompt-resource-placement-authority-cycle-mismatch");
  if (body.executionClass !== "ephemeral-cloud-runner") throw new TypeError("prompt-worker-must-run-on-ephemeral-cloud-runner");
  nonempty(body.provider, "placement authority provider");
  nonempty(body.resourceTradeReceipt, "placement authority resource trade receipt");
  const intent = readTrajectory(options).find((row) => row.type === "PromptResourcePlacementIntentOpened" && row.cycle === cycle);
  if (!intent || body.intent !== intent.id || body.workload !== intent.workload) throw new TypeError("prompt-resource-placement-authority-intent-mismatch");
  if (readTrajectory(options).some((row) => row.type === "PromptMapeCycleSuperseded" && row.cycle === cycle)) throw new TypeError("superseded-prompt-placement-refused");
  const claims = join(root(options), "prompt-placement-claims");
  mkdirSync(claims, { recursive: true });
  const claimPath = join(claims, `${semanticFileKey(authority.id)}.json`);
  try {
    writeFileSync(claimPath, `${JSON.stringify({ authority: authority.id, cycle, claimedAt: (options.now ?? (() => new Date().toISOString()))() })}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error?.code === "EEXIST") throw new TypeError("prompt-resource-placement-authority-already-consumed");
    throw error;
  }
  return appendObservation({
    type: "PromptResourcePlacementAuthorityConsumed",
    actor: ACTOR,
    cycle,
    intent: intent.id,
    authority: authority.id,
    provider: body.provider,
    resourceTradeReceipt: body.resourceTradeReceipt,
    observedAt: (options.now ?? (() => new Date().toISOString()))(),
  }, options).record;
}

export function toolUseDisposition(input, options = {}) {
  const sessionId = nonempty(input.session_id, "session_id");
  const turnId = nonempty(input.turn_id, "turn_id");
  const active = activeCycle(sessionId, options);
  const state = readSessionState(sessionId, options);
  const sessionStarts = state.generation;
  const superseded = readTrajectory(options).findLast((row) => row.type === "PromptMapeCycleSuperseded" && row.sessionId === sessionId && row.priorTurnId === turnId);
  const sameTurnCorrection = superseded && superseded.correctionTurnId === turnId && active?.turnId === turnId && active.cycle === superseded.supersededBy;
  if (superseded && !sameTurnCorrection) return Object.freeze({ allowed: false, reason: `turn ${turnId} was superseded by correction cycle ${superseded.supersededBy}; restart Monitor over the correction before tool execution` });
  if (!active && sessionStarts === 0) return Object.freeze({ allowed: true, legacySession: true });
  if (!active) {
    const resumable = state.resumable;
    if (resumable?.cycle && resumable.turnId !== turnId) {
      return Object.freeze({ allowed: true, cycle: resumable.cycle, resumedAfterBoundary: true });
    }
    return Object.freeze({ allowed: false, reason: "the persisted prompt MAPE cycle is already closed; a new prompt must be monitored before more tool execution" });
  }
  if (active.turnId !== turnId) {
    return Object.freeze({ allowed: true, cycle: active.cycle, delegatedTurn: true });
  }
  return Object.freeze({ allowed: true, cycle: active.cycle, ...(sameTurnCorrection ? { restartedGeneration: true } : {}) });
}

const NATIVE_MUTATION_TOOLS = /^(?:Agent|spawn_agent|collaboration\.spawn_agent|multi_agent_v1__spawn_agent)$/u;
const GITHUB_INDUCTION_TOOL = /^mcp__.*(?:github|software.*induction)/iu;

export function governedMutationDisposition(input) {
  const tool = String(input.tool_name ?? "unknown");
  if (GITHUB_INDUCTION_TOOL.test(tool)) return Object.freeze({ allowed: true, route: "github-software-induction" });
  if (NATIVE_MUTATION_TOOLS.test(tool)) {
    return Object.freeze({ allowed: true, route: "bounded-provider-delegation" });
  }
  if (tool === "apply_patch") {
    const patch = typeof input.tool_input === "string"
      ? input.tool_input
      : ["patch", "input", "command", "cmd"].map((key) => input.tool_input?.[key]).find((value) => typeof value === "string") ?? "";
    const paths = [
      ...patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to): ([^\n]+)$/gmu),
      ...patch.matchAll(/^(?:\+\+\+|---) [ab]\/([^\n]+)$/gmu),
    ].map((match) => match[1]);
    const workspacePrefix = "/home/emsenn/info/";
    const normalizedPaths = paths.map((path) => path.startsWith(workspacePrefix) ? path.slice(workspacePrefix.length) : path);
    const workspacePath = (path) => path.length > 0
      && !path.startsWith("/")
      && !path.split("/").some((segment) => segment === ".." || segment === ".git");
    if (normalizedPaths.length > 0 && normalizedPaths.every(workspacePath)) {
      return Object.freeze({ allowed: true, route: "leader-authorized-workspace-patch" });
    }
    return Object.freeze({ allowed: false, reason: "project filesystem mutation is disabled; submit a proposal through the admitted software-induction route" });
  }
  return Object.freeze({ allowed: true });
}

export function pausePromptCycleBoundary(input, options = {}) {
  const sessionId = nonempty(input.session_id, "session_id");
  const turnId = nonempty(input.turn_id, "turn_id");
  const active = activeCycle(sessionId, options);
  if (!active || active.turnId !== turnId) return null;
  const record = appendObservation({ type: "PromptMapeCyclePaused", actor: ACTOR, sessionId, turnId, cycle: active.cycle, boundary: input.hook_event_name, observedAt: (options.now ?? (() => new Date().toISOString()))() }, options).record;
  const state = readSessionState(sessionId, options);
  writeSessionState(sessionId, { generation: state.generation, active: null, resumable: active }, options);
  return record;
}

export function completePromptCycleBoundary(input, options = {}) {
  const sessionId = nonempty(input.session_id, "session_id");
  const turnId = nonempty(input.turn_id, "turn_id");
  const active = activeCycle(sessionId, options);
  if (!active || active.turnId !== turnId) return null;
  const record = appendObservation({ type: "PromptMapeCycleCompleted", actor: ACTOR, sessionId, turnId, cycle: active.cycle, boundary: input.hook_event_name, observedAt: (options.now ?? (() => new Date().toISOString()))() }, options).record;
  const state = readSessionState(sessionId, options);
  writeSessionState(sessionId, { generation: state.generation, active: null, resumable: active }, options);
  return record;
}

function validateWorkItems(value) {
  if (!value || !Array.isArray(value.workItems) || value.workItems.length === 0) throw new TypeError("cloud inference returned no workItems");
  return value.workItems.map((item, index) => {
    const objective = nonempty(item?.objective, `workItems[${index}].objective`);
    const desiredOutcome = nonempty(item?.desiredOutcome, `workItems[${index}].desiredOutcome`);
    if (!Array.isArray(item.completionConditions) || item.completionConditions.length === 0) throw new TypeError(`workItems[${index}].completionConditions is required`);
    const completionConditions = item.completionConditions.map((condition, at) => nonempty(condition, `workItems[${index}].completionConditions[${at}]`));
    return Object.freeze({ objective, desiredOutcome, completionConditions, dependencies: Array.isArray(item.dependencies) ? item.dependencies.map((dependency, at) => nonempty(dependency, `workItems[${index}].dependencies[${at}]`)) : [] });
  });
}

export async function processPromptCycle(cycle, options = {}) {
  const trajectory = readTrajectory(options);
  const start = trajectory.find((row) => row.type === "PromptMapeCycleStarted" && row.cycle === cycle);
  if (!start) throw new TypeError(`unknown prompt cycle ${cycle}`);
  const existing = trajectory.findLast((row) => row.type === "PromptWorkItemsCompiled" && row.cycle === cycle);
  if (existing) return Object.freeze({ disposition: "work-items-already-compiled", record: existing });
  if (trajectory.some((row) => row.type === "PromptMapeCycleSuperseded" && row.cycle === cycle)) return Object.freeze({ disposition: "superseded-before-inference", cycle });
  const placement = claimPromptPlacement(cycle, options.placementAuthority, options);
  const prompt = rows(options).find((row) => row.id === start.promptEvent);
  if (!prompt) throw new TypeError(`prompt event ${start.promptEvent} is unavailable`);
  const attemptOrdinal = trajectory.filter((row) => row.type === "PromptCloudInferenceStarted" && row.cycle === cycle).length + 1;
  const attempt = identity({ type: "PromptCloudInferenceAttempt", cycle, ordinal: attemptOrdinal });
  appendObservation({
    type: "PromptCloudInferenceStarted", actor: ACTOR, sessionId: start.sessionId, turnId: start.turnId,
    cycle, attempt, attemptOrdinal, promptEvent: start.promptEvent, placementAuthority: placement.authority,
    observedAt: (options.now ?? (() => new Date().toISOString()))(),
  }, options);
  const inference = await nonemptyInference(options.infer)(prompt, start, { attempt, signal: options.signal });
  if (readTrajectory(options).some((row) => row.type === "PromptMapeCycleSuperseded" && row.cycle === cycle)) {
    appendObservation({ type: "PromptCloudInferenceDiscarded", actor: ACTOR, sessionId: start.sessionId, turnId: start.turnId, cycle, attempt, reason: "cycle superseded while provider work was in flight", providerReceipt: inference.receipt ?? null, observedAt: (options.now ?? (() => new Date().toISOString()))() }, options);
    return Object.freeze({ disposition: "superseded-after-inference", cycle });
  }
  const workItems = validateWorkItems(inference.product).map((item, index) => Object.freeze({ id: identity({ type: "PromptWorkItem", cycle, ordinal: index, ...item }), type: "PromptWorkItem", cycle, ordinal: index, ...item, state: "pending" }));
  const record = appendObservation({
    type: "PromptWorkItemsCompiled", actor: ACTOR, customer: CUSTOMER, sessionId: start.sessionId,
    turnId: start.turnId, cycle, attempt, promptEvent: start.promptEvent, placementAuthority: placement.authority, provider: nonempty(inference.provider, "inference.provider"),
    providerReceipt: nonempty(inference.receipt, "inference.receipt"), workItems,
    observedAt: (options.now ?? (() => new Date().toISOString()))(), acceptance: "pending-codex-integration-and-customer-outcome",
  }, options).record;
  return Object.freeze({ disposition: "work-items-compiled", record });
}

export function recordPromptCycleAborted(cycle, error, options = {}) {
  const trajectory = readTrajectory(options);
  const start = trajectory.find((row) => row.type === "PromptMapeCycleStarted" && row.cycle === cycle);
  if (!start) throw new TypeError(`unknown prompt cycle ${cycle}`);
  const attempt = trajectory.findLast((row) => row.type === "PromptCloudInferenceStarted" && row.cycle === cycle)?.attempt ?? null;
  const existing = trajectory.findLast((row) => row.type === "PromptCloudInferenceAborted" && row.cycle === cycle && row.attempt === attempt);
  if (existing) return existing;
  return appendObservation({
    type: "PromptCloudInferenceAborted", actor: ACTOR, sessionId: start.sessionId, turnId: start.turnId,
    cycle, attempt, reason: error instanceof Error ? error.message : String(error),
    superseded: trajectory.some((row) => row.type === "PromptMapeCycleSuperseded" && row.cycle === cycle),
    observedAt: (options.now ?? (() => new Date().toISOString()))(),
  }, options).record;
}

export function recordPromptCycleFailure(cycle, error, options = {}) {
  const start = readTrajectory(options).find((row) => row.type === "PromptMapeCycleStarted" && row.cycle === cycle);
  if (!start) throw new TypeError(`unknown prompt cycle ${cycle}`);
  return appendObservation({
    type: "PromptCloudInferenceFailed", actor: ACTOR, sessionId: start.sessionId, turnId: start.turnId,
    cycle, errorClass: error instanceof Error ? error.name : "Error",
    errorDigest: identity(error instanceof Error ? error.message : String(error)), retry: "explicit-same-cycle-only",
    observedAt: (options.now ?? (() => new Date().toISOString()))(),
  }, options).record;
}

function nonemptyInference(infer) {
  if (typeof infer !== "function") throw new TypeError("prompt cycle requires one inference provider function");
  return infer;
}

export function readPromptEvents(options = {}) { return Object.freeze(rows(options)); }
