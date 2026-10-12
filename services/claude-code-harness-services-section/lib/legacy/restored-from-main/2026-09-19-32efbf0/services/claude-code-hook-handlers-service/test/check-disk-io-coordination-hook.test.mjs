import test from "node:test";
import assert from "node:assert/strict";
import { BYPASS_ENV_VAR, LOCK_STATE_NAME, checkDiskIoCoordination, isDiskHeavyCommand, isStaleLock, npmSubcommandOf } from "../scripts/check-disk-io-coordination-hook.mjs";
import { POLICY_ENV_VAR } from "../scripts/machine-parameters.mjs";
import { harnessPolicy, lifecycleEvent, responseOf, textReader } from "./lifecycle-event.mjs";

const lockPath = "/state/disk-io-coordinator.lock";
const now = () => new Date("2026-09-12T12:00:00.000Z");
const bash = (command, { sessionId = "mine", event = "PreToolUse" } = {}) => lifecycleEvent({ event, tool: "Bash", toolInput: { command }, sessionId });

function recorder(files = {}) {
  const written = [];
  const removed = [];
  return {
    written,
    removed,
    options: {
      lockPath,
      environment: {},
      now,
      readText: textReader(files),
      writeText: async (path, text) => { written.push({ path, text }); },
      remove: async ({ path }) => { removed.push(path); },
    },
  };
}

test("a subcommand is read past npm's global options, including one that takes a value", () => {
  assert.equal(npmSubcommandOf(["install"]), "install");
  assert.equal(npmSubcommandOf(["--prefix", "some/path", "install"]), "install");
  assert.equal(npmSubcommandOf(["--silent", "test"]), "test");
  assert.equal(npmSubcommandOf(["--loglevel", "silly", "ci"]), "ci");
  assert.equal(npmSubcommandOf(["--prefix=some/path", "install"]), "install");
  assert.equal(npmSubcommandOf(["--version"]), undefined);
});

test("only a real npm install-family invocation is disk-heavy", () => {
  for (const command of ["npm install", "npm i foo", "npm ci", "npm update", "npm --prefix some/path install", "ls && npm ci"]) {
    assert.equal(isDiskHeavyCommand(command), true, command);
  }
  for (const command of ["npm test", "npm run build", "npm --prefix some/path test", "node x.mjs", 'commit-git-paths --message "no raw npm install"']) {
    assert.equal(isDiskHeavyCommand(command), false, command);
  }
});

test("a lock with no parseable start, or older than the stale window, is abandoned", () => {
  assert.equal(isStaleLock(null, now), true);
  assert.equal(isStaleLock({ startedAt: "not a date" }, now), true);
  assert.equal(isStaleLock({ startedAt: "2026-09-12T11:00:00.000Z" }, now), true);
  assert.equal(isStaleLock({ startedAt: "2026-09-12T11:55:00.000Z" }, now), false);
});

test("a free lock is taken, recording this session and its command", async () => {
  const held = recorder();
  assert.equal(responseOf(await checkDiskIoCoordination(bash("npm ci"), held.options)).disposition, "continue");
  assert.equal(held.written.length, 1);
  assert.equal(held.written[0].path, lockPath);
  assert.deepEqual(JSON.parse(held.written[0].text), { sessionId: "mine", command: "npm ci", startedAt: "2026-09-12T12:00:00.000Z" });
});

test("another live session's lock blocks, its own lock and a stale one do not", async () => {
  const live = { sessionId: "theirs", command: "npm install", startedAt: "2026-09-12T11:55:00.000Z" };
  const blocked = responseOf(await checkDiskIoCoordination(bash("npm install"), recorder({ [lockPath]: JSON.stringify(live) }).options));
  assert.equal(blocked.disposition, "block");
  assert.match(blocked.reason, /another session \(theirs\)/);
  assert.match(blocked.reason, /repeated disk\/WSL crashes/);
  assert.equal(responseOf(await checkDiskIoCoordination(bash("npm install"), recorder({ [lockPath]: JSON.stringify({ ...live, sessionId: "mine" }) }).options)).disposition, "continue");
  assert.equal(responseOf(await checkDiskIoCoordination(bash("npm install"), recorder({ [lockPath]: JSON.stringify({ ...live, startedAt: "2026-09-12T11:00:00.000Z" }) }).options)).disposition, "continue");
});

test("the PostToolUse projection releases only this session's own lock", async () => {
  const mine = recorder({ [lockPath]: JSON.stringify({ sessionId: "mine", command: "npm ci", startedAt: "2026-09-12T11:59:00.000Z" }) });
  assert.equal(responseOf(await checkDiskIoCoordination(bash("npm ci", { event: "PostToolUse" }), mine.options)).disposition, "continue");
  assert.deepEqual(mine.removed, [lockPath]);
  const theirs = recorder({ [lockPath]: JSON.stringify({ sessionId: "theirs", command: "npm ci", startedAt: "2026-09-12T11:59:00.000Z" }) });
  await checkDiskIoCoordination(bash("npm ci", { event: "PostToolUse" }), theirs.options);
  assert.deepEqual(theirs.removed, []);
});

test("a lock that cannot be written fails open rather than blocking every install", async () => {
  const failing = recorder();
  failing.options.writeText = async () => { throw new Error("read-only filesystem"); };
  assert.equal(responseOf(await checkDiskIoCoordination(bash("npm ci"), failing.options)).disposition, "continue");
});

test("a non-Bash call, a light command, and the explicit bypass touch no lock", async () => {
  const light = recorder();
  assert.equal(responseOf(await checkDiskIoCoordination(bash("npm test"), light.options)).disposition, "continue");
  assert.equal(responseOf(await checkDiskIoCoordination(lifecycleEvent({ event: "PreToolUse", tool: "Write", toolInput: { file_path: "a.mjs" } }), light.options)).disposition, "continue");
  assert.equal(responseOf(await checkDiskIoCoordination(bash("npm ci"), { ...light.options, environment: { [BYPASS_ENV_VAR]: "1" } })).disposition, "continue");
  assert.deepEqual(light.written, []);
});

test("with no override the lock is in the state directory the machine's own policy names", async () => {
  const policyPath = "/repo/lib/machine/services/harness/agent-harness-policy.json";
  const written = [];
  const response = responseOf(await checkDiskIoCoordination(bash("npm ci"), {
    environment: { [POLICY_ENV_VAR]: policyPath, CLAUDE_PROJECT_DIR: "/repo" },
    now,
    readText: textReader({ [policyPath]: JSON.stringify(harnessPolicy()) }),
    writeText: async (path, text) => { written.push({ path, text }); },
    remove: async () => {},
  }));
  assert.equal(response.disposition, "continue");
  assert.equal(written[0].path, `/repo/lib/machine/services/harness/data/state/${LOCK_STATE_NAME}`);
});
