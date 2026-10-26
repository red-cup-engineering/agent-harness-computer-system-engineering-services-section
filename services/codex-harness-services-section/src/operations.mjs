/**
 * The codex node micro-enterprise's service (561 Group note of 2026-09-30, "Micro-enterprises hold
 * their own work", slice 3). Its queue, its tasks' records and their sessions' artifacts live in its
 * own root, not the house root. An assignment is queued there; the node's own loop starts queued
 * tasks as its slots free, and integrates their branches as its service.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { extend, get, heads } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";
import { sessionContextImage } from "@red-cup-engineering/feltos/agents/context-image";
import { resolve as resolveAgencyRecord } from "@red-cup-engineering/organizing/agency";
import { harnessAgencyAt } from "../../../src/agency-source.mjs";
import { enterpriseRootOf, settlementsRootOf } from "@red-cup-engineering/organizing/enterprise";
import { bestStaffing, carrierStandingOf } from "@red-cup-engineering/organizing/work/staffing";
import { recordCarrierAllowance } from "../../../src/carrier/agency-carrier.mjs";
import { CODEX_WORKSPACE_RULE, codexDialect, codexWorldReading, codexTaskArtifactDirectory, codexTaskWorktree, codexTraceNamed, finishCodexWorktree, inTurn, prepareCodexWorktree, readCodexSessionArtifacts, releaseCodexWorktree, resolveCodexConflicts, retryTransientCodexSession, runCodexSession, systemdCommand, waitForCodexSession } from "./codex-exec.mjs";

const EFFECTS = { "read-only": "read-only", "repository-write": "workspace-write" };
const RANK = { queued: 0, running: 1, done: 2, failed: 2, refused: 2 };
/** The store type of a task's states: a thread per task id, each state a record. */
export const codexTaskType = "codex-task";
/** The micro-enterprise this harness is the service of; its record sits in this section's agency. */
export const CODEX_NODE = "codex-node";

function codexNodeRecord(agencyRoot, options) {
  const record = resolveAgencyRecord(harnessAgencyAt(agencyRoot, options), "enterprises", CODEX_NODE);
  if (record === undefined) throw new TypeError(`codex harness: no ${CODEX_NODE} enterprise record under ${agencyRoot}`);
  return record;
}

/** The codex node's own root, from its enterprise record. Its state is kept in the working tree
 *  (`repositoryRoot`), wherever the agency is read from. */
export function codexNodeRoot({ agencyRoot, agencySections, repositoryRoot = path.dirname(agencyRoot), environment = process.env }) {
  return enterpriseRootOf(codexNodeRecord(agencyRoot, { agencySections, environment }), { settlementsRoot: settlementsRootOf(environment), repositoryRoot });
}

const codexOutcomeOf = (task) => ({ outcome: task.state === "failed" ? "failed" : task.integration !== undefined ? "accepted" : task.state,
  ...(typeof task.model === "string" ? { carrier: task.model } : {}) });

/** The codex node's earlier attempts at a responsibility, as staffing reads them: a failed session
 *  is a miss, an integrated branch an accepted outcome, each with the carrier it ran on, the task
 *  that witnesses it, and a miss's first error. */
export function codexAttemptsAt(tasks, task) {
  return [...tasks.values()]
    .filter((other) => other.id !== task.id && other.assignment?.responsibility === task.assignment.responsibility)
    .map((other) => ({ ...codexOutcomeOf(other), witness: `codex-task:${other.id}`,
      ...(other.state === "failed" && typeof other.session?.errors?.[0] === "string" ? { error: other.session.errors[0] } : {}) }));
}

/** The node's standing of each carrier over every task it has run (work/staffing). */
export const codexCarrierStanding = (tasks) => carrierStandingOf([...tasks.values()].map(codexOutcomeOf));

/** The suit a Codex session wears for one assignment: its staff identity, the house's told fiber
 *  (read from `toldRoot`), the world, its workspace, and the assignment. */
