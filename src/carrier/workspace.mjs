/**
 * The workspace policy of the carrier contract: whichever agent CLI carries a duty or a task, it
 * works in a Git worktree opened for that one task alone, never in the repository's shared checkout
 * (the node's live data root, where other sessions' code runs).
 *
 *   per task      `<root>/<task id>`, a detached worktree at origin/main with submodules at their gitlinks;
 *                 no two tasks share a tree, and the root is outside the repository;
 *   reading       a task that only reads works in its own tree opened without installing packages, under
 *                 the carrier's read-only effects; nothing of it is committed;
 *   writing       its change is committed and named a candidate to the merge queue (land-candidate's
 *                 own path), then the tree is removed; a task that failed keeps its tree, marked,
 *                 with the last FAILED_WORKTREES_KEPT of them retained;
 *   fail closed   a worktree that cannot be opened rejects, so no session starts, and a working
 *                 directory inside a primary checkout is refused by every argument or unit builder.
 *
 * A dialect names itself (`name`, `label`); its root is `METROPLAT_<NAME>_WORKTREES`, default
 * `~/.local/state/561-group/<name>-worktrees`, and its branches `<name>/<task id>`.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalJson } from "@red-cup-engineering/json-services-section";
import { workSourceTaskContract } from "@red-cup-engineering/organizing/work/schema";
import { prepareSourceResultWorktree, prepareSourceClosureWorktree } from "@red-cup-engineering/computer-systems-fabrication-engineering-services-section/workspace/source-closure";
import { homedir } from "node:os";
import path from "node:path";

import { assertSourceClosureWorktreeOwners, sourceOnlyPackagePreparation, finishBoundWorktree, removeBoundWorktree, assertWorktreeOwner, commitWorktree, integrateWorktree, prepareWorktree, removeWorktree, worktreeChanges, worktreeDirty, worktreeHead } from "@red-cup-engineering/computer-systems-fabrication-engineering-services-section/workspace/worktree";

function taskCopies(sourceBinding, workspace) {
  const copies = [];
  const visit = (source, relative) => {
    const held = path.join(workspace, relative), stat = lstatSync(held, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("source task: original task directory is unavailable");
    copies.push(Object.freeze({ path: relative, device: String(stat.dev), inode: String(stat.ino) }));
    for (const child of source.composed) visit(child.source, relative ? `${relative}/${child.path}` : child.path);
  };
  visit(sourceBinding, ""); return Object.freeze(copies);
}
/** A witness from a verified opened source tree; never construct this from a request path. */
export function carrierSourceTask({ item, id, receiving = false }, { workspace, branch, sourceBinding, effects }) {
  const work = receiving ? item.proposal : item;
  const value = { kind: "metroplat.work.source-task", role: receiving ? "receiving" : "production", task: id,
    workspace, branch, effects, sourceBinding: sourceBinding.id,
    ...(receiving ? { proposal: work.receipt, sourceResult: work.sourceResult.id } : { allocation: item.allocation }),
    scope: work.scope, subject: work.subject, office: item.office, copies: taskCopies(sourceBinding, workspace) };
  const task = { ...value, id: `source-task:sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}` };
  workSourceTaskContract.assert(task, "host-observed source task"); return Object.freeze(task);
}
function assertTaskWitness(task, spec, opened) {
  workSourceTaskContract.assert(task, "retained source task");
  const expected = carrierSourceTask(spec, opened);
  if (canonicalJson(task) !== canonicalJson(expected)) throw new TypeError("source task: original observed task or physical workspace changed");
  return task;
}

/** How many failed tasks' worktrees stay for inspection; older ones are removed. */
export const FAILED_WORKTREES_KEPT = 10;

/** How long an entry of a retired shared root is left alone when it is pruned, and how many of the
 *  newest stay regardless. */
export const RETIRED_ROOT_GRACE_MS = 7 * 24 * 3_600_000;
export const RETIRED_ROOT_KEPT = 5;

const environmentName = (dialect) => `METROPLAT_${dialect.name.toUpperCase().replace(/[^A-Z0-9]+/gu, "_")}_WORKTREES`;

/** Where a dialect's task worktrees live. Outside the repository: inside it, each worktree's packages
 *  would join the pnpm workspace beside the originals and the tree would read as untracked files in
 *  the shared checkout. */
