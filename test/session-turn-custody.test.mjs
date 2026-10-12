import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { harnessCapacitySnapshot, readHarnessSessionArtifacts, releaseProviderTurn, reserveProviderTurn,
  resumeHarnessSession, retryTransientHarnessSession, waitForHarnessSession } from "../src/carrier/session.mjs";

const dialect = Object.freeze({
  name: "fixture",
  label: "fixture",
  unit: "fixture-task",
  pool: "fixture-provider",
  reservationKind: "fixture-provider-turn",
  environment: [],
  resumeArguments: () => ["resume"],
  startArguments: () => ["start"],
  transient: () => false,
  startupFailure: () => false,
  readSession(directory) {
    const events = readFileSync(path.join(directory, "events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    return { thread: events[0]?.thread_id, message: readFileSync(path.join(directory, "last-message.txt"), "utf8").trim(), errors: [] };
  },
});

test("a resumed turn cannot consume or overwrite a task's stale completion artifacts", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "harness-turn-custody-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "exit-code"), "0\n");
  writeFileSync(path.join(root, "events.jsonl"), '{"thread_id":"prior-thread"}\n');
  writeFileSync(path.join(root, "last-message.txt"), "prior turn\n");

  const systemRunner = async (command, args) => {
    assert.equal(command, "systemd-run");
    const separator = args.indexOf("--");
    const invocation = args.slice(separator + 1);
    const [, , , , , eventsFile, stderrFile, lastFile, exitFile] = invocation;
    mkdirSync(path.dirname(eventsFile), { recursive: true });
    writeFileSync(eventsFile, '{"thread_id":"resumed-thread","type":"turn.completed"}\n');
    writeFileSync(stderrFile, "");
    writeFileSync(lastFile, "resumed turn\n");
    writeFileSync(exitFile, "0\n");
    return { exitCode: 0, stdout: "", stderr: "" };
  };

  const result = await resumeHarnessSession(dialect, {
    thread: "resumed-thread",
    prompt: "continue",
    directory: root,
    cwd: root,
    unitTask: "work-item",
    timeoutMs: 100,
    systemRunner,
    retryDelaysMs: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.thread, "resumed-thread");
  assert.equal(result.message, "resumed turn");
  assert.equal(result.turn, 1);
  assert.equal(readFileSync(path.join(root, "exit-code"), "utf8"), "0\n");
  assert.equal(readFileSync(path.join(root, "last-message.txt"), "utf8"), "prior turn\n");
  assert.match(result.artifactDir, /turns[/\\]turn-000001$/u);
  assert.deepEqual(readHarnessSessionArtifacts(dialect, root), result);
});

test("a pre-thread retry copies its witnessed prompt into a new immutable turn", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "harness-startup-retry-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previous = path.join(root, "turns", "turn-000001");
  mkdirSync(previous, { recursive: true });
  writeFileSync(path.join(previous, "prompt.txt"), "original admitted duty\n");
  writeFileSync(path.join(previous, "exit-code"), "75\n");
  const first = { exitCode: 75, turn: 1, artifactDir: previous, errors: [] };
  const observedPrompts = [];
  const systemRunner = async (command, args) => {
    assert.equal(command, "systemd-run");
    const invocation = args.slice(args.indexOf("--") + 1);
    const inputFile = invocation[4];
    const eventsFile = invocation[5];
    const stderrFile = invocation[6];
    const lastFile = invocation[7];
    const exitFile = invocation[8];
    observedPrompts.push(readFileSync(inputFile, "utf8"));
    mkdirSync(path.dirname(eventsFile), { recursive: true });
    writeFileSync(eventsFile, '{"thread_id":"retried-thread"}\n');
    writeFileSync(stderrFile, "");
    writeFileSync(lastFile, "retried result\n");
    writeFileSync(exitFile, "0\n");
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const retryDialect = Object.freeze({ ...dialect, transient: result => result.exitCode === 75 });
  const result = await retryTransientHarnessSession(retryDialect, first, {
    artifactDir: root, cwd: root, taskId: "startup-retry", retryDelaysMs: [0], systemRunner,
  });
  assert.equal(result.ok, true);
  assert.equal(result.turn, 2);
  assert.deepEqual(observedPrompts, ["original admitted duty\n"]);
  assert.equal(readFileSync(path.join(previous, "prompt.txt"), "utf8"), "original admitted duty\n");
});

test("waiting from a task root watches the latest turn instead of a stale root exit marker", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "harness-wait-turn-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "exit-code"), "0\n");
  const current = path.join(root, "turns", "turn-000001");
  mkdirSync(current, { recursive: true });
  writeFileSync(path.join(current, "events.jsonl"), '{"thread_id":"current-thread"}\n');
  writeFileSync(path.join(current, "last-message.txt"), "current result\n");
  let checked = false;
  const systemRunner = async (command) => {
    assert.equal(command, "systemctl");
    if (!checked) {
      writeFileSync(path.join(current, "exit-code"), "0\n");
      checked = true;
    }
    return { exitCode: 0, stdout: "LoadState=loaded\nActiveState=inactive\n" };
  };
  const result = await waitForHarnessSession(dialect, {
    artifactDir: root, unit: "fixture-task-work-item", timeoutMs: 100, pollIntervalMs: 0, systemRunner,
  });
  assert.equal(checked, true);
  assert.equal(result.thread, "current-thread");
  assert.equal(result.message, "current result");
  assert.equal(result.exitCode, 0);
});

test("a stale root exit marker cannot release provider capacity while the current turn is active", async (t) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "harness-live-turn-lease-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const home = path.join(temporary, "home");
  const artifacts = path.join(temporary, "task");
  const current = path.join(artifacts, "turns", "turn-000001");
  mkdirSync(current, { recursive: true });
  writeFileSync(path.join(artifacts, "exit-code"), "0\n");
  const environment = { HOME: home, METROPLAT_FIXTURE_PROVIDER_CONCURRENCY: "1" };
  let active = true;
  const systemRunner = async (command, args) => args.includes("list-units")
    ? { exitCode: 0, stdout: "" }
    : { exitCode: 0, stdout: `LoadState=loaded\nActiveState=${active ? "active" : "inactive"}\n` };
  const reservation = await reserveProviderTurn(dialect, {
    scopeKey: "scope-1", executionIdentity: "execution-1", taskId: "work-item", artifactDir: artifacts,
    environment, host: { cores: 1, availableMemoryMB: 2_000 }, systemRunner,
  });
  assert.equal(reservation.acquired, true);
  await releaseProviderTurn(dialect, reservation, { systemRunner });
  assert.equal(harnessCapacitySnapshot(dialect, environment, { cores: 1, availableMemoryMB: 2_000 }).active, 1);
  writeFileSync(path.join(current, "exit-code"), "0\n");
  active = false;
  await releaseProviderTurn(dialect, reservation, { systemRunner });
  assert.equal(harnessCapacitySnapshot(dialect, environment, { cores: 1, availableMemoryMB: 2_000 }).active, 0);
});
