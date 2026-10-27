import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "../../../test/support/scratch.mjs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { codexTaskArtifactDirectory, runCodexSession, recoverCodexSession } from "../src/codex-exec.mjs";
import { recoverCodexTasks, runCodexTask, writeCodexTask } from "../src/operations.mjs";

// Slots default to the machine's state directory; tests keep theirs in a temporary one.
process.env.METROPLAT_CODEX_WORKTREES = mkdtempSync(path.join(scratchRoot(), "codex-test-slots-"));

const fakeCodex = fileURLToPath(new URL("./fixtures/fake-codex", import.meta.url));
const temporaryRoot = () => mkdtempSync(path.join(scratchRoot(), "codex-task-test-"));
const task = (id, state) => ({
  kind: "codex-task",
  id,
  state,
  at: "2026-09-27T19:00:00.000Z",
  assignment: { responsibility: "preserve work", instruction: "do it", receivingCheck: "done", effects: "repository-write" },
});

test("recovery leaves a live runner and an unavailable manager untouched", async context => {
  const directory = temporaryRoot();
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, "events.jsonl"), '{"type":"thread.started","thread_id":"existing-thread"}\n');
  for (const status of [
    { exitCode: 0, stdout: "LoadState=loaded\nActiveState=active\n" },
    { exitCode: 1, stderr: "Failed to connect to bus" },
  ]) {
    const result = await recoverCodexSession({ artifactDir: directory, cwd: directory,
      systemRunner: async command => { assert.equal(command, "systemctl"); return status; } });
    assert.equal(result, undefined);
    assert.equal(existsSync(path.join(directory, "events.jsonl.interrupted-1")), false);
  }
});