export const carrierWorktreeRoot = (dialect, environment = process.env) =>
  environment[environmentName(dialect)] || path.join(homedir(), ".local", "state", "561-group", `${dialect.name}-worktrees`);

/** The worktree of one task: `<root>/<task id>`. */
export function carrierTaskWorktree(dialect, taskId, environment = process.env) {
  if (typeof taskId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(taskId)) throw new TypeError(`a ${dialect.label} task worktree is named by a task id of letters, digits, '.', '_' and '-'`);
  return path.join(carrierWorktreeRoot(dialect, environment), taskId);
}

/** The branch of one task's worktree, and where its change is published when it joins nothing. */
export const carrierTaskBranch = (dialect, taskId) => `${dialect.name}/${taskId}`;
const strandedBranch = (dialect, taskId) => `${dialect.name}/stranded/${taskId}`;

/** The nearest enclosing Git working tree of `directory`, and whether it is a primary checkout (its
 *  `.git` is a directory) rather than a linked worktree (its `.git` is a file). */
function enclosingCheckout(directory) {
  for (let current = path.resolve(directory); ; current = path.dirname(current)) {
    try { return { root: current, shared: statSync(path.join(current, ".git")).isDirectory() }; }
    catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
    if (path.dirname(current) === current) return undefined;
  }
}

/** Refuse a working directory inside a primary checkout, the shared tree every writer would otherwise
 *  edit under the node. Every start, resume and unit a carrier builds goes through this. */
export function assertNotSharedCheckout(dialect, cwd) {
  if (typeof cwd !== "string" || cwd === "") throw new TypeError(`a ${dialect.label} session needs its own task worktree as its working directory`);
  const checkout = enclosingCheckout(cwd);
  if (checkout?.shared === true) throw new TypeError(`a ${dialect.label} session never runs in the shared checkout ${checkout.root}: it works in a worktree of its own (${cwd})`);
  return cwd;
}

/** What every carrier session is told of where it works. */
export const CARRIER_WORKSPACE_RULE = "Your working directory is a Git worktree opened for this task alone, detached at origin/main. Work only in it. Never edit, stash, reset, checkout, pull, merge or rebase in the shared checkout of the repository (the node's live data root, where other sessions' code runs), and never change directory into it to write. Your change joins main through the merge queue as a candidate; the runner commits and names it, so do not push.";

/** Open the task's own detached worktree at origin/main, submodules at their gitlinks, packages linked
 *  offline (a read-only task does not install). `cwd` is the repository the worktree borrows objects
 *  from, and is never itself the workspace. Fails closed: when the worktree cannot be opened this
 *  rejects, and no session starts. A worktree that already exists is the task's own earlier one and is
 *  reused as it stands when `reuse` is set (recovery), never reset. `commandRunner`, when given,
 *  replaces the house command executor for the worktree's steps. */
