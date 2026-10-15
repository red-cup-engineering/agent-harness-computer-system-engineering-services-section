import { skillError, skillSuccess } from "@red-cup-engineering/animating/becoming/doing/working/governing/skill";
import { skillResultSchema } from "@red-cup-engineering/animating/becoming/doing/working/governing/carriers";
import { admitAgencyWorkResult, workResultFromSkillResult } from "@red-cup-engineering/organizing/work/schema";
import { RECEIVING_DECISIONS, RECEIVING_JUDGEMENT_SHAPE, receivingJudgementMeaning } from "./receiving-judgement.mjs";
export { RECEIVING_DECISIONS, RECEIVING_JUDGEMENT_SCHEMA, receivingJudgementMeaning } from "./receiving-judgement.mjs";

/**
 * The carrier contract of the work rail: a ready office duty allocated to a harness character is
 * done by one agent-CLI session on this machine, whichever CLI carries it (a dialect of
 * `carrier/session.mjs`). Same contract as FeltOS's agency work provider, in five parts:
 *
 *   execution  the session runs the allocated duty's method in its own durable task directory,
 *              under a host-wide provider lease, and its last message is the typed outcome the rail
 *              admits as a proposal (`execute(item)`, `completed`, `recover`, `session`);
 *   authority  the session is told it serves the allocated office, and only that office's
 *              delegated method resources, under the allocation's office-service envelope; the
 *              harness may also project the office itself (its own `sessionOptions`);
 *   receiving  an independent receiver's direct act on an immutable proposal, read-only, returning
 *              a typed judgement the host admits into the root that owns the proposal (`receive`);
 *   accounting the observed carrier (model and effort its native session records), its evidence and
 *              the token usage the work consumed, carried on the proposal;
 *   allowance  the provider's host-wide lease (`reserve`/`release`), and the harness's own draw on
 *              its subscription allowance where it has one (`sessionOptions` and `onOutcome`).
 *
 * The micro-enterprise holding the work keeps it in its own root; the session's artifacts are the
 * carrier node's, in its root (`dataRoot`), found in a former root when an earlier session left them there.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { allowanceLedgerPath, recordAllowanceEvidence } from "@red-cup-engineering/computer-inference-engine/media/allowance-ledger";
import { subscriptionAllowance, subscriptionReadings } from "@red-cup-engineering/computer-inference-engine/media/subscription-allowances";
import { sessionContextImage } from "@red-cup-engineering/feltos/agents/context-image";
import { tokenUsageResources } from "@red-cup-engineering/organizing/enterprise/resources";

import {
  harnessTaskArtifactDirectory, inProviderTurn, readHarnessSessionArtifacts, recoverHarnessSession, releaseProviderTurn,
  reserveProviderTurn, retryableHarnessSession, retryTransientHarnessSession, runHarnessSession, runReservedProviderTurn, waitForHarnessSession,
} from "./session.mjs";

/** The typed outcome every carrier's last message is: a skill result or a skill error. */
export const AGENCY_OUTCOME_SHAPE = `${JSON.stringify(workResultFromSkillResult(skillSuccess({ output: "your actual method output and evidence" })))} when the invocation produces its declared output; otherwise ${JSON.stringify(workResultFromSkillResult(skillError("Unresolvable", "precise unmet condition and accountable owner", "the allocated work scope")))}. Preserve the actual native outcome and use its matching error class and reading; independent receiving decides fulfillment`;

/** The JSON Schema of that outcome, its value typed by the work item's `returns` where it declares
 *  one: the response constraint a carrier that validates output holds its session to. One object,
 *  since a CLI's structured-output tool takes an object schema; which of value and error the kind
 *  requires is checked when the outcome is read. */
export function agencyOutcomeSchema(returns) {
  return Object.freeze({
    type: "object",
    properties: { kind: { enum: ["skill-result", "skill-error"] }, value: returns ?? { type: "object" }, error: { type: "string", minLength: 1 }, skillOutcome: skillResultSchema },
    required: ["kind", "skillOutcome"],
    additionalProperties: false,
  });
}

const RECEIVING_ATTEMPTS = 4;
const RECEIVING_RETRY_MS = 10 * 60_000;

/** How a carrier's session is told to reach this node's MetroPlat: its harness's own names for the
 *  server's connect and command tools. */
function worldAccess(dialect, server) {
  return server === undefined ? undefined
    : Object.freeze({ connect: dialect.toolName(server, "metroplat_world-connect"), command: dialect.toolName(server, "metroplat_world-command") });
}