export function codexAssignmentSuit(assignment, { toldRoot, characterName, workspace, metroplatServer }) {
  return sessionContextImage({
    dataRoot: toldRoot,
    toldBudget: 6_000,
    identity: [`You are ${characterName}, the Codex character of this machine, hired as staff by the 561 Group's Chief Technology Officer for one bounded assignment.`],
    capabilities: [codexWorldReading(metroplatServer).trim(), `Authorized effects: ${assignment.effects}`, CODEX_WORKSPACE_RULE],
    perception: [`Workspace: ${workspace}`, `Shared owner: ${assignment.owner ?? "find the existing owner before writing anything"}`],
    mission: [
      `Responsibility: ${assignment.responsibility}`,
      `Received when: ${assignment.receivingCheck}`,
      "",
      "Instruction:",
      assignment.instruction,
      "",
      "Do not commit, push or deploy: the runner commits the complete task trace from this isolated workspace after your session ends and names it a candidate to the merge queue. Never revert work you did not make.",
      "End with what you did, the exact paths you changed, and whether the receiving check passes, with its output.",
    ],
  });
}
/** Record one state of a task as the next record of the task's thread in the node's root. */
export function writeCodexTask(dataRoot, value) {
  const record = JSON.parse(JSON.stringify(value));
  extend(dataRoot, codexTaskType, record.id, record);
  return record;
}

const later = (a, b) => (a === undefined || (b.integrated ?? b.ended ?? b.started ?? b.at) > (a.integrated ?? a.ended ?? a.started ?? a.at) || ((b.integrated ?? b.ended ?? b.started ?? b.at) === (a.integrated ?? a.ended ?? a.started ?? a.at) && RANK[b.state] > RANK[a.state]) ? b : a);

/** Latest state of every task in the node's root, and in the roots it held its queue in before. */
export function readLatestCodexTasks(dataRoot, formerRoots = []) {
  const latest = new Map();
  for (const root of [...formerRoots, dataRoot]) {
    for (const { name, head } of heads(root, codexTaskType)) {
      for (const address of head.frontier) {
        const state = typeof address === "string" ? get(root, codexTaskType, address) : undefined;
        if (state === undefined) continue;
        const { causes: _causes, ...task } = state;
        latest.set(name, later(latest.get(name), task));
      }
    }
  }
  return latest;
}

/** The worker resolves its own conflicts with main: the task's session, resumed in its worktree. A
 *  session with no thread has no one to resolve them, and its trace strands as before. */
