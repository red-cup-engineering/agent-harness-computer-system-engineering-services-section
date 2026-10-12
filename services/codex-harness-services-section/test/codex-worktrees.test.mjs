import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertNotSharedCheckout, codexDialect, codexTaskWorktree, prepareCodexWorktree, releaseCodexWorktree } from "../src/codex-exec.mjs";
import { codexAgencyWorkProvider, codexWorkspaces } from "../src/agency-work.mjs";
import { runCodexTask } from "../src/operations.mjs";

// Task worktrees default to the machine's state directory; tests keep theirs in a temporary one.
const worktrees = mkdtempSync(path.join(tmpdir(), "codex-test-worktrees-"));
process.env.METROPLAT_CODEX_WORKTREES = worktrees;
// The provider's shared capacity ledger lives under HOME: tests do not queue behind the live node's sessions.
process.env.HOME = mkdtempSync(path.join(tmpdir(), "codex-test-home-"));

const fakeCodex = fileURLToPath(new URL("./fixtures/fake-codex", import.meta.url));

function git(root, ...arguments_) {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const parent = mkdtempSync(path.join(tmpdir(), "codex-worktrees-"));
  const origin = path.join(parent, "origin.git");
  const seed = path.join(parent, "seed");
  const main = path.join(parent, "main");
  const dataRoot = path.join(parent, "state");
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
  return { parent, main, dataRoot };
}

// Stands in for the house command executor: pnpm is skipped, every other step runs for real.
const runner = (request) => {
  if (request.command.endsWith("/pnpm")) return { result: { status: 0, stdout: "", stderr: "", error: "" } };
  const result = spawnSync(request.command, request.arguments, { cwd: request.directory, encoding: "utf8", env: request.environment ?? process.env, input: request.input ?? undefined });
  return { result: { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message ?? "" } };
};

const taskOf = (id, effects = "repository-write") => ({ id, state: "queued", assignment: { responsibility: `isolated ${id}`, instruction: "write the fixture", receivingCheck: "the file exists", effects } });

test("the exec argument builder takes a task worktree, never the repository's checkout", (context) => {
  const setup = fixture();
  context.after(() => rmSync(setup.parent, { recursive: true, force: true }));
  const workspace = codexTaskWorktree("task-a");
  assert.equal(path.dirname(workspace), worktrees);
  mkdirSync(workspace, { recursive: true });
  const common = { sandbox: "workspace-write", lastFile: "/tmp/last.txt" };
  const args = codexDialect.startArguments({ ...common, cwd: workspace });
  assert.equal(args[args.indexOf("-C") + 1], workspace);
  assert.throws(() => codexDialect.startArguments({ ...common, cwd: setup.main }), /never runs in the shared checkout/u);
  const inside = path.join(setup.main, "sub");
  mkdirSync(inside);
  assert.throws(() => codexDialect.startArguments({ ...common, cwd: inside }), /never runs in the shared checkout/u);
  assert.throws(() => codexDialect.resumeArguments({ ...common, cwd: setup.main, thread: "t" }), /never runs in the shared checkout/u);
  assert.throws(() => codexDialect.startArguments({ ...common }), /own task worktree/u);
  assert.doesNotThrow(() => codexDialect.resumeArguments({ ...common, cwd: workspace, thread: "t" }));
});

test("a task worktree opened by the rail is a linked worktree, never the shared checkout", async (context) => {
  const setup = fixture();
  context.after(() => rmSync(setup.parent, { recursive: true, force: true }));
  const opened = await prepareCodexWorktree({ cwd: setup.main, taskId: "linked", effects: "read-only", commandRunner: runner });
  assert.equal(opened.workspace, codexTaskWorktree("linked"));
  assert.equal(readFileSync(path.join(opened.workspace, "main.txt"), "utf8"), "main stays clean\n");
  assert.doesNotThrow(() => assertNotSharedCheckout(opened.workspace));
  assert.equal(git(setup.main, "status", "--porcelain"), "");
  await releaseCodexWorktree({ cwd: setup.main, workspace: opened.workspace, taskId: "linked", failed: false, commandRunner: runner });
  assert.equal(existsSync(opened.workspace), false);
});