/** The suit a carrier session wears for one duty: the duty in the rail's own terms, the house's told
 *  fiber (read from `toldRoot`), and where the Group's knowledge is. */
export function agencyWorkSuit(item, { dialect, toldRoot, characterName, nodeName, mcpServer, enterprise, workspaceRule = dialect.workspaceRule }) {
  const workPrefix = enterprise === undefined ? "" : `@${enterprise} `;
  const access = worldAccess(dialect, mcpServer);
  const boardMethods = new Set((item.methodResources ?? []).map((resource) => resource.verb));
  const usesBoardOperations = boardMethods.has("work-open") || boardMethods.has("work-move");
  const publicationPlanResources = (item.signedAction?.resources ?? []).filter((entry) =>
    entry?.resource?.kind === "npm-workspace-publication-plan@1");
  // The taking stands under the admitted subject, or under the held subject a witnessed extension cites.
  const takingSubjects = [...new Set([item.subject, ...(item.evidence ?? [])
    .filter((entry) => typeof entry === "string" && entry.startsWith("parent-obligation-subject:")).map((entry) => entry.slice("parent-obligation-subject:".length))])];
  // Ordered for the prompt cache: every line before `mission` is the same for every duty this
  // character carries on this node (identity, workspace rule, node and MCP use, the general rules
  // and the outcome shape), so that prefix is byte-identical across items; the office, enterprise,
  // item, scope, allocation, method and skill follow it.
  return sessionContextImage({
    dataRoot: toldRoot,
    toldBudget: 6_000,
    identity: [`You are ${characterName}, the ${dialect.label} character of this machine, serving the office allocated in the duty below through the 561 Group's MetroPlat. Perform its actual duty and method at the responsibility level of that office.`],
    capabilities: [
      ...(workspaceRule === undefined ? [] : [workspaceRule]),
      ...(nodeName === undefined ? [] : [`The execution node owning this allocation is ${nodeName}. Its work subjects and allocations are local to that node. ${access === undefined ? "Select the installed MetroPlat MCP server for that exact node." : `Use the declared ${mcpServer} MetroPlat MCP server: ${access.connect} followed by ${access.command}. Select that exact server rather than another node or app connector.`}`]),
      "Use a command line consisting of the verb, a space, and its JSON input. Work from the original subject, scope, signed Action, governing terms and full method carried below. The host has already selected this canonical allocated duty and checked current provider authority. Inspect only current evidence necessary to execute this method or meet its receiver condition; do not reread the whole dispatch queue or office catalog as a startup ritual.",
      "When the allocated implementation uses duty-worktree-open or duty-worktree-commit, its workspace duty is the exact scope of the allocation below, not the office-service definition id.",
      "The canonical office, duty, work transformation and method determine this service. Follow their jurisdiction, effect limits, customer and receiver boundaries. An assessment duty assesses; an engineering leadership duty establishes and operates delivery through its qualified staff; a specialist duty performs its stated transformation. A title or model does not convey an appointment, extra authority or independent acceptance. Read the current office and relevant governing records before using their powers.",
      "Use the delegated Resources for the actual required effect, including native knowledge and governing acts. An execution obligation is distinct from a knowledge claim or institutional change. Use duty source Resources for an allocated implementation's isolated draft and exact source proposal. Independent source acceptance precedes its integration and publication. An already authorized native governing act changes its canonical carrier directly and requires exact-path source publication. Preserve unrelated work and keep source acceptance distinct from operating delivery.",
      `The host submits your typed outcome for this exact allocation after observing your actual session, so no separate agency-work-propose call is required. Return only JSON: ${AGENCY_OUTCOME_SHAPE}. An obstruction is a successful outcome only when the canonical receiver condition permits it. A final message alone does not complete the work. Preserve outstanding parent obligations until their own receiving conditions are met.`,
    ],
    mission: [
      `Allocated office: ${item.office}`,
      `Intent: ${item.intent}`,
      `Scope: ${item.scope}; original subject: ${item.subject}; allocated office: ${item.office}`,
      ...(enterprise === undefined ? [] : [`This duty is owned by the ${enterprise} enterprise. Prefix its work-coordination commands with @${enterprise}, which selects its own settlement without granting authority. Work-board and agency records remain node operations; do not prefix those.${usesBoardOperations ? ` For a taken demand, find its current board thread with work-board ${JSON.stringify({ subject: takingSubjects[0], full: true, limit: 2 })}${takingSubjects.length === 1 ? "" : `; a witnessed extension is held under the taking it cites, so also try ${takingSubjects.slice(1).map((subject) => JSON.stringify(subject)).join(", ")}`}. Identify the current taking by this enterprise and exact admitted subject before any act. Migration can change thread ids while preserving that taking and subject; copied source receipts are historical evidence, not current routing addresses. If this duty assays a delivery rather than holding a taking, use its assay-of thread evidence.` : ""}`]),
      `When the method needs the original journal subject, use ${workPrefix}work-item ${JSON.stringify({ id: item.subject })}; do not substitute the demand id. When it needs dispatch state beyond this allocation, id means the Character; select only the necessary page, starting with ${workPrefix}agent-work-dispatch ${JSON.stringify({ id: item.agent, limit: 1 })}.`,
      ...(item.methodResources === undefined ? [] : [`The holder has delegated these actual installed method Resources, including their exact input contracts: ${JSON.stringify(item.methodResources)}`]),
      ...(publicationPlanResources.length === 1 && typeof publicationPlanResources[0].id === "string" && typeof publicationPlanResources[0].witness === "string"
        ? [`If the allocated method explicitly calls for the read-only package publication plan carried by its signed Action, return this native typed plan request ${JSON.stringify(workResultFromSkillResult(skillSuccess({kind:"npm-workspace-publication-plan-request@1",scope:item.scope,resource:publicationPlanResources[0].id,witness:publicationPlanResources[0].witness})))}. This requests only the host's fixed read-only plan at the end of this actual session; it does not publish, change package files, or authorize any other command. Do not request it unless this duty's stated method requires the plan.`] : []),
      `This duty is already allocated and invoked by the resident work controller: ${JSON.stringify({ allocation: item.allocation, scope: item.scope, provider: item.delegation?.provider, execution: item.execution })}. Perform its method in this worker; do not allocate this same duty again or require access to the controller's private execute/pump verbs.`,
      `When you need current execution state, read only your exact delegated duty: ${workPrefix}agency-work-delegated ${JSON.stringify({ scope: item.scope })}. Its native execution receipt and admitted session are process evidence, distinct from an assignment label. Missing a resource actually needed by your method is a separate obstruction.`,
      ...(item.signedAction === undefined ? [] : [`Signed next Action and witnessed Resources: ${JSON.stringify(item.signedAction)}`]),
      ...(item.sourceRepository === undefined ? [] : [`Admitted source repository: ${item.sourceRepository}`]),
      `Work: ${item.work}`,
      ...(item.governing === undefined ? [] : [`Canonical governing terms at allocation, with their source revisions: ${JSON.stringify(item.governing)}`]),
      `Skill: ${item.skill}`,
      `Method: ${item.method}`,
      `Received when: ${item.receiverCondition}`,
      ...(item.returns === undefined ? [] : [`The result's value is typed: ${JSON.stringify(item.returns)}`]),
      ...(item.source === undefined ? [] : [`Source: ${typeof item.source === "string" ? item.source : JSON.stringify(item.source)}`]),
      "",
      item.text,
      "",
      ...(usesBoardOperations ? [`Board act under this office-service allocation: do not use as=<office> or replace the enterprise that owns the taking with your allocated office. Use the operation's officeService envelope with exactly { allocation: ${JSON.stringify(item.allocation)}, office: ${JSON.stringify(item.office)}, scope: ${JSON.stringify(item.scope)}, subject: ${JSON.stringify(item.subject)}, session: <the exact session from this scope's current agency-work-delegated execution receipt> }. Hosted work is authorized by its exact started execution receipt without a separate assignment; if a separate assignment exists, its worker must match the execution session. The canonical subject is distinct from the allocation scope; do not derive one from the other. Read the exact target work-board thread and identify the one current enterprise taking whose subject is the allocation's original canonical subject. That taking can be an aim, request, report, proposal or question where the board supports taking it. For work-open, serve that exact taking. For work-move, act on that taking directly, or on a request whose sole serves edge leads back to it and whose original opener is that taking's enterprise. Do not require that enterprise to have opened a directly targeted taking: it may have taken another party's thread. The taking's enterprise remains the board player and your account is the hand; a serving request may have a different provider home. The scope and subject are distinct; preserve both exact values. The service office qualifies your hand, not an appointment or a new board owner. If the exact active execution session is not present or the target thread's current taking does not carry the canonical subject, stop with that obstruction. The host strips officeService before persisting the board move. Board speech states ends, never means or staffing: a request's need is a goal (a state of the world that holds when it is met, not an imperative activity), its requirements are singular EARS statements whose subject is the thing delivered, and nobody is named as doer, model or effort. When something stands in the way, play a report with obstacle (capacity, capability, information, authority, dependency, resource or conflict) and obstructs naming the request, aim or request#requirement, never a request for staff. A proposal names addresses or serves, and others argue for or against it. Read your agenda and dues for what you owe.`] : []),
    ],
  });
}

