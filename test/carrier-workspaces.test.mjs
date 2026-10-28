import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { runHarnessSession } from "../src/carrier/session.mjs";
import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import {
  assertNotSharedCheckout, carrierTaskWorktree, carrierWorkspaces, carrierWorktreeRoot, prepareCarrierWorktree, pruneRetiredWorktreeRoot, releaseCarrierWorktree,
} from "../src/carrier/workspace.mjs";
import { claudeCodeDialect } from "../services/claude-code-harness-services-section/src/claude-code-session.mjs";
import { antigravityConfinement, antigravityDialect } from "../services/antigravity-harness-services-section/src/antigravity-session.mjs";
import { claudeWorkspaces } from "../services/claude-code-harness-services-section/src/agency-work.mjs";
import { antigravityWorkspaces } from "../services/antigravity-harness-services-section/src/agency-work.mjs";

const root = mkdtempSync(path.join(scratchRoot(), "carrier-workspaces-"));
const environment = {
  METROPLAT_CLAUDE_CODE_WORKTREES: path.join(root, "claude-trees"),
  METROPLAT_ANTIGRAVITY_WORKTREES: path.join(root, "antigravity-trees"),
};
process.on("exit", () => rmSync(root, { recursive: true, force: true }));

function git(directory, ...arguments_) {
  const result = spawnSync("git", arguments_, { cwd: directory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const parent = mkdtempSync(path.join(root, "repo-"));
  const origin = path.join(parent, "origin.git");
  const seed = path.join(parent, "seed");
  const main = path.join(parent, "main");
  git(parent, "init", "--bare", "--initial-branch=main", origin);
  git(parent, "init", "--initial-branch=main", seed);
  git(seed, "config", "user.email", "house@example.invalid");
  git(seed, "config", "user.name", "House");
  writeFileSync(path.join(seed, "main.txt"), "main stays clean\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "base");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-u", "origin", "main");
  git(parent, "clone", origin, main);
  git(main, "config", "user.email", "house@example.invalid");
  git(main, "config", "user.name", "House");
  return { parent, main };
}

// Stands in for the house command executor: pnpm is recorded and skipped, every other step runs for real.
function recordingRunner() {
  const installs = [];
  const runner = (request) => {
    if (request.command.endsWith("/pnpm")) { installs.push(request.directory); return { result: { status: 0, stdout: "", stderr: "", error: "" } }; }
    const result = spawnSync(request.command, request.arguments, { cwd: request.directory, encoding: "utf8", env: request.environment ?? process.env, input: request.input ?? undefined });
    return { result: { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message ?? "" } };
  };
  return Object.assign(runner, { installs });
}

function carrierHome() {
  const home = mkdtempSync(path.join(root, "home-"));
  const login = path.join(home, ".gemini", "antigravity-cli");
  mkdirSync(login, { recursive: true });
  writeFileSync(path.join(login, "antigravity-oauth-token"), "{}");
  return home;
}

const duty = (office = "junior-engineer", requiresCapabilities = []) => ({ office, scope: `scope-${office}`, requiresCapabilities });

test("the carrier's root and task worktree are per dialect and per task", () => {
  const owner = path.join(root, "owning-section");
  assert.equal(carrierWorktreeRoot(claudeCodeDialect, { AGENT_HARNESS_SECTION_ROOT: owner }), dataKindDirectory(owner, "state", "claude-code-worktree"));
  assert.equal(carrierWorktreeRoot(antigravityDialect, { AGENT_HARNESS_SECTION_ROOT: owner }), dataKindDirectory(owner, "state", "antigravity-worktree"));
  assert.equal(path.dirname(carrierTaskWorktree(claudeCodeDialect, "t1", environment)), environment.METROPLAT_CLAUDE_CODE_WORKTREES);
  assert.equal(carrierWorktreeRoot(antigravityDialect, environment), environment.METROPLAT_ANTIGRAVITY_WORKTREES);
  assert.notEqual(carrierTaskWorktree(claudeCodeDialect, "t1", environment), carrierTaskWorktree(claudeCodeDialect, "t2", environment));
  assert.throws(() => carrierTaskWorktree(claudeCodeDialect, "../escape", environment), /task id/u);
});

test("the Claude Code argument builder takes a task worktree, never the repository's checkout", async () => {
  const setup = fixture();
  const runner = recordingRunner();
  const opened = await prepareCarrierWorktree(claudeCodeDialect, { cwd: setup.main, taskId: "claude-a", effects: "read-only", commandRunner: runner, environment });
  assert.doesNotThrow(() => assertNotSharedCheckout(claudeCodeDialect, opened.workspace));
  const common = { effects: "read-only", artifactDir: path.join(root, "claude-a-artifacts"), taskId: "claude-a" };
  assert.doesNotThrow(() => claudeCodeDialect.startArguments({ ...common, cwd: opened.workspace }));
  assert.doesNotThrow(() => claudeCodeDialect.resumeArguments({ ...common, cwd: opened.workspace, thread: "t" }));
  assert.throws(() => claudeCodeDialect.startArguments({ ...common, cwd: setup.main }), /never runs in the shared checkout/u);
  assert.throws(() => claudeCodeDialect.resumeArguments({ ...common, cwd: path.join(setup.main, "sub"), thread: "t" }), /never runs in the shared checkout/u);
  assert.throws(() => claudeCodeDialect.startArguments({ ...common }), /own task worktree/u);
});

test("the Antigravity argument builder and unit builder take a task worktree, never the repository's checkout", async () => {
  const setup = fixture();
  const runner = recordingRunner();
  const home = carrierHome();
  const opened = await prepareCarrierWorktree(antigravityDialect, { cwd: setup.main, taskId: "agy-a", effects: "repository-write", commandRunner: runner, environment });
  const common = { effects: "workspace-write", home };
  assert.doesNotThrow(() => antigravityDialect.startArguments({ ...common, cwd: opened.workspace }));
  assert.doesNotThrow(() => antigravityDialect.resumeArguments({ ...common, cwd: opened.workspace, thread: "t" }));
  assert.throws(() => antigravityDialect.startArguments({ ...common, cwd: setup.main }), /never runs in the shared checkout/u);
  assert.throws(() => antigravityDialect.resumeArguments({ ...common, cwd: setup.main, thread: "t" }), /never runs in the shared checkout/u);
  assert.throws(() => antigravityConfinement({ ...common, cwd: setup.main }), /never runs in the shared checkout/u);
  assert.throws(() => antigravityConfinement({ ...common }), /own task worktree/u);

  // The unit's working directory is the task worktree; a writing unit may write it and its own git directory only.
  const calls = [];
  const systemRunner = async (command, args) => { calls.push({ command, args }); return { exitCode: 1, stdout: "", stderr: "refused" }; };
  await assert.rejects(runHarnessSession(antigravityDialect, { prompt: "p", cwd: opened.workspace, artifactDir: path.join(root, "agy-a-artifacts"), taskId: "agy-a", systemRunner, ...common }), /needs its transient unit/u);
  const unit = calls.at(-1).args;
  assert.ok(unit.includes(`--working-directory=${opened.workspace}`));
  const writable = unit.filter((argument) => argument.startsWith("--property=ReadWritePaths=-")).map((argument) => argument.slice("--property=ReadWritePaths=-".length));
  assert.ok(writable.includes(opened.workspace));
  assert.ok(writable.includes(git(opened.workspace, "rev-parse", "--absolute-git-dir")));
  assert.ok(writable.includes(home));
  assert.ok(!writable.includes(setup.main) && !writable.includes(path.join(setup.main, ".git")), "the repository's shared checkout and git directory stay read-only");
  assert.ok(unit.includes("--property=ProtectHome=read-only") && unit.includes("--property=ProtectSystem=strict"));
  assert.ok(unit.includes(`--setenv=HOME=${home}`));

  // A reading unit runs in its own tree and may write none of it.
  const reading = await prepareCarrierWorktree(antigravityDialect, { cwd: setup.main, taskId: "agy-r", effects: "read-only", commandRunner: runner, environment });
  await assert.rejects(runHarnessSession(antigravityDialect, { prompt: "p", cwd: reading.workspace, artifactDir: path.join(root, "agy-r-artifacts"), taskId: "agy-r", systemRunner, effects: "read-only", home }), /needs its transient unit/u);
  const readingUnit = calls.at(-1).args;
  assert.ok(readingUnit.includes(`--working-directory=${reading.workspace}`));
  assert.ok(!readingUnit.some((argument) => argument === `--property=ReadWritePaths=-${reading.workspace}`));

  // Refused before any unit is built when the working directory is the shared checkout.
  const before = calls.length;
  await assert.rejects(runHarnessSession(antigravityDialect, { prompt: "p", cwd: setup.main, artifactDir: path.join(root, "agy-s-artifacts"), taskId: "agy-s", systemRunner, ...common }), /never runs in the shared checkout/u);
  assert.equal(calls.length, before);
});

test("a writing duty opens a per-task tree with packages, a reading duty a read-only one without", async () => {
  const setup = fixture();
  const runner = recordingRunner();
  for (const [dialect, workspaces, writing] of [
    [claudeCodeDialect, claudeWorkspaces({ repository: setup.main, commandRunner: runner, environment }), duty("junior-engineer", ["duty-worktree-open"])],
    [antigravityDialect, antigravityWorkspaces({ repository: setup.main, commandRunner: runner, environment }), duty("junior-engineer", ["duty-worktree-commit"])],
  ]) {
    const writer = await workspaces.open({ item: writing, id: `${dialect.name}-write`, receiving: false });
    assert.equal(writer, carrierTaskWorktree(dialect, `${dialect.name}-write`, environment));
    assert.ok(runner.installs.includes(writer));
    assert.doesNotThrow(() => assertNotSharedCheckout(dialect, writer));
    writeFileSync(path.join(writer, "made.txt"), "by the duty\n");

    const reader = await workspaces.open({ item: duty(), id: `${dialect.name}-read`, receiving: false });
    const receiver = await workspaces.open({ item: duty(), id: `${dialect.name}-receive`, receiving: true });
    assert.notEqual(reader, writer);
    assert.notEqual(reader, receiver);
    assert.ok(!runner.installs.includes(reader) && !runner.installs.includes(receiver));
    assert.equal(readFileSync(path.join(reader, "main.txt"), "utf8"), "main stays clean\n");

    // A reading act that ended well leaves nothing; a failed one is kept, marked.
    await workspaces.close({ item: duty(), id: `${dialect.name}-read`, receiving: false, workspace: reader, session: { ok: true } });
    assert.equal(existsSync(reader), false);
    await workspaces.close({ item: duty(), id: `${dialect.name}-receive`, receiving: true, workspace: receiver, session: { ok: false } });
    assert.equal(existsSync(receiver), true);
    assert.equal(existsSync(`${receiver}.kept`), true);
    assert.equal(git(setup.main, "status", "--porcelain"), "", "the shared checkout was never touched");
  }
});

test("opening fails closed: no worktree, no session, nothing in the repository", async () => {
  const setup = fixture();
  const broken = (request) => (request.arguments.includes("worktree") ? { result: { status: 128, stdout: "", stderr: "fatal: cannot add", error: "" } } : recordingRunner()(request));
  for (const [dialect, workspaces] of [
    [claudeCodeDialect, claudeWorkspaces({ repository: setup.main, commandRunner: broken, environment })],
    [antigravityDialect, antigravityWorkspaces({ repository: setup.main, commandRunner: broken, environment })],
  ]) {
    await assert.rejects(workspaces.open({ item: duty(), id: `${dialect.name}-broken`, receiving: false }), new RegExp(`${dialect.label} task worktree .* could not be opened`, "u"));
  }
  assert.equal(git(setup.main, "status", "--porcelain"), "");
  await assert.rejects(prepareCarrierWorktree(claudeCodeDialect, { cwd: setup.main, taskId: "x", commandRunner: broken, environment }), /could not be opened/u);
});

test("failed trees beyond the retention bound are removed", async () => {
  const setup = fixture();
  const runner = recordingRunner();
  const ids = ["k1", "k2", "k3"];
  for (const [index, id] of ids.entries()) {
    const opened = await prepareCarrierWorktree(claudeCodeDialect, { cwd: setup.main, taskId: id, effects: "read-only", commandRunner: runner, environment });
    utimesSync(opened.workspace, new Date(), new Date());
    const marker = `${opened.workspace}.kept`;
    assert.equal(await releaseCarrierWorktree(claudeCodeDialect, { cwd: setup.main, workspace: opened.workspace, taskId: id, failed: true, commandRunner: runner, environment, keep: 2 }), true);
    utimesSync(marker, new Date(Date.now() + index * 1000), new Date(Date.now() + index * 1000));
  }
  assert.deepEqual(ids.map((id) => existsSync(carrierTaskWorktree(claudeCodeDialect, id, environment))), [false, true, true]);
});

test("the retired shared root is pruned once, clean old entries only, newest kept", async () => {
  const setup = fixture();
  const runner = recordingRunner();
  const retired = path.join(root, "duty-worktrees");
  mkdirSync(retired, { recursive: true });
  const names = ["old-clean", "old-dirty", "recent", "newest-a", "newest-b", "newest-c", "newest-d", "newest-e"];
  const now = Date.now();
  for (const name of names) {
    git(setup.main, "worktree", "add", "--detach", path.join(retired, name), "origin/main");
    if (name === "old-dirty") writeFileSync(path.join(retired, name, "unfinished.txt"), "work in progress\n");
    const age = name.startsWith("old") ? 30 * 24 * 3_600_000 : name === "recent" ? 3_600_000 : 60_000;
    const when = new Date(now - age - (name === "old-dirty" ? 1000 : 0));
    utimesSync(path.join(retired, name), when, when);
  }
  // Five newer entries stay by count, "recent" by grace; of the two old ones only the clean one goes.
  const removed = await pruneRetiredWorktreeRoot({ root: retired, repository: setup.main, commandRunner: runner, now });
  assert.deepEqual(removed, ["old-clean"]);
  assert.equal(existsSync(path.join(retired, "old-clean")), false);
  assert.equal(existsSync(path.join(retired, "old-dirty", "unfinished.txt")), true);
  assert.equal(existsSync(path.join(retired, "recent")), true);
  // Once: a second call, even with more to prune, does nothing.
  assert.deepEqual(await pruneRetiredWorktreeRoot({ root: retired, repository: setup.main, commandRunner: runner, now: now + 60 * 24 * 3_600_000 }), []);
  assert.equal(existsSync(path.join(retired, "recent")), true);
  // A missing root is nothing to prune.
  assert.deepEqual(await pruneRetiredWorktreeRoot({ root: path.join(root, "absent"), repository: setup.main, commandRunner: runner }), []);

  // The carrier prunes it when its first tree opens.
  const second = fixture();
  const other = path.join(root, "duty-worktrees-2");
  mkdirSync(other, { recursive: true });
  const workspaces = claudeWorkspaces({ repository: second.main, commandRunner: runner, environment, retired: [other] });
  await workspaces.open({ item: duty(), id: "prune-open", receiving: true });
  assert.equal(existsSync(path.join(other, ".retired")), true);
});