test("opening fails closed: no session runs when the worktree cannot be opened", async (context) => {
  const setup = fixture();
  context.after(() => rmSync(setup.parent, { recursive: true, force: true }));
  const sessions = [];
  const refusing = (request) => request.arguments[0] === "worktree" ? { result: { status: 128, stdout: "", stderr: "cannot add", error: "" } } : runner(request);
  const writes = [];
  const task = await runCodexTask({
    dataRoot: setup.dataRoot, cwd: setup.main, task: taskOf("closed"), slot: 0, codex: fakeCodex, commandRunner: refusing, timeoutMs: 2_000,
    systemRunner: async (...call) => { sessions.push(call); return { exitCode: 127 }; }, writeTask: (value) => { writes.push(value); return value; },
  });
  assert.equal(task.state, "failed");
  assert.match(task.session.errors.join(" "), /could not be opened, so the task does not run/u);
  assert.deepEqual(sessions, []);
  assert.equal(existsSync(codexTaskWorktree("closed")), false);
  assert.equal(git(setup.main, "status", "--porcelain"), "");
});

test("each task runs in its own worktree: removed once its candidate is named", async (context) => {
  const setup = fixture();
  context.after(() => rmSync(setup.parent, { recursive: true, force: true }));
  const prior = Object.fromEntries(["FAKE_CODEX_WRITE_PATH"].map((name) => [name, process.env[name]]));
  process.env.FAKE_CODEX_WRITE_PATH = "task-change.txt";
  context.after(() => { for (const [name, value] of Object.entries(prior)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const systemRunner = async () => ({ exitCode: 127 });
  const common = { dataRoot: setup.dataRoot, cwd: setup.main, codex: fakeCodex, commandRunner: runner, systemRunner, timeoutMs: 2_000, writeTask: (value) => value };
  // Unreachable systemd falls back to a child in the worktree the task owns.
  const first = await runCodexTask({ ...common, task: taskOf("one"), slot: 0 });
  const second = await runCodexTask({ ...common, task: taskOf("two"), slot: 0 });
  assert.notEqual(first.workspace, second.workspace);
  for (const task of [first, second]) {
    assert.equal(task.workspace, codexTaskWorktree(task.id));
    assert.match(task.branch, /^codex\//u);
    assert.deepEqual(task.changedPaths, [{ status: "A", path: "task-change.txt" }]);
    assert.equal(task.state, "done");
    assert.equal(task.integration.queued, true);
    assert.equal(task.integration.candidate.commit, task.commit);
    assert.equal(existsSync(task.workspace), false, "the worktree is removed once its candidate is named");
  }
  assert.equal(readFileSync(path.join(setup.main, "main.txt"), "utf8"), "main stays clean\n");
  assert.equal(git(setup.main, "status", "--porcelain"), "");
  assert.equal(existsSync(path.join(setup.main, "task-change.txt")), false);
});

test("a failed task's worktree stays for inspection and only the last few are kept", async (context) => {
  const setup = fixture();
  context.after(() => rmSync(setup.parent, { recursive: true, force: true }));
  const ids = ["f1", "f2", "f3", "f4"];
  for (const id of ids) {
    const opened = await prepareCodexWorktree({ cwd: setup.main, taskId: id, effects: "read-only", commandRunner: runner });
    const kept = await releaseCodexWorktree({ cwd: setup.main, workspace: opened.workspace, taskId: id, failed: true, commandRunner: runner, keep: 2 });
    assert.equal(kept, true);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.deepEqual(ids.map((id) => existsSync(codexTaskWorktree(id))), [false, false, true, true]);
  assert.match(git(setup.main, "branch", "--list", "codex/f1"), /codex\/f1/u);
});

test("the work rail's Codex acts each get a worktree: execution lands as a candidate, receiving only reads", async (context) => {
  const setup = fixture();
  context.after(() => rmSync(setup.parent, { recursive: true, force: true }));
  const workspaces = codexWorkspaces({ repository: setup.main, commandRunner: runner });
  const item = { office: "junior-engineer", scope: "slice-1" };

  const executing = await workspaces.open({ item, id: "agency-exec", receiving: false });
  assert.equal(executing, codexTaskWorktree("agency-exec"));
  assert.doesNotThrow(() => assertNotSharedCheckout(executing));
  writeFileSync(path.join(executing, "duty.txt"), "done\n");
  await workspaces.close({ item, id: "agency-exec", receiving: false, workspace: executing, session: { ok: true } });
  assert.equal(existsSync(executing), false, "named a candidate, so the worktree is removed");
  assert.match(git(setup.main, "log", "-1", "--format=%B", "codex/agency-exec"), /junior-engineer duty slice-1/u);
  assert.equal(existsSync(path.join(setup.main, "duty.txt")), false);

  const failing = await workspaces.open({ item, id: "agency-fail", receiving: false });
  writeFileSync(path.join(failing, "partial.txt"), "half\n");
  await workspaces.close({ item, id: "agency-fail", receiving: false, workspace: failing, session: { ok: false } });
  assert.equal(existsSync(path.join(failing, "partial.txt")), true, "a failed act's worktree is kept for inspection");

  const reading = await workspaces.open({ item, id: "agency-receive", receiving: true });
  assert.equal(existsSync(path.join(reading, "node_modules")), false, "a reading act installs nothing");
  await workspaces.close({ item, id: "agency-receive", receiving: true, workspace: reading, session: { ok: true } });
  assert.equal(existsSync(reading), false);
  assert.equal(git(setup.main, "status", "--porcelain"), "");

  const refusing = codexWorkspaces({ repository: setup.main, commandRunner: (request) => request.arguments[0] === "worktree" ? { result: { status: 128, stdout: "", stderr: "no", error: "" } } : runner(request) });
  await assert.rejects(refusing.open({ item, id: "agency-closed", receiving: false }), /could not be opened, so the task does not run/u);
});

test("the work rail's Codex provider runs its session in the act's worktree, never its cwd", async (context) => {
  const setup = fixture();
  context.after(() => rmSync(setup.parent, { recursive: true, force: true }));
  const provider = codexAgencyWorkProvider({
    workerId: "codex-worker", dataRoot: setup.dataRoot, cwd: setup.main, codex: fakeCodex, commandRunner: runner, systemRunner: async () => ({ exitCode: 127 }), characterName: "Codex", nodeName: "node",
  });
  const item = { allocation: "alloc-1", scope: "scope-1", office: "junior-engineer", subject: "s", intent: "i", work: "w", skill: "k", delegation: { provider: "codex-worker" }, providerReservation: undefined };
  const original = process.env.FAKE_CODEX_WRITE_PATH;
  process.env.FAKE_CODEX_WRITE_PATH = "carrier-change.txt";
  context.after(() => { if (original === undefined) delete process.env.FAKE_CODEX_WRITE_PATH; else process.env.FAKE_CODEX_WRITE_PATH = original; });
  // Its message is not a typed outcome, so the act rejects after the session ran and closed.
  await assert.rejects(provider(item), /typed service outcome|observed execution context/u);
  const written = existsSync(path.join(setup.main, "carrier-change.txt"));
  assert.equal(written, false, "nothing was written in the shared checkout");
  assert.match(git(setup.main, "log", "-1", "--format=%B", "codex/agency-" + (await import("node:crypto")).createHash("sha256").update("alloc-1").digest("hex").slice(0, 32)), /junior-engineer duty scope-1/u);
});