/**
 * Account one session against its dialect's subscription (`dialect.allowance`) in the host-wide
 * allowance ledger: the windows the session's CLI stated, as readings, and the session itself as a
 * spend `consumer` drew. Accounting never fails the work it accounts for.
 */
export function recordCarrierAllowance({ dialect, session, consumer, environment = process.env, now = new Date() }) {
  if (dialect.allowance === undefined || session?.thread === undefined) return 0;
  try {
    const allowance = subscriptionAllowance(dialect.allowance);
    const at = now.toISOString();
    const source = `${dialect.evidence}:${session.thread}`;
    return recordAllowanceEvidence(allowance, [
      ...subscriptionReadings(allowance, session.allowance, { at }),
      ...(Object.hasOwn(allowance.costs, "session") ? [{ type: "spend", kind: "session", at, source, consumer }] : []),
    ], { storePath: allowanceLedgerPath(environment) });
  } catch (error) {
    console.error(`[carrier] ${dialect.label} session ${session.thread} left unaccounted: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
}

/** A receiving session's typed judgement from its last message, or nothing when it returned none. */
function optionalJudgement(message) {
  let judgement;
  try { judgement = JSON.parse(message); } catch { return {}; }
  if (!RECEIVING_DECISIONS.includes(judgement?.decision) || typeof judgement.text !== "string" || judgement.text.trim() === "") return {};
  const evidence = Array.isArray(judgement.evidence) ? judgement.evidence.filter((entry) => typeof entry === "string" && entry.length > 0) : [];
  return { judgement: Object.freeze({ decision: judgement.decision, text: judgement.text, evidence: Object.freeze(evidence) }) };
}

/**
 * `executeAgencyWork(item)` for a node whose `dialect` character is `workerId`, with the contract's
 * methods beside it. `sessionOptions({ item, receiving })` gives the harness's own session options
 * (effects, MCP, office projection, output constraint) in its dialect's terms.
 */
export function agencyWorkCarrier({ dialect, workerId, dataRoot, formerRoots = [], toldRoot = dataRoot, characterName, nodeName, mcpServer, enterprise, cwd, workspaceOf, model, executable, sessionOptions = () => ({}), onSession, onReceivingSession, onSourceBinding, onSourceResult }) {
  if (typeof workerId !== "string" || workerId.length === 0) throw new TypeError(`${dialect.label} carrier: the character it serves is required`);
  const executableOption = executable === undefined ? {} : { executable };
  const taskId = item => `agency-${createHash("sha256").update(item.allocation).digest("hex").slice(0, 32)}`;
  const directory = item => harnessTaskArtifactDirectory(dialect, dataRoot, taskId(item), formerRoots);
  const observedCarrier = (session, model, effort, sourceTask) => {
    if (session.thread === undefined || session.model === undefined) throw new TypeError(`${dialect.label} session has no observed execution context`);
    if (model !== undefined && session.model !== model || effort !== undefined && session.reasoningEffort !== effort)
      throw new TypeError(`${dialect.label} session does not match its qualified model and effort`);
    return { ...(sourceTask === undefined ? {} : { sourceTask }), id: session.thread, model: session.model, ...(session.reasoningEffort === undefined ? {} : { reasoningEffort: session.reasoningEffort }), evidence: session.carrierEvidence };
  };
  const requiredEffort = item => item.staffing?.effort;
  const outcomeOf = (item, session) => {
    // A session that never started failed for capacity, not at the work: the dialect says which.
    if (!session.ok) throw Object.assign(new Error(session.errors.join("; ") || `${dialect.label} ended without a completed inference result`),
      dialect.startupFailure(session) ? { failure: "carrier-startup" } : {});
    let result;
    try { result = JSON.parse(session.message); } catch { throw new TypeError(`${dialect.label} worker did not return a typed service outcome`); }
    result = admitAgencyWorkResult(result);
    const selectedModel = item.allocatedModel ?? model;
    const carrier = observedCarrier(session, selectedModel, requiredEffort(item));
    const producer = { id: workerId, revision: `${dialect.name}:${carrier.model}` };
    const evidence = [
      ...(session.thread === undefined ? [] : [`${dialect.evidence}:${session.thread}`]),
      ...(session.carrierEvidence === undefined ? [] : [`${dialect.name}-session-context:${session.carrierEvidence}`]),
      `${dialect.name}-exit:${session.exitCode}`, `${dialect.name}-prompt-sha256:${createHash("sha256").update(readFileSync(path.join(session.artifactDir, existsSync(path.join(session.artifactDir, "prompt.txt")) ? "prompt.txt" : "resume-prompt.txt"))).digest("hex")}`, `${dialect.name}-task:${taskId(item)}`,
    ];
    // Its token usage is what the work consumed, a field of the proposal rather than an evidence string.
    const resources = tokenUsageResources(session.usage, carrier.model);
    return { producer, session: carrier, execution: session.ok ? `${dialect.evidence}:${session.thread ?? item.scope}` : `refused:${item.scope}`,
      result, ...(item.execution?.sourceBinding === undefined ? {} : { sourceBinding: item.execution.sourceBinding }), ...(item.execution?.sourceResult === undefined ? {} : { sourceResult: item.execution.sourceResult }), providerEvidence: evidence, ...(resources.length === 0 ? {} : { resources }) };
  };
  const options = (item, receiving = false) => ({ cwd, ...executableOption, ...sessionOptions({ item, receiving }) });
  // A harness whose sessions must not share a tree gives each act its own workspace: `workspaceOf.open({ item, id, receiving })`
  // resolves the working directory (and fails the act when it cannot, so nothing runs in `cwd`), and
  // `workspaceOf.close({ item, id, receiving, workspace, session })` settles it once the session ended.
  const inWorkspace = async (spec, body) => {
    if (workspaceOf === undefined) return body(undefined);
    const opened = workspaceOf.openWithSource === undefined ? { workspace: await workspaceOf.open(spec) } : await workspaceOf.openWithSource(spec);
    const { workspace, sourceBinding } = opened;
    const sourceTask = spec.observeSourceTask === true ? workspaceOf.sourceTask?.(spec, opened) : undefined;
    const original = { ...spec, ...(sourceBinding === undefined ? {} : { sourceBinding }),
      ...(sourceBinding === undefined || spec.receiving ? {} : { onSourceResult: value => onSourceResult(spec.item, value) }) };
    let session;
    try {
      if (sourceBinding !== undefined && !spec.receiving) {
        if (typeof onSourceBinding !== "function" || typeof onSourceResult !== "function") throw new TypeError("exact source execution requires its native source witness receivers before launch");
        await onSourceBinding(spec.item, sourceBinding);
      }
      session = await body(workspace, sourceBinding, sourceTask);
      // Exact-source publication may be unresolved after the inference completed. Account that
      // actual session before settling; recovery only resumes its retained source trace.
      if (sourceBinding !== undefined && !spec.receiving && spec.accountSession === true) recordCarrierAllowance({ dialect, session, consumer: `${dialect.name}:${spec.item.office}` });
    } catch (error) { await workspaceOf.close({ ...original, workspace, session: undefined }).catch(() => undefined); throw error; }
    try { await workspaceOf.close({ ...original, workspace, session }); }
    catch (error) {
      if (sourceBinding !== undefined && !spec.receiving && session?.ok === true) {
        // A completed inference still owns its original task while source settling is unresolved.
        // The controller preserves the existing started receipt and recovers that terminal session.
        throw Object.assign(new Error("exact source completion remains unresolved; recover the original task"), { sourcePending: true });
      }
      throw error;
    }
    return session;
  };
  const provider = (item) => {
    const producer = Object.freeze({ id: workerId, revision: `${dialect.name}:${model ?? "default"}` });
    if (item.delegation?.provider !== workerId) {
      return Promise.resolve(Object.freeze({ producer, execution: `refused:${item.scope}`, result: workResultFromSkillResult(skillError("ValidationFailure", "provider is not the current allocated delegate", item.scope)), providerEvidence: Object.freeze([`allocation-provider:${item.delegation?.provider ?? "none"}`]) }));
    }
    const run = async ({ onSession: bindSession } = {}) => {
      const selectedModel = item.allocatedModel ?? model;
      const suitOf = sourceBinding => agencyWorkSuit(item, { dialect, toldRoot, characterName, nodeName, mcpServer, enterprise, workspaceRule: workspaceOf?.rule?.({ item, id: taskId(item), receiving: false, sourceBinding }) ?? dialect.workspaceRule });
      const observed = readHarnessSessionArtifacts(dialect, directory(item));
      const prior = observed.exitCode === undefined ? undefined : observed;
      const observe = onSession === undefined || selectedModel === undefined ? undefined : (session, sourceTask) => onSession(item, observedCarrier(session, selectedModel, requiredEffort(item), sourceTask));
      if (prior?.thread !== undefined && prior.model !== undefined) await observe?.(prior);
      const onObservedSession = async (session, sourceTask) => { await observe?.(session, sourceTask); await bindSession?.(session); };
      const settledPrior = prior !== undefined && item.execution?.sourceBinding !== undefined && item.execution?.sourceResult?.phase !== "named"
        ? await inWorkspace({ item, id: taskId(item), receiving: false }, () => prior) : prior;
      const session = settledPrior ?? await inWorkspace({ item, id: taskId(item), receiving: false, accountSession: true, observeSourceTask: true }, (workspace, sourceBinding, sourceTask) => runHarnessSession(dialect, { ...options(item), ...(workspace === undefined ? {} : { cwd: workspace }), onSession: session => onObservedSession(session, sourceTask), prompt: suitOf(sourceBinding).text, artifactDir: directory(item), taskId: taskId(item),
        ...(selectedModel === undefined ? {} : { model: selectedModel }), ...(requiredEffort(item) === undefined ? {} : { reasoningEffort: requiredEffort(item) }) }));
      if (prior === undefined && item.execution?.sourceBinding === undefined) recordCarrierAllowance({ dialect, session, consumer: `${dialect.name}:${item.office}` });
      return outcomeOf(item, session);
    };
    if (item.providerReservation !== undefined) return runReservedProviderTurn(dialect, item.providerReservation, (_slot, hooks) => run(hooks));
    return inProviderTurn(dialect, (_slot, hooks) => run(hooks), { reservation: { taskId: taskId(item), artifactDir: directory(item), model: item.allocatedModel ?? model } });
  };
  provider.dialect = dialect;
  provider.workerId = workerId;
  provider.reserve = ({ item, scopeKey, executionIdentity }) => {
    const task = item.proposal === undefined
      ? { taskId: taskId(item), artifactDir: directory(item) }
      : receivingTask(item);
    return reserveProviderTurn(dialect, { scopeKey, executionIdentity, ...task });
  };
  provider.release = reservation => releaseProviderTurn(dialect, reservation);
  // The runner's thread event exists before completion and survives host restart.
  // Expose that process fact so office qualification can operate during the work.
  provider.session = item => {
    const session = readHarnessSessionArtifacts(dialect, directory(item));
    const selectedModel = item.allocatedModel ?? model;
    if (session.thread !== undefined && session.model !== undefined) workspaceOf?.verify?.({ item, id: taskId(item), receiving: false });
    return session.thread === undefined || session.model === undefined ? undefined : observedCarrier(session, selectedModel, requiredEffort(item));
  };
  // Observing a terminal result cannot resume the provider or exercise its old
  // delegation. Keep this separate from recover, which may launch a continuation.
  provider.completed = item => {
    if (item.delegation?.provider !== workerId) return undefined;
    const session = readHarnessSessionArtifacts(dialect, directory(item));
    if (session.exitCode === undefined) return undefined;
    workspaceOf?.verify?.({ item, id: taskId(item), receiving: false });
    if (item.execution?.sourceBinding !== undefined && (item.execution?.sourceResult?.phase !== "named"
      || workspaceOf?.pending?.({ item, id: taskId(item), receiving: false }) === true)) return undefined;
    return outcomeOf(item, session);
  };
  provider.recover = item => {
    if (item.delegation?.provider !== workerId) return undefined;
    workspaceOf?.verify?.({ item, id: taskId(item), receiving: false });
    const run = async ({ onSession: bindSession } = {}) => {
      const selectedModel = item.allocatedModel ?? model;
      const terminal = readHarnessSessionArtifacts(dialect, directory(item));
      if (item.execution?.sourceBinding !== undefined && terminal.exitCode !== undefined) {
        // Reconcile the original finished task's source, never launch inference again to obtain
        // a fresh task ID or evade an unresolved publication.
        const session = await inWorkspace({ item, id: taskId(item), receiving: false }, () => terminal);
        return outcomeOf(item, session);
      }
      const session = await inWorkspace({ item, id: taskId(item), receiving: false, observeSourceTask: true }, (workspace, _sourceBinding, sourceTask) => recoverHarnessSession(dialect, { ...options(item), ...(workspace === undefined ? {} : { cwd: workspace }), artifactDir: directory(item), taskId: taskId(item),
        thread: item.execution?.session, model: selectedModel,
        ...(requiredEffort(item) === undefined ? {} : { reasoningEffort: requiredEffort(item) }),
        ...(onSession === undefined || selectedModel === undefined ? {} : {
          onSession: async session => { await onSession(item, observedCarrier(session, selectedModel, requiredEffort(item), sourceTask)); await bindSession?.(session); } }) }));
      if (session !== undefined) recordCarrierAllowance({ dialect, session, consumer: `${dialect.name}:${item.office}` });
      return session === undefined ? undefined : outcomeOf(item, session);
    };
    if (item.providerReservation !== undefined) return runReservedProviderTurn(dialect, item.providerReservation, (_slot, hooks) => run(hooks));
    return inProviderTurn(dialect, (_slot, hooks) => run(hooks), { reservation: { taskId: taskId(item), artifactDir: directory(item), model: item.allocatedModel ?? model } });
  };
  // Receiving is an incumbent's direct act, not another allocated duty whose
  // result would itself need receiving. Its stable runner survives host restart. Like execution,
  // the session returns its typed judgement and the host admits it into the root that owns the
  // proposal, so a micro-enterprise's work is received in its own root, never in the node's.
  // Each attempt is its own task: the first keeps the original id, and an attempt that could not
  // inspect its evidence (unverified) is followed, after RECEIVING_RETRY_MS, by the next, up to
  // RECEIVING_ATTEMPTS. Past the last the work stays awaiting receipt: unknown, not judged.
  const receivingTaskId = (review, attempt = 0) => `agency-receive-${createHash("sha256").update(JSON.stringify([review.proposal.receipt, workerId, review.office])).digest("hex").slice(0, 32)}${attempt === 0 ? "" : `-${attempt}`}`;
  const attemptDirectory = (review, attempt) => harnessTaskArtifactDirectory(dialect, dataRoot, receivingTaskId(review, attempt), formerRoots);
  const receivingAttempt = review => {
    for (let attempt = 0; ; attempt += 1) {
      const artifactDir = attemptDirectory(review, attempt);
      const session = readHarnessSessionArtifacts(dialect, artifactDir);
      if (session.exitCode === undefined) return { attempt, finished: false };
      const ended = path.join(session.artifactDir, "exit-code");
      if (retryableHarnessSession(dialect, session, { artifactDir, retryStartup: true })) return { attempt, finished: false };
      if (!session.ok || optionalJudgement(session.message).judgement?.decision !== "unverified" || attempt + 1 >= RECEIVING_ATTEMPTS) return { attempt, finished: true };
      if (Date.now() - statSync(ended).mtimeMs < RECEIVING_RETRY_MS) return { attempt, finished: true };
    }
  };
  const receivingTask = review => {
    const { attempt } = receivingAttempt(review);
    return { taskId: receivingTaskId(review, attempt), artifactDir: attemptDirectory(review, attempt) };
  };
  provider.verifySourceTask = async (item, task, sessionId) => {
    const receiving = task.role === "receiving";
    const selected = receiving ? receivingTask(item) : { taskId: taskId(item), artifactDir: directory(item) };
    if (selected.taskId !== task.task) throw new TypeError("source task: current work no longer selects its original task or receiving attempt");
    const observed = readHarnessSessionArtifacts(dialect, selected.artifactDir);
    if (observed.thread !== sessionId || observed.exitCode !== undefined) throw new TypeError("source task: original observed session is absent or terminal");
    observedCarrier(observed, receiving ? item.staffing?.carrier : item.allocatedModel ?? model, receiving ? item.staffing?.effort : requiredEffort(item));
    if (typeof workspaceOf?.verifyTask !== "function") throw new TypeError("source task: private original workspace verification is unavailable");
    return workspaceOf.verifyTask({ item, id: selected.taskId, receiving }, task);
  };
  provider.receivingFinished = review => receivingAttempt(review).finished;
  // A finished attempt that judged (accepted or rejected) has a judgement the host must still admit
  // while the work awaits receipt: it is offered again for admission, never run again.
  provider.receivingJudged = review => {
    const { artifactDir } = receivingTask(review);
    const session = readHarnessSessionArtifacts(dialect, artifactDir);
    return session.exitCode !== undefined && session.ok
      && ["accepted", "rejected"].includes(optionalJudgement(session.message).judgement?.decision);
  };
  provider.receive = review => {
    const run = async ({ onSession: bindSession } = {}) => {
    const { proposal, office, staffing } = review;
    if (!staffing?.carrier || proposal.origin === undefined || office === proposal.origin.office) throw new TypeError("receiving needs distinct producing and receiving offices and a stated carrier");
    const { taskId: id, artifactDir } = receivingTask(review);
    const observe = async (session, sourceTask) => {
      await onReceivingSession?.(review, observedCarrier(session, staffing.carrier, staffing.effort, sourceTask));
      await bindSession?.(session);
    };
    const prior = readHarnessSessionArtifacts(dialect, artifactDir);
    if (prior.thread !== undefined && prior.model !== undefined) await observe(prior);
    const access = worldAccess(dialect, mcpServer);
    const sessionOptionsOf = { ...options(review, true), artifactDir, taskId: id, model: staffing.carrier,
      reasoningEffort: staffing.effort, onSession: observe, timeoutMs: 600_000 };
    // Ordered for the prompt cache, as the work suit is: identity, node and MCP use and the general
    // receiving rules are the same for every proposal this character receives; the office, enterprise
    // and the proposal follow.
    const suit = sessionContextImage({
      dataRoot: toldRoot, toldBudget: 2_000,
      identity: [`You are ${characterName}, exercising the actually held office named below as an independent receiver. This is a direct receiving act, not a new production allocation.`],
      capabilities: [
        `The owning node is ${nodeName}. For evidence that needs MetroPlat, use exactly the ${mcpServer} MCP server via ${access?.connect ?? "its world connect tool"} then ${access?.command ?? "its world command tool"} (a verb, space, JSON input); read only.`,
        "The host has resolved the exact immutable proposal below from its journal and checked the actual held receiving office and its authored receivesFrom relation. It admits your judgement after observing your actual session, rechecking current process-bound authority. Do not reread office catalogs or whole dispatch queues to establish those facts. Inspect only evidence necessary for the stated receiving condition; use bounded repository reads or an exact native subject when the condition requires it.",
        receivingJudgementMeaning(proposal.result),
        "When you could not inspect the evidence (a tool failed, a read timed out, a subject or server was unreachable), return unverified: that is unknown, not a rejection, and the report is received again later. Do not perform the producing work or accept its parent business demand.",
        `Return only JSON: ${JSON.stringify(RECEIVING_JUDGEMENT_SHAPE)}. decision is accepted, rejected or unverified; text is your concise judgement of the report under the rule above, or for unverified precisely what could not be read and why; evidence lists only what you actually inspected (paths, commits, receipts, subjects). Never fabricate acceptance.`,
      ],
      mission: [
        `Receiving office: ${office}`,
        ...(enterprise === undefined ? [] : [`The proposal belongs to ${enterprise}. Prefix its work-coordination evidence reads with @${enterprise}; work-board and agency records remain node operations. This selects the owning settlement and confers no authority.`]),
        `Review only this exact immutable proposal: ${JSON.stringify(proposal)}`,
      ],
    });
    const session = await inWorkspace({ item: review, id, receiving: true, observeSourceTask: true }, async (workspace, _sourceBinding, sourceTask) => {
    const sessionOptions = { ...sessionOptionsOf, ...(workspace === undefined ? {} : { cwd: workspace }), onSession: session => observe(session, sourceTask) };
    let ended;
    if (prior.thread !== undefined || prior.exitCode !== undefined || existsSync(path.join(prior.artifactDir, "prompt.txt"))) {
      ended = prior.exitCode !== undefined
        ? await retryTransientHarnessSession(dialect, prior, { ...sessionOptions, retryStartup: true })
        : await recoverHarnessSession(dialect, sessionOptions);
      if (ended === undefined) ended = await waitForHarnessSession(dialect, { ...sessionOptions, unit: `${dialect.unit}-${id}` });
    } else {
      ended = await runHarnessSession(dialect, { ...sessionOptions, prompt: suit.text });
    }
    return ended;
    });
    recordCarrierAllowance({ dialect, session, consumer: `${dialect.name}:${office}:receiving` });
    return { task: id, session: observedCarrier(session, staffing.carrier, staffing.effort),
      ok: session.ok, exitCode: session.exitCode, usage: session.usage, errors: session.errors,
      ...(session.ok ? optionalJudgement(session.message) : {}) };
    };
    if (review.providerReservation !== undefined) return runReservedProviderTurn(dialect, review.providerReservation, (_slot, hooks) => run(hooks));
    return inProviderTurn(dialect, (_slot, hooks) => run(hooks), { reservation: { ...receivingTask(review), model: review.staffing?.carrier } });
  };
  return provider;
}