function sessionResolver(session, { dataRoot, formerRoots, task, workspace, model, codex, timeoutMs, pollIntervalMs, systemRunner }) {
  if (typeof session?.thread !== "string") return undefined;
  return ({ conflicts }) => resolveCodexConflicts({
    thread: session.thread,
    conflicts,
    artifactDir: codexTaskArtifactDirectory(dataRoot, task.id, formerRoots),
    cwd: workspace,
    taskId: task.id,
    sandbox: EFFECTS[task.assignment?.effects],
    ...(model === undefined ? {} : { model }),
    ...(codex === undefined ? {} : { codex }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
    ...(systemRunner === undefined ? {} : { systemRunner }),
  });
}

function endedTask(task, session, trace, now) {
  return { ...task, ...trace, state: session.ok ? "done" : "failed", ended: now(), session };
}

const taskReservation = (dataRoot, task, formerRoots = [], recovering = false) => ({
  id: `codex-task:${task.id}`,
  scopeKey: `codex-node:${path.resolve(dataRoot)}:${task.id}`,
  executionIdentity: task.id,
  taskId: task.id,
  artifactDir: codexTaskArtifactDirectory(dataRoot, task.id, formerRoots),
  unit: `codex-task-${task.id}`,
  ...(recovering ? { recovering: true } : {}),
});

/** Run one queued task to its end, recording running and then done or failed, or refused when no
 *  carrier is left that its misses do not already answer for. `orderChannels` is the node's own
 *  `order-channels` point (organizing/enterprise), else that axis's default. */
export async function runCodexTask({ dataRoot, formerRoots = [], toldRoot = dataRoot, task, cwd, slot, characterName = "the Codex character", metroplatServer, model, carriers = model === undefined ? [] : [model], orderChannels, codex, timeoutMs, pollIntervalMs, systemRunner, commandRunner, environment, writeTask, readTask, onSession }) {
  const write = writeTask ?? ((value) => writeCodexTask(dataRoot, value));
  // A task withdrawn while it waited for its turn does not start.
  const latest = (readTask ?? ((id) => { try { return readLatestCodexTasks(dataRoot, formerRoots).get(id); } catch { return undefined; } }))(task.id);
  if (latest !== undefined && latest.state !== "queued") return latest;
  const workspace = codexTaskWorktree(task.id, environment);
  const branch = `codex/${task.id}`;
  // The node staffs its own work: the admitted carrier its own outcomes rank best, at an effort
  // raised after each unaccepted attempt at the same responsibility. Whoever assigned the work
  // never names the model, and no record authors one.
  const history = (() => { try { return readLatestCodexTasks(dataRoot, formerRoots); } catch { return new Map(); } })();
  const attempts = codexAttemptsAt(history, task);
  const staffed = bestStaffing({ carriers, attempts, standing: codexCarrierStanding(history), orderChannels });
  // A carrier is a ribosome (work/staffing): once independent carriers have each missed this
  // responsibility its misses are the order's, and once every carrier has missed at every effort
  // none is left to raise. Either way another session would only miss again, so the node refuses
  // the task, naming each miss with its witness and error, for its assigner to complete the
  // assignment rather than retry it (work arena, fourteenth edition).
  if (staffed.exhausted === true) {
    return write({ ...task, state: "refused", ended: new Date().toISOString(), refusal: {
      kind: staffed.orderIncomplete === true ? "order-incomplete" : "staffing-exhausted", reason: staffed.reason,
      misses: attempts.filter((attempt) => attempt.outcome === "failed" || attempt.outcome === "rejected") } });
  }
  const sessionModel = staffed.carrier ?? model;
  const reasoningEffort = staffed.effort;
  const suit = codexAssignmentSuit(task.assignment, { toldRoot, characterName, workspace, metroplatServer });
  const running = write({ ...task, state: "running", started: new Date().toISOString(), slot, workspace, branch, suit: suit.id, ...(sessionModel === undefined ? {} : { model: sessionModel }), staffing: { ...(staffed.carrier === undefined ? {} : { carrier: staffed.carrier }), effort: reasoningEffort, reason: staffed.reason } });
  let prepared = false;
  let session;
  try {
    await prepareCodexWorktree({ cwd, taskId: task.id, effects: task.assignment.effects, commandRunner, environment });
    prepared = true;
    session = await runCodexSession({
      prompt: suit.text,
      cwd: workspace,
      artifactDir: codexTaskArtifactDirectory(dataRoot, task.id, formerRoots),
      taskId: task.id,
      sandbox: EFFECTS[task.assignment.effects],
      ...(sessionModel === undefined ? {} : { model: sessionModel }),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      ...(metroplatServer === undefined ? {} : { requiredMcpServer: metroplatServer }),
      ...(codex === undefined ? {} : { codex }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
      ...(systemRunner === undefined ? {} : { systemRunner }),
      ...(onSession === undefined ? {} : { onSession }),
    });
  } catch (error) {
    session = { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  recordCarrierAllowance({ dialect: codexDialect, session, consumer: "codex-node:task", environment: environment ?? process.env });
  let trace = { branch, slot, workspace, changedPaths: Object.freeze([]) };
  if (prepared) {
    try {
      trace = await finishCodexWorktree({ workspace, branch, taskId: task.id, responsibility: task.assignment.responsibility, resolve: sessionResolver(session, { dataRoot, formerRoots, task, workspace, model: sessionModel, codex, timeoutMs, pollIntervalMs, systemRunner }), commandRunner });
      trace = { ...trace, slot, workspace };
    } catch (error) {
      session = { ...session, ok: false, errors: [...(session.errors ?? []), `task-trace: ${error instanceof Error ? error.message : String(error)}`] };
    }
  }
  // The worktree has served: removed once the change is named a candidate, kept (the last few) when the task failed.
  if (prepared) {
    try { await releaseCodexWorktree({ cwd, workspace, taskId: task.id, failed: !session.ok || !codexTraceNamed(trace), commandRunner, environment }); }
    catch (error) { session = { ...session, errors: [...(session.errors ?? []), `task-worktree: ${error instanceof Error ? error.message : String(error)}`] }; }
  }
  return write(endedTask(running, session, trace, () => new Date().toISOString()));
}

/**
 * Resolve journal rows left queued or running across a node restart. A queued task whose session
 * never started (no artifact directory) is started now, in turn: the queue lived in the old process,
 * the assignment in the journal. Work that did start, with no live unit and no completion marker, is
 * failed, never silently submitted again.
 */
export async function recoverCodexTasks({ dataRoot, formerRoots = [], toldRoot = dataRoot, cwd, characterName, metroplatServer, model, orderChannels, codex, timeoutMs, pollIntervalMs, systemRunner = systemdCommand, commandRunner, environment, latestTasks, writeTask, now = () => new Date().toISOString() }) {
  const latest = latestTasks ?? readLatestCodexTasks(dataRoot, formerRoots);
  const write = writeTask ?? ((value) => writeCodexTask(dataRoot, value));
  const recovered = [];
  // Reserve every recorded running slot before a formerly queued task can claim a free one.
  const candidates = [...latest.values()].filter((task) => task.state === "queued" || task.state === "running")
    .sort((left, right) => Number(right.state === "running") - Number(left.state === "running"));
  for (const task of candidates) {
    const directory = codexTaskArtifactDirectory(dataRoot, task.id, formerRoots);
    if (task.state === "queued" && !existsSync(directory)) {
      recovered.push(inTurn((slot, hooks) => runCodexTask({ dataRoot, formerRoots, toldRoot, task, cwd, slot, characterName, metroplatServer, model, orderChannels, codex, timeoutMs, pollIntervalMs, systemRunner, commandRunner, environment, writeTask: write,
        readTask: id => readLatestCodexTasks(dataRoot, formerRoots).get(id), onSession: hooks.onSession }),
        { environment, reservation: taskReservation(dataRoot, task, formerRoots), systemRunner }));
      continue;
    }
    recovered.push(inTurn(async (_slot, hooks) => {
      // A different recovery claimant may have finished while this contender waited for
      // the shared provider slot. Consume that durable terminal row instead of replaying the
      // stale candidate captured at the start of this recovery pass.
      const current = readLatestCodexTasks(dataRoot, formerRoots).get(task.id);
      if (current === undefined || !["queued", "running"].includes(current.state)) return current;
      const activeTask = current;
      const exitFile = path.join(directory, "exit-code");
      let session;
      if (existsSync(exitFile)) {
        session = readCodexSessionArtifacts(directory);
      } else if (existsSync(directory)) {
        const unit = `codex-task-${task.id}`;
        const active = await systemRunner("systemctl", ["--user", "is-active", "--quiet", unit], {});
        if (active.exitCode === 0) {
          session = await waitForCodexSession({
            artifactDir: directory,
            unit,
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
            ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
            systemRunner,
            onSession: hooks.onSession,
          });
        }
      }
      // A session the provider stopped for want of room is carried on, even across the restart.
      // Only in the task's own worktree: with none left to run in, the session stays as it ended.
      const sessionCwd = typeof activeTask.workspace === "string" && existsSync(activeTask.workspace) ? activeTask.workspace : undefined;
      if (session !== undefined && sessionCwd !== undefined) session = await retryTransientCodexSession(session, { artifactDir: directory, cwd: sessionCwd, taskId: activeTask.id, sandbox: EFFECTS[activeTask.assignment?.effects], model: activeTask.model ?? model, codex, timeoutMs, pollIntervalMs, systemRunner, onSession: hooks.onSession });
      if (session === undefined) session = Object.freeze({ ok: false, errors: Object.freeze(["interrupted: the node restarted before the session started"]) });
      let trace = { branch: activeTask.branch, slot: activeTask.slot, workspace: activeTask.workspace, changedPaths: Object.freeze([]) };
      if (typeof activeTask.workspace === "string" && typeof activeTask.branch === "string") {
        try {
          trace = { ...(await finishCodexWorktree({ workspace: activeTask.workspace, branch: activeTask.branch, taskId: activeTask.id, responsibility: activeTask.assignment.responsibility, resolve: sessionResolver(session, { dataRoot, formerRoots, task: activeTask, workspace: activeTask.workspace, model: activeTask.model ?? model, codex, timeoutMs, pollIntervalMs, systemRunner }), commandRunner })), slot: activeTask.slot, workspace: activeTask.workspace };
        } catch (error) {
          session = { ...session, ok: false, errors: [...(session.errors ?? []), `task-trace: ${error instanceof Error ? error.message : String(error)}`] };
        }
        if (existsSync(activeTask.workspace)) {
          try { await releaseCodexWorktree({ cwd, workspace: activeTask.workspace, taskId: activeTask.id, failed: !session.ok || !codexTraceNamed(trace), commandRunner, environment }); }
          catch (error) { session = { ...session, errors: [...(session.errors ?? []), `task-worktree: ${error instanceof Error ? error.message : String(error)}`] }; }
        }
      }
      return write(endedTask(activeTask, session, trace, now));
    }, { ...(Number.isInteger(task.slot) ? { slot: task.slot } : {}), environment,
      reservation: taskReservation(dataRoot, task, formerRoots, true), systemRunner }));
  }
  return Object.freeze(await Promise.all(recovered));
}

function compactStatus(task, full) {
  if (task === undefined) return undefined;
  if (full === true) return task;
  const { assignment, ...status } = task;
  return { ...status, ...(assignment === undefined ? {} : { assignment: { responsibility: assignment.responsibility } }) };
}

/** Keys by which an assigner would name the doer. The node derives its staffing; it refuses them. */
const DOER_KEYS = ["scale", "model", "effort", "reasoningEffort", "provider", "carrier"];

/** Admit the one assignment shape shared by MetroPlat and an A2A ROLE_USER message. */
export function codexAssignment(value) {
  const record = value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  const text = (field) => {
    const found = record[field];
    if (typeof found !== "string" || found.trim() === "") throw new TypeError(`codex-task: ${field} is required`);
    return found.trim();
  };
  const effects = record.effects ?? "repository-write";
  if (!(effects in EFFECTS)) throw new TypeError("codex-task: effects is read-only or repository-write");
  const prescribed = DOER_KEYS.filter((key) => key in record);
  if (prescribed.length > 0) throw new TypeError(`codex-task: an assignment says what is wanted, never who carries it (${prescribed.join(", ")}); the codex node staffs its own work`);
  return Object.freeze({
    instruction: text("instruction"),
    responsibility: text("responsibility"),
    receivingCheck: text("receivingCheck"),
    effects,
    ...(typeof record.owner === "string" && record.owner.trim() !== "" ? { owner: record.owner.trim() } : {}),
  });
}

/** Queue one assignment in the codex node's root. Nothing starts it here: the node's loop does. */
export function queueCodexTask({ dataRoot, assignment: source, assignedBy = null, writeTask } = {}) {
  const write = writeTask ?? ((value) => writeCodexTask(dataRoot, value));
  return write({ kind: "codex-task", id: randomUUID(), state: "queued", assignedBy, at: new Date().toISOString(), assignment: codexAssignment(source) });
}

const turning = new Map();

/**
 * One turn of the codex node's loop over its own root: the node, not the caller of `codex-task`,
 * decides when a queued task takes one of its slots. Its first turn in a process recovers what an
 * earlier process left queued or running, in its root and the roots it held its queue in before;
 * every later turn starts the tasks queued since, each in turn for a free slot.
 */
export function turnCodexNode(spec) {
  const { dataRoot, formerRoots = [], environment } = spec;
  const write = spec.writeTask ?? ((value) => writeCodexTask(dataRoot, value));
  const held = turning.get(dataRoot);
  if (held === undefined) {
    const latest = readLatestCodexTasks(dataRoot, formerRoots);
    const open = [...latest.values()].filter((task) => task.state === "queued" || task.state === "running").map((task) => task.id);
    turning.set(dataRoot, new Set(open));
    recoverCodexTasks({ ...spec, latestTasks: latest, writeTask: write })
      .catch((error) => process.stderr.write(`[codex-node] recovery failed: ${error?.stack ?? error}\n`));
    return Object.freeze({ kind: "codex-node-turn", root: dataRoot, recovered: Object.freeze(open), started: Object.freeze([]) });
  }
  const started = [];
  for (const task of readLatestCodexTasks(dataRoot).values()) {
    if (task.state !== "queued" || held.has(task.id)) continue;
    held.add(task.id);
    started.push(task.id);
    inTurn((slot, hooks) => runCodexTask({ ...spec, task, slot, writeTask: write, onSession: hooks.onSession }),
      { environment, reservation: taskReservation(dataRoot, task, spec.formerRoots ?? []), systemRunner: spec.systemRunner })
      .catch((error) => write({ ...task, state: "failed", ended: new Date().toISOString(), session: { ok: false, errors: [`recording: ${error instanceof Error ? error.message : String(error)}`] } }));
  }
  return Object.freeze({ kind: "codex-node-turn", root: dataRoot, recovered: Object.freeze([]), started: Object.freeze(started) });
}

/** The codex node's operations over `spec`, or over the spec `spec()` gives when one first runs, so
 *  declaring the family reads nothing. */
export function codexTaskOperations(spec = {}) {
  let resolved;
  const node = () => resolved ??= (typeof spec === "function" ? spec() : spec);
  const read = (id) => readLatestCodexTasks(node().dataRoot, node().formerRoots ?? []).get(id);
  return Object.freeze([
    operation({
      verb: "codex-task", inputFormat: "json", outputFormat: "json",
      summary: "Queue one bounded assignment with the codex node; returns its task id at once.",
      description: "Domain: { instruction, responsibility, receivingCheck, owner?, effects?: \"read-only\" | \"repository-write\" }. The assignment never names a model, scale or effort: the codex node staffs its own work from its ladder, starting at the cheapest rung and raising it after each unaccepted attempt at the same responsibility. Once independent carriers have each missed the responsibility, or every carrier every effort, the task ends refused, its refusal naming each miss: the assignment is incomplete, and is completed rather than queued again. The task is held in the codex node's own root; the node's loop starts it in an isolated worktree slot when one is free. Read it with codex-task-status.",
      run: async (input, _args, context) => {
        const task = queueCodexTask({ dataRoot: node().dataRoot, assignment: input, assignedBy: context?.invocation?.subject ?? null });
        return { id: task.id, state: task.state };
      },
    }),
    operation({
      verb: "codex-node-turn", inputFormat: "json", outputFormat: "json",
      summary: "Turn the codex node's own loop once: recover, then start queued tasks as slots free.",
      description: "Domain: { orderChannels? }. The codex node micro-enterprise's loop runs this every turn, giving the node its own calibrations: orderChannels is its order-channels point, how many carriers of different models missing one task make the miss its order's. The first turn in a process recovers tasks an earlier process left queued or running; later turns start each newly queued task in turn for a free slot. Returns the task ids recovered or started.",
      relation: "boundary",
      effects: { class: "external", replay: "coordinated", coordination: "coordination-required", deterministic: "unmeasured", totality: "partial" },
      // The node's calibrations are its own points, given by the loop that turns it.
      run: async (input) => turnCodexNode({ ...node(), ...(Number.isInteger(input?.orderChannels) && input.orderChannels > 0 ? { orderChannels: input.orderChannels } : {}) }),
    }),
    operation({
      verb: "codex-task-withdraw", inputFormat: "json", outputFormat: "json",
      summary: "Withdraw a Codex assignment that is still queued, so it never starts.",
      description: "Domain: { id }. Only a queued task can be withdrawn; a running or ended one is refused. The task's record ends as withdrawn.",
      run: async (input, _args, context) => {
        const task = read(String(input?.id ?? ""));
        if (task === undefined) throw new TypeError("codex-task-withdraw: no such task");
        if (task.state !== "queued") throw new TypeError(`codex-task-withdraw: task is ${task.state}; only a queued task can be withdrawn`);
        const withdrawn = writeCodexTask(node().dataRoot, { ...task, state: "withdrawn", ended: new Date().toISOString(), withdrawnBy: context?.invocation?.subject ?? null });
        return compactStatus(withdrawn);
      },
    }),
    operation({
      verb: "codex-task-status", inputFormat: "json", outputFormat: "json",
      summary: "Read one Codex assignment: its state and, when ended, the session's thread, final message and usage.",
      description: "Domain: { id, full?: boolean }. The compact default returns responsibility but omits the full instruction.",
      run: async (input) => {
        return compactStatus(read(String(input?.id ?? "")), input?.full) ?? { id: input?.id ?? null, state: "unknown" };
      },
    }),
    operation({
      verb: "codex-task-integrate", inputFormat: "json", outputFormat: "json",
      summary: "Name one completed Codex task branch to the node's merge queue as a candidate.",
      description: "Domain: { id, message? }. The codex node's integration service for its own tasks. A conflicting branch is refused without changing main. A named branch is recorded on the task as queued, with its candidate { name, commit } and branch head; the merge queue's verdict (under the node's queue/verdicts) decides whether it lands.",
      run: async (input) => {
        const task = read(String(input?.id ?? ""));
        if (task === undefined) throw new TypeError("codex-task-integrate: no such task");
        if (task.integration !== undefined) return compactStatus(task, input?.full);
        if ((task.state !== "done" && task.state !== "failed") || typeof task.commit !== "string" || typeof task.branch !== "string") throw new TypeError(`codex-task-integrate: task ${task.state} has no committed trace`);
        const requestedMessage = input?.message;
        if (requestedMessage !== undefined && (typeof requestedMessage !== "string" || requestedMessage.trim() === "")) throw new TypeError("codex-task-integrate: message must be non-empty when supplied");
        const { dataRoot, cwd, integrateBranch } = node();
        const integrate = integrateBranch ?? (await import("@red-cup-engineering/computer-systems-fabrication-engineering-services-section/git/operations")).integrateGitBranch;
        const result = await integrate({ packageRoot: cwd, dataRoot }, {
          branch: task.branch,
          message: requestedMessage?.trim() ?? `Integrate Codex task ${task.id}: ${task.assignment.responsibility}`,
        });
        if (!result.ok) return result;
        // Integration names a candidate to the merge queue: the task is queued, not yet integrated.
        const queued = result.phase === "queued";
        const recorded = writeCodexTask(dataRoot, {
          ...task,
          ...(queued ? { queued: new Date().toISOString() } : { integrated: new Date().toISOString() }),
          integration: {
            ...(queued ? { phase: "queued", candidate: result.candidate, branchHead: result.branchHead, ...(result.changes === undefined ? {} : { changes: result.changes }) }
              : { head: result.head, refreshedPaths: result.refreshedPaths, skippedPaths: result.skippedPaths }),
          },
        });
        return compactStatus(recorded, input?.full);
      },
    }),
  ]);
}

/**
 * The codex node's service as a MetroPlat instance declares it: `(binding, options)` read from the
 * node's environment. The binding is the house root the family is installed on; the node keeps its
 * queue in its own root and reads the house root only as the root its queue was held in before, and
 * for the house's told fiber its sessions wear. The workspace falls back to `workspace`.
 */
export function codexNodeOptions(binding, { environment = process.env, workspace = process.cwd() } = {}) {
  const house = path.resolve(binding.dataRoot);
  const agencyRoot = binding.agencyRoot ?? environment.METROPLAT_AGENCY_ROOT ?? path.join(environment.METROPLAT_REPOSITORY_ROOT ?? workspace, "lib");
  const dataRoot = codexNodeRoot({ agencyRoot, agencySections: binding.agencySections, repositoryRoot: environment.METROPLAT_REPOSITORY_ROOT ?? workspace, environment });
  return {
    dataRoot,
    formerRoots: dataRoot === house ? [] : [house],
    toldRoot: house,
    cwd: environment.METROPLAT_CODEX_WORKSPACE ?? workspace,
    characterName: environment.METROPLAT_CODEX_CHARACTER_NAME ?? "the Codex character",
    ...(environment.METROPLAT_CODEX_MCP_SERVER ? { metroplatServer: environment.METROPLAT_CODEX_MCP_SERVER } : {}),
    environment,
    // No deployment names the model: an allocation carries its derived carrier, and the session observes the one that ran.
    ...(environment.METROPLAT_CODEX_BIN ? { codex: environment.METROPLAT_CODEX_BIN } : {}),
  };
}

/** Declare the codex node's service without starting tasks or reading the agency or its state. */
export function codexHarnessOperations(binding, options) {
  return codexTaskOperations(() => codexNodeOptions(binding, options));
}