export async function prepareCarrierWorktree(dialect, { cwd, taskId, effects = "repository-write", install = effects !== "read-only", reuse = false, sourceBinding, sourceResult, bindGit, commandRunner, environment = process.env }) {
  const workspace = carrierTaskWorktree(dialect, taskId, environment);
  const branch = carrierTaskBranch(dialect, taskId);
  if (path.resolve(workspace) === path.resolve(cwd)) throw new TypeError(`a ${dialect.label} task worktree is never the repository it borrows from`);
  try {
    if (existsSync(workspace)) assertWorktreeOwner(cwd, workspace);
    if (sourceBinding === undefined && reuse && existsSync(path.join(workspace, ".git"))) return Object.freeze({ workspace, branch, reused: true });
    const prepared = await prepareWorktree({ repository: cwd, workspace, branch, ...(sourceBinding === undefined ? {} : { sourceBinding, sourceResult, from: sourceBinding.copy.commit, bindGit }), install, environment, runner: commandRunner });
    assertWorktreeOwner(cwd, prepared.workspace);
    assertNotSharedCheckout(dialect, prepared.workspace);
    return Object.freeze({ ...prepared, reused: prepared.reused ?? false });
  } catch (error) {
    throw new Error(`the ${dialect.label} task worktree ${workspace} could not be opened, so the task does not run: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

const keptMarker = (dialect, environment, taskId) => path.join(carrierWorktreeRoot(dialect, environment), `${taskId}.kept`);

/** After a task: remove its worktree when its change reached the merge queue as a candidate (or it
 *  changed nothing); keep it, marked, when it failed, and remove the failed worktrees beyond the
 *  last `keep`. The task's branch stays in the repository either way. Resolves whether the worktree
 *  was kept. */
export async function releaseCarrierWorktree(dialect, { cwd, workspace, taskId, failed, commandRunner, environment = process.env, keep = FAILED_WORKTREES_KEPT }) {
  if (failed) {
    writeFileSync(keptMarker(dialect, environment, taskId), `${JSON.stringify({ taskId, workspace, kept: new Date().toISOString() })}\n`, { mode: 0o600 });
    const root = carrierWorktreeRoot(dialect, environment);
    const marked = readdirSync(root).filter((name) => name.endsWith(".kept"))
      .map((name) => ({ name, mtime: statSync(path.join(root, name)).mtimeMs }))
      .filter(({ name }) => {
        try { if (JSON.parse(readFileSync(path.join(root,name),"utf8")).sourceBinding !== undefined) return false; } catch { return false; }
        const held = path.join(root, name.slice(0, -".kept".length));
        if (!existsSync(held)) return false;
        try { assertWorktreeOwner(cwd, held); return true; } catch { return false; }
      }).sort((left, right) => right.mtime - left.mtime);
    for (const { name } of marked.slice(keep)) {
      const id = name.slice(0, -".kept".length);
      try {
        const held = path.join(root, id);
        assertWorktreeOwner(cwd, held);
        await removeWorktree({ repository: cwd, workspace: held, runner: commandRunner });
        rmSync(path.join(root, name), { force: true });
      } catch { /* Unremoved or foreign work retains its recovery marker. */ }
    }
    return true;
  }
  await removeWorktree({ repository: cwd, workspace, runner: commandRunner });
  rmSync(keptMarker(dialect, environment, taskId), { force: true });
  return false;
}

/** Whether a finished task's trace reached the queue: it changed nothing, or it names a candidate (or
 *  joined main outright). A stranded or unresolved trace did not. */
export const carrierTraceNamed = (trace) => trace?.integration === undefined
  ? (trace?.changedPaths ?? []).length === 0
  : trace.integration.queued === true || trace.integration.head !== undefined;

/** Commit the complete named task trace, if it wrote anything, describe it against origin/main, and
 *  join it to origin/main in the same act (the merge queue, as a candidate). A conflict goes to
 *  `resolve`; a trace still conflicting is published as <name>/stranded/<task>. */
export async function finishCarrierWorktree(dialect, { workspace, branch = undefined, taskId, responsibility, resolve, commandRunner, now = () => new Date().toISOString() }) {
  const runner = commandRunner;
  const task = branch ?? carrierTaskBranch(dialect, taskId);
  let commit = await commitWorktree({ workspace, message: [responsibility, `${dialect.label} task ${taskId}`], runner });
  const changedPaths = await worktreeChanges({ workspace, branch: task, runner });
  if (commit === undefined && changedPaths.length > 0) commit = await worktreeHead({ workspace, runner });
  if (commit === undefined) return Object.freeze({ branch: task, changedPaths });
  const integration = await integrateWorktree({ workspace, branch: task, stranded: strandedBranch(dialect, taskId), resolve, runner });
  // Integration names a merge-queue candidate; the task is integrated only once its verdict lands.
  const landed = integration.head !== undefined && integration.queued !== true;
  return Object.freeze({ branch: task, commit, changedPaths, ...(landed ? { integrated: now() } : integration.queued === true ? { queued: now() } : {}), integration });
}

/** Prune a retired shared root once: remove each of its worktrees that is clean, older than the grace
 *  period and not among the newest `kept`, from `repository`'s registry (their branches stay). A dirty
 *  or recent one stays. Marks the root so later calls do nothing. Resolves the names it removed. */
export async function pruneRetiredWorktreeRoot({ root, repository, commandRunner, now = Date.now(), grace = RETIRED_ROOT_GRACE_MS, kept = RETIRED_ROOT_KEPT }) {
  const marker = path.join(root, ".retired");
  if (!existsSync(root) || existsSync(marker)) return Object.freeze([]);
  const entries = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, mtime: statSync(path.join(root, entry.name)).mtimeMs })).sort((left, right) => right.mtime - left.mtime);
  const removed = [];
  let unresolved = false;
  const owned = entries.filter(({ name }) => {
    try { assertWorktreeOwner(repository, path.join(root, name)); return true; }
    catch { unresolved = true; return false; }
  });
  for (const { name, mtime } of owned.slice(kept)) {
    if (now - mtime < grace) continue;
    const workspace = path.join(root, name);
    try {
      if (await worktreeDirty({ workspace, runner: commandRunner })) continue;
      await removeWorktree({ repository, workspace, runner: commandRunner });
      removed.push(name);
    } catch { unresolved = true; /* an entry that cannot be read or removed stays */ }
  }
  if (!unresolved) writeFileSync(marker, `${JSON.stringify({ retired: new Date(now).toISOString(), removed })}\n`, { mode: 0o600 });
  return Object.freeze(removed);
}

/** The effects a task's tree is opened for. */
export const SOURCE_FREE_WORKSPACE_RULE = "Your working directory is private read-only task scratch, not a Git source workspace. Perform only the declared source-free method. Do not clone, install packages, commit, or use a release or shared checkout as a substitute source.";

const defaultEffects = ({ receiving }) => (receiving ? "read-only" : "repository-write");
function sourceFreeWorkspace(dialect, spec, environment) {
  const root = carrierWorktreeRoot(dialect, environment);
  if (!path.isAbsolute(root)) throw new TypeError("source workspace: source-free task root must be absolute");
  const workspace = carrierTaskWorktree(dialect, spec.id, environment);
  // The whole existing parent chain is checked again before recursive cleanup. A symlink
  // cannot redirect this private task directory into another source or another task's data.
  for (let directory = workspace; ; directory = path.dirname(directory)) {
    try {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new TypeError("source workspace: source-free workspace parents must be real directories");
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (path.dirname(directory) === directory) break;
  }
  if (existsSync(workspace) && (!lstatSync(workspace).isDirectory() || lstatSync(workspace).isSymbolicLink() || existsSync(path.join(workspace, ".git")))) {
    throw new TypeError("source workspace: source-free work cannot reuse a Git worktree or non-directory");
  }
  return workspace;
}

/**
 * The `workspaceOf` of the carrier contract (agent-harness `carrier/agency-carrier.mjs`) for a
 * dialect: each act, execution or receiving, works in a worktree of its own. `open` resolves it (and
 * rejects when it cannot be opened, so nothing runs in `repository`, the shared checkout); `close`
 * settles it once the session ended: a writing act's change is committed and named a candidate, then
 * the tree is removed, or kept when the act failed. `effectsOf({ item, receiving })` says whether the
 * act writes (`repository-write`) or only reads (`read-only`). `retired` names shared roots this
 * policy replaces, pruned once when the first tree opens.
 */
export function carrierWorkspaces(dialect, { repository, repositoryOf, commandRunner, environment = process.env, effectsOf = defaultEffects, retired = [], bindGit, publishSourceCandidate, sourcePreparationOf }) {
  const prune = async repository => { for (const root of retired) await pruneRetiredWorktreeRoot({ root, repository, commandRunner }).catch(() => undefined); };
  const pruning = new Map();
  const openWithSource = async (spec) => {
      const bound = repositoryOf === undefined ? { repository } : await repositoryOf(spec);
      if (bound.mode === "no-source") {
        if (effectsOf(spec) !== "read-only") throw new TypeError("source workspace: source-free sessions require read-only effects");
        const workspace = sourceFreeWorkspace(dialect, spec, environment);
        mkdirSync(workspace, { recursive: true, mode: 0o700 });
        return Object.freeze({ workspace });
      }
      const source = bound.repository;
      if (typeof source !== "string" || source.length === 0) throw new TypeError("source workspace: a configured source repository is required");
      if (bound.sourceBinding === undefined) {
        if (!pruning.has(source)) pruning.set(source, prune(source));
        await pruning.get(source);
      }
      if (bound.sourceBinding !== undefined && !spec.receiving && spec.item?.execution?.sourceResult?.phase === "named") {
        // The native trace already names every result. Reconcile cleanup of the same task,
        // including a composition whose leaves were removed before an interruption.
        const workspace = carrierTaskWorktree(dialect, spec.id, environment);
        assertSourceClosureWorktreeOwners(bound.sourceBinding, workspace, assertWorktreeOwner, { allowAbsent: true });
        return Object.freeze({ workspace, sourceBinding: bound.sourceBinding });
      }
      const effects = effectsOf(spec);
      if (bound.sourceBinding !== undefined && spec.receiving && (effects !== "read-only" || spec.item?.proposal?.sourceResult === undefined)) throw new TypeError("source receiving requires the witnessed named result and read-only effects");
      if (bound.sourceBinding !== undefined && effects !== "read-only" && typeof publishSourceCandidate !== "function") throw new TypeError("source workspace: source-writing execution requires its bound candidate publisher before launch");
      let preparation;
      if (bound.sourceBinding !== undefined && !spec.receiving && sourcePreparationOf !== undefined) {
        if (typeof sourcePreparationOf !== "function") throw new TypeError("source package preparation requires its trusted owner binding");
        const declared = await sourcePreparationOf({ sourceBinding: bound.sourceBinding, item: spec.item });
        if (declared !== undefined) preparation = await sourceOnlyPackagePreparation(bound.sourceBinding, declared, { bindGit });
      }
      const prepared = await prepareCarrierWorktree(dialect, { ...(preparation === undefined ? {} : { install: false }), cwd: source, taskId: spec.id, effects, reuse: true, sourceBinding: bound.sourceBinding, ...(spec.receiving ? { sourceResult: spec.item?.proposal?.sourceResult } : {}), bindGit, commandRunner, environment });
      return Object.freeze({ workspace: prepared.workspace, effects, ...(bound.sourceBinding === undefined ? {} : { sourceBinding: bound.sourceBinding }) });
  };
  return Object.freeze({
    rule: spec => {
      const bound = repositoryOf?.(spec);
      if (bound?.mode === "no-source") return SOURCE_FREE_WORKSPACE_RULE;
      const source = spec.sourceBinding ?? bound?.sourceBinding;
      if (source !== undefined && spec.receiving) return `Your read-only receiving workspace contains the exact named result commits from native proposal ${spec.item.proposal.receipt}, verified against original source closure ${source.id}. Inspect those produced candidates without changing, fetching, installing, committing or publishing source.`;
      return source === undefined ? CARRIER_WORKSPACE_RULE : `Your task worktree is bound to original source commit ${source.copy.commit} and exact source closure ${source.id}. Keep that original task and source binding through completion and resume. Work only in this task tree. Do not fetch, change the source composition, rebase to latest, or publish yourself; the owning runtime retains and names exact review candidates.`;
    },
    // Recovery reads existing proof before opening anything. A retained worktree is equivalent
    // owner evidence for older sessions; an absent receipt field alone does not invalidate it.
    ...(repositoryOf === undefined ? {} : { verify: (spec) => {
      const source = repositoryOf(spec);
      if (source?.then !== undefined) throw new TypeError("source workspace: synchronous custody resolution is required for session readback");
      if (spec.item?.execution?.sourceRepository !== undefined && spec.item.execution.sourceRepository !== source.sourceRepository) throw new TypeError("source workspace: execution sourceRepository differs from its admitted obligation");
      if (source.mode === "no-source") { sourceFreeWorkspace(dialect, spec, environment); return source; }
      const workspace = carrierTaskWorktree(dialect, spec.id, environment);
      if (source.sourceBinding !== undefined) {
        const retained = spec.sourceBinding ?? (spec.receiving ? spec.item?.proposal?.sourceBinding : spec.item?.execution?.sourceBinding);
        if (retained === undefined) throw new TypeError("source workspace: original exact execution witness is unresolved");
        if (existsSync(workspace)) assertSourceClosureWorktreeOwners(source.sourceBinding, workspace, assertWorktreeOwner,
          { allowAbsent: !spec.receiving && spec.item?.execution?.sourceResult?.phase === "named" });
        return source;
      }
      if (existsSync(workspace)) { assertWorktreeOwner(source.repository, workspace); return source; }
      if (spec.item?.execution?.sourceRepository === source.sourceRepository) return source;
      throw new TypeError("source workspace: execution owner is unresolved; retain its source worktree or reconcile its source-owner execution witness before resuming");
    } }),
    pending: spec => existsSync(carrierTaskWorktree(dialect, spec.id, environment)) || existsSync(keptMarker(dialect, environment, spec.id)),
    openWithSource,
    sourceTask: (spec, opened) => {
      if (opened.sourceBinding === undefined) return undefined;
      assertSourceClosureWorktreeOwners(opened.sourceBinding, opened.workspace, assertWorktreeOwner);
      return carrierSourceTask(spec, { ...opened, branch: carrierTaskBranch(dialect, spec.id) });
    },
    verifyTask: async (spec, task) => {
      const bound = repositoryOf === undefined ? undefined : await repositoryOf(spec);
      if (bound?.sourceBinding === undefined) throw new TypeError("source task: original exact source binding is unavailable");
      const workspace = carrierTaskWorktree(dialect, spec.id, environment), branch = carrierTaskBranch(dialect, spec.id);
      assertSourceClosureWorktreeOwners(bound.sourceBinding, workspace, assertWorktreeOwner);
      assertTaskWitness(task, spec, { workspace, branch, effects: effectsOf(spec), sourceBinding: bound.sourceBinding });
      if (spec.receiving) await prepareSourceResultWorktree({ repository: bound.repository, workspace, branch,
        sourceBinding: bound.sourceBinding, sourceResult: spec.item.proposal.sourceResult, bindGit, assertOwner: assertWorktreeOwner, existingOnly: true });
      else await prepareSourceClosureWorktree({ repository: bound.repository, workspace, branch,
        sourceBinding: bound.sourceBinding, bindGit, assertOwner: assertWorktreeOwner, existingOnly: true });
      return task;
    },
    open: async spec => (await openWithSource(spec)).workspace,
    close: async (spec) => {
      const { item, id, workspace, session } = spec;
      const bound = repositoryOf === undefined ? { repository } : await repositoryOf(spec);
      if (bound.mode === "no-source") {
        if (workspace !== sourceFreeWorkspace(dialect, spec, environment)) throw new TypeError("source workspace: source-free task path changed");
        if (session?.ok === true) rmSync(workspace, { recursive: true });
        return;
      }
      const source = bound.repository;
      if (bound.sourceBinding !== undefined) {
        const retained = spec.sourceBinding ?? (spec.receiving ? item.proposal?.sourceBinding : item.execution?.sourceBinding);
        if (retained?.id !== bound.sourceBinding.id) throw new TypeError("source workspace: exact completion changed its original source closure");
        const alreadyNamed = !spec.receiving && item.execution?.sourceResult?.phase === "named"
          && item.execution.sourceResult.sourceBinding === retained.id;
        assertSourceClosureWorktreeOwners(retained, workspace, assertWorktreeOwner, { allowAbsent: alreadyNamed });
        let sourceResult = alreadyNamed ? item.execution.sourceResult : undefined;
        try {
          if (session?.ok === true && !spec.receiving && !alreadyNamed) sourceResult = await finishBoundWorktree({ workspace, branch: carrierTaskBranch(dialect,id), sourceBinding: retained, bindGit,
            publish: publishSourceCandidate, readOnly: effectsOf(spec) === "read-only", onTrace: spec.onSourceResult, message: [`${item.office ?? "office"} duty ${item.scope ?? id}`, `${dialect.label} task ${id}`] });
          if (session?.ok === true) {
            await removeBoundWorktree({ workspace, sourceBinding: retained, bindGit });
            rmSync(keptMarker(dialect, environment, id), { force: true });
          } else writeFileSync(keptMarker(dialect, environment, id), `${JSON.stringify({ taskId:id, workspace, sourceBinding:retained, kept:new Date().toISOString() })}\n`, { mode:0o600 });
        } catch (error) {
          writeFileSync(keptMarker(dialect, environment, id), `${JSON.stringify({ taskId:id, workspace, sourceBinding:retained, kept:new Date().toISOString() })}\n`, { mode:0o600 });
          throw error;
        }
        return sourceResult;
      }
      assertWorktreeOwner(source, workspace);
      let named = false;
      if (session?.ok === true) {
        if (effectsOf(spec) === "read-only") named = true;
        else {
          const trace = await finishCarrierWorktree(dialect, { workspace, taskId: id, responsibility: `${item.office ?? "office"} duty ${item.scope ?? id}`, commandRunner });
          named = carrierTraceNamed(trace);
        }
      }
      await releaseCarrierWorktree(dialect, { cwd: source, workspace, taskId: id, failed: !named, commandRunner, environment });
    },
  });
}