test("recovery resumes the witnessed native thread after its runner disappears", async context => {
  const directory = temporaryRoot();
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const original = '{"type":"thread.started","thread_id":"thread-from-artifacts"}\n';
  writeFileSync(path.join(directory, "events.jsonl"), original);
  writeFileSync(path.join(directory, "prompt.txt"), "original allocated duty");
  let launches = 0;
  const systemRunner = async (command, args, options) => {
    if (command === "systemctl") return { exitCode: 0, stdout: "LoadState=not-found\nActiveState=inactive\n" };
    assert.equal(command, "systemd-run");
    assert.equal(args.includes("resume"), true);
    assert.equal(args.includes("thread-from-artifacts"), true);
    assert.equal(args.includes("mcp_servers.owning_node.required=true"), true);
    launches++;
    const separator = args.indexOf("--");
    spawn(args[separator + 1], args.slice(separator + 2), { cwd: options.cwd, stdio: "ignore" });
    return { exitCode: 0 };
  };
  const result = await recoverCodexSession({ artifactDir: directory, cwd: directory,
    codex: fakeCodex, requiredMcpServer: "owning_node", systemRunner,
    timeoutMs: 2_000, pollIntervalMs: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.thread, "thread-from-artifacts");
  assert.equal(readFileSync(path.join(directory, "events.jsonl.interrupted-1"), "utf8"), original);
  assert.equal(readFileSync(path.join(directory, "prompt.txt"), "utf8"), "original allocated duty");
  const recovered = await recoverCodexSession({ artifactDir: directory, cwd: directory,
    systemRunner: async () => { throw Error("completed session must use its durable receipt"); } });
  assert.equal(recovered.ok, true);
  assert.equal(launches, 1);
});

function git(root, ...arguments_) {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function repository(parent) {
  const origin = path.join(parent, "origin.git");
  const seed = path.join(parent, "seed");
  const main = path.join(parent, "main");
  git(parent, "init", "--bare", "--initial-branch=main", origin);
  git(parent, "init", "--initial-branch=main", seed);
  git(seed, "config", "user.email", "house@example.invalid");
  git(seed, "config", "user.name", "House");
  writeFileSync(path.join(seed, "base.txt"), "base\n");
  git(seed, "add", ".");
  git(seed, "commit", "-m", "base");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-u", "origin", "main");
  git(parent, "clone", origin, main);
  git(main, "config", "user.email", "house@example.invalid");
  git(main, "config", "user.name", "House");
  return main;
}

// Stands in for the house command executor: pnpm is skipped, every other step runs for real.
function workspaceRunner(request) {
  if (request.command.endsWith("/pnpm")) return { result: { status: 0, stdout: "", stderr: "", error: "" } };
  const result = spawnSync(request.command, request.arguments, { cwd: request.directory, encoding: "utf8", env: request.environment ?? process.env, input: request.input ?? undefined });
  return { result: { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error?.message ?? "" } };
}

test("runCodexSession derives its result from durable artifacts", async (context) => {
  const dataRoot = temporaryRoot();
  context.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  const directory = codexTaskArtifactDirectory(dataRoot, "artifact-result");
  const systemRunner = async (command, args, options) => {
    assert.equal(command, "systemd-run");
    assert.equal(args.includes("--unit=codex-task-artifact-result"), true);
    assert.equal(args.includes("--collect"), true);
    assert.equal(args.includes(`--working-directory=${dataRoot}`), true);
    // the unit gets the node's PATH, or it finds neither codex nor node
    // with the Node.js running this process first, so pnpm and tests never meet an older system node
    assert.equal(args.some((arg) => arg.startsWith(`--setenv=PATH=${path.dirname(process.execPath)}${path.delimiter}`)), true);
    const separator = args.indexOf("--");
    spawn(args[separator + 1], args.slice(separator + 2), { cwd: options.cwd, stdio: "ignore" });
    return { exitCode: 0 };
  };
  const result = await runCodexSession({
    prompt: "bounded assignment",
    cwd: dataRoot,
    artifactDir: directory,
    taskId: "artifact-result",
    codex: fakeCodex,
    systemRunner,
    timeoutMs: 2_000,
    pollIntervalMs: 5,
  });

  assert.deepEqual(result, {
    ok: true,
    exitCode: 0,
    thread: "thread-from-artifacts",
    message: "durable final message",
    usage: { input_tokens: 12, output_tokens: 7 },
    errors: [],
  });
  for (const name of ["prompt.txt", "events.jsonl", "stderr.txt", "last-message.txt", "exit-code"]) {
    assert.equal(existsSync(path.join(directory, name)), true, name);
  }
  assert.equal(readFileSync(path.join(directory, "exit-code"), "utf8"), "0\n");
});

test("a session the model had no room for resumes its thread after a pause", async (context) => {
  const dataRoot = temporaryRoot();
  context.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  const directory = codexTaskArtifactDirectory(dataRoot, "capacity-once");
  const marker = path.join(dataRoot, "capacity-reported");
  const launches = [];
  const systemRunner = async (command, args, options) => {
    launches.push(args);
    const separator = args.indexOf("--");
    spawn(args[separator + 1], args.slice(separator + 2), { cwd: options.cwd, stdio: "ignore", env: { ...process.env, FAKE_CODEX_CAPACITY_ONCE: marker } });
    return { exitCode: 0 };
  };
  const result = await runCodexSession({
    prompt: "bounded assignment",
    cwd: dataRoot,
    artifactDir: directory,
    taskId: "capacity-once",
    codex: fakeCodex,
    systemRunner,
    timeoutMs: 2_000,
    pollIntervalMs: 5,
    retryDelaysMs: [1],
  });

  assert.equal(result.ok, true);
  assert.equal(result.message, "durable final message");
  assert.equal(launches.length, 2);
  assert.equal(launches[1].includes("--unit=codex-task-capacity-once"), true);
  assert.deepEqual(launches[1].slice(launches[1].indexOf("resume") - 1, launches[1].indexOf("resume") + 1), ["exec", "resume"]);
  assert.equal(launches[1].includes("thread-from-artifacts"), true);
  assert.equal(readFileSync(path.join(directory, "exit-code.1"), "utf8"), "1\n");
  assert.match(readFileSync(path.join(directory, "events.jsonl.1"), "utf8"), /at capacity/u);
});

test("runCodexSession reports its in-process fallback", async (context) => {
  const dataRoot = temporaryRoot();
  context.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  const result = await runCodexSession({
    prompt: "fallback assignment",
    cwd: dataRoot,
    artifactDir: codexTaskArtifactDirectory(dataRoot, "fallback-result"),
    taskId: "fallback-result",
    codex: fakeCodex,
    systemRunner: async () => ({ exitCode: 127 }),
    timeoutMs: 2_000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, ["systemd-run unavailable; ran Codex in-process"]);
});

test("recovery writes done from an existing exit-code", async (context) => {
  const dataRoot = temporaryRoot();
  context.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  const existing = task("completed-across-restart", "running");
  writeCodexTask(dataRoot, existing);
  const directory = codexTaskArtifactDirectory(dataRoot, existing.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "events.jsonl"), '{"thread_id":"recovered-thread","usage":{"input_tokens":2}}\n');
  writeFileSync(path.join(directory, "stderr.txt"), "");
  writeFileSync(path.join(directory, "last-message.txt"), "recovered output\n");
  writeFileSync(path.join(directory, "exit-code"), "0\n");
  const writes = [];

  await recoverCodexTasks({
    dataRoot,
    environment: { ...process.env, HOME: dataRoot },
    latestTasks: new Map([[existing.id, existing]]),
    writeTask: (value) => { writes.push(value); return writeCodexTask(dataRoot, value); },
    systemRunner: async (_command, args) => {
      if (args.includes("list-units")) return { exitCode: 0, stdout: "" };
      throw new Error("systemd must not be queried for the completed unit");
    },
    now: () => "2026-09-27T20:00:00.000Z",
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].state, "done");
  assert.equal(writes[0].session.thread, "recovered-thread");
  assert.equal(writes[0].session.message, "recovered output");
});

test("recovery starts a queued task that never started", async (context) => {
  const dataRoot = temporaryRoot();
  context.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  const cwd = repository(dataRoot);
  const queued = task("never-started", "queued");
  const writes = [];
  const systemRunner = async (command, args, options) => {
    if (command !== "systemd-run") return { exitCode: 0, stdout: "" }; // the provider's capacity reading
    assert.equal(args.includes("--unit=codex-task-never-started"), true);
    const separator = args.indexOf("--");
    spawn(args[separator + 1], args.slice(separator + 2), { cwd: options.cwd, stdio: "ignore" });
    return { exitCode: 0 };
  };

  await recoverCodexTasks({
    dataRoot,
    cwd,
    codex: fakeCodex,
    latestTasks: new Map([[queued.id, queued]]),
    writeTask: (value) => { writes.push(value); return value; },
    systemRunner,
    commandRunner: workspaceRunner,
    timeoutMs: 2_000,
    pollIntervalMs: 5,
  });

  assert.deepEqual(writes.map((value) => value.state), ["running", "done"]);
  assert.equal(writes[0].workspace, path.join(process.env.METROPLAT_CODEX_WORKTREES, "never-started"));
  assert.equal(writes[1].session.message, "durable final message");
});

test("recovery fails a started task whose unit and completion marker are gone", async (context) => {
  const dataRoot = temporaryRoot();
  context.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  const lost = task("lost-session", "running");
  writeCodexTask(dataRoot, lost);
  mkdirSync(codexTaskArtifactDirectory(dataRoot, lost.id), { recursive: true });
  const writes = [];

  await recoverCodexTasks({
    dataRoot,
    environment: { ...process.env, HOME: dataRoot },
    latestTasks: new Map([[lost.id, lost]]),
    writeTask: (value) => { writes.push(value); return writeCodexTask(dataRoot, value); },
    systemRunner: async (_command, args) => args.includes("list-units")
      ? { exitCode: 0, stdout: "" } : { exitCode: 3 },
    now: () => "2026-09-27T20:00:00.000Z",
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].state, "failed");
});

test("a task withdrawn while it waited does not start", async () => {
  const writes = [];
  const withdrawn = { ...task("withdrawn-before-turn", "withdrawn"), ended: "2026-09-27T20:00:00.000Z" };
  const result = await runCodexTask({
    dataRoot: "/nonexistent",
    task: task("withdrawn-before-turn", "queued"),
    writeTask: (value) => { writes.push(value); return value; },
    readTask: () => withdrawn,
    systemRunner: async () => { throw new Error("a withdrawn task must not launch a session"); },
  });
  assert.equal(result.state, "withdrawn");
  assert.equal(writes.length, 0);
});

test("recovery leaves an already-ended task alone", async (context) => {
  const dataRoot = temporaryRoot();
  context.after(() => rmSync(dataRoot, { recursive: true, force: true }));
  const ended = task("already-ended", "done");
  const writes = [];

  const recovered = await recoverCodexTasks({
    dataRoot,
    latestTasks: new Map([[ended.id, ended]]),
    writeTask: (value) => { writes.push(value); return value; },
    systemRunner: async () => { throw new Error("an ended task has no recovery work"); },
  });

  assert.deepEqual(recovered, []);
  assert.deepEqual(writes, []);
});

test("an assignment never names its carrier; the node derives staffing from its outcomes and escalates after a miss", async () => {
  const { codexAssignment, codexAttemptsAt, codexCarrierStanding } = await import("../src/operations.mjs");
  const { bestStaffing } = await import("@red-cup-engineering/organizing/work/staffing");
  const base = { instruction: "do it", responsibility: "a change", receivingCheck: "it works" };
  assert.equal("scale" in codexAssignment(base), false);
  assert.throws(() => codexAssignment({ ...base, scale: "large" }), /never who carries it/u);
  const task = { id: "b", assignment: codexAssignment(base) };
  const history = new Map([["x", { id: "x", state: "done", integration: {}, model: "sol", assignment: codexAssignment({ ...base, responsibility: "other" }) }]]);
  const fresh = bestStaffing({ carriers: ["luna", "sol"], attempts: codexAttemptsAt(history, task), standing: codexCarrierStanding(history) });
  assert.deepEqual([fresh.carrier, fresh.effort], ["sol", "medium"]);
  history.set("a", { id: "a", state: "failed", model: "sol", assignment: codexAssignment(base) });
  const after = bestStaffing({ carriers: ["luna", "sol"], attempts: codexAttemptsAt(history, task), standing: codexCarrierStanding(history) });
  assert.deepEqual([after.carrier, after.effort], ["luna", "medium"]);
  assert.equal(bestStaffing({ attempts: codexAttemptsAt(history, task) }).effort, "high");
});
