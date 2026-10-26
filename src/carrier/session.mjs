/**
 * One agent-CLI session run to its end, whichever CLI carries it. A carrier is a dialect of this
 * runner: the CLI's own arguments, event stream and native session evidence (codex-harness
 * `codex-exec.mjs`, claude-code-harness `claude-code-session.mjs`). Everything else is the runner's
 * and the same for every carrier:
 *
 *   artifacts  the task's durable directory (`<dataRoot>/data/state/<dialect.tasks>-state/<id>/`) holds
 *              prompt.txt, events.jsonl, stderr.txt and the atomically published exit-code marker;
 *   unit       the CLI runs in the transient user unit `<dialect.unit>-<id>`, outside the node's
 *              cgroup and inside the shared agent resource slice, falling back to an in-process child where systemd is absent;
 *   capacity   the host-wide budget of concurrent sessions is the provider's
 *              (`~/.local/state/561-group/<dialect.pool>-provider-capacity`), shared by every
 *              process and model carrier of that provider, reserved under a kernel lock;
 *   carry-on   a session the provider stopped for want of room, or whose required MCP handshake
 *              failed before a thread started, is resumed on its own witnessed thread;
 *   recovery   only after the original runner is observably gone;
 *   authority  a dialect that confines its sessions (`confinement(options)`: `{ writable, environment? }`)
 *              is held to it by its unit, not by the CLI's word: the filesystem is read-only but for
 *              its artifacts and the `writable` paths its office's effects grant, /tmp is its own,
 *              and such a session never falls back to an unconfined child.
 *
 * A dialect is `{ name, label, pool, unit, tasks, reservationKind, executable, environment,
 * startArguments(options), resumeArguments(options), readSession(directory), transient(result),
 * startupFailure(result), stopReason?(directory), promptOf?(text), confinement?(options) }`; see each
 * harness's dialect for the CLI's own facts.
 */
import { CONTAINMENT_SLICE } from "../host-resource-hook.mjs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, cpus, freemem, homedir, tmpdir } from "node:os";
import path from "node:path";

import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { nodeFirstEnvironment } from "@red-cup-engineering/node-process-services-section/environment";

export const POLL_INTERVAL_MS = 2_000;
/** A provider with no room for the turn stops a session without the work having failed. */
export const RETRY_DELAYS_MS = Object.freeze([60_000, 120_000, 240_000, 480_000, 900_000, 900_000]);

const positiveInteger = (value) => Number.isInteger(value) && value > 0 ? value : undefined;
const hostResources = () => ({
  cores: typeof availableParallelism === "function" ? availableParallelism() : cpus().length,
  availableMemoryMB: freemem() / (1024 * 1024),
});
const envName = (dialect, suffix) => `METROPLAT_${dialect.pool.toUpperCase().replaceAll("-", "_")}_${suffix}`;

/**
 * Derive the number of concurrent sessions of one provider from the host at the moment a queue
 * drains. The usage ceiling is deliberately conservative when the token-usage admission and
 * provider limit are not available to this process. `METROPLAT_<POOL>_CONCURRENCY` overrides it
 * downward only.
 */
export function harnessConcurrency(dialect, environment = process.env, host = hostResources()) {
  const override = positiveInteger(Number(environment[envName(dialect, "CONCURRENCY")]));
  const cores = positiveInteger(host?.cores) ?? 1;
  const availableMemoryMB = Number(host?.availableMemoryMB);
  const memoryLimit = Number.isFinite(availableMemoryMB) && availableMemoryMB > 0
    ? Math.floor(availableMemoryMB / 1500)
    : 1;
  const statedLimits = [
    host?.usageLimit,
    host?.usageCeiling,
    host?.agentSessionTokenUsageAdmit?.limit,
    host?.providerLimit,
    host?.provider?.concurrencyLimit,
    environment[envName(dialect, "USAGE_LIMIT")],
    environment[envName(dialect, "PROVIDER_LIMIT")],
  ].map(Number).filter((value) => Number.isInteger(value) && value > 0);
  const usageLimit = statedLimits.length === 0 ? (dialect.usageLimit ?? 4) : Math.min(...statedLimits);
  const observedCeiling = Math.max(1, Math.min(Math.floor(cores / 2), memoryLimit, usageLimit));
  return override === undefined ? observedCeiling : Math.min(override, observedCeiling);
}

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const processIdentity = pid => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return { pid, boot: readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(),
      started: stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19] };
  } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
};
const sameProcess = value => {
  if (!Number.isInteger(value?.pid) || typeof value.boot !== "string" || typeof value.started !== "string") return false;
  const current = processIdentity(value.pid);
  return current !== undefined && current.boot === value.boot && current.started === value.started;
};
const hasProcessIdentity = value => Number.isInteger(value?.pid) && value.pid > 0
  && typeof value.boot === "string" && value.boot.length > 0
  && typeof value.started === "string" && value.started.length > 0;
async function ownerIsDefinitelyGone(owner) {
  // An absent or malformed owner is uncertainty, not permission to reclaim capacity.
  if (!hasProcessIdentity(owner)) return false;
  let current;
  try { current = processIdentity(owner.pid); } catch { return false; }
  return current === undefined || current.boot !== owner.boot || current.started !== owner.started;
}
// Capacity belongs to this host's provider, not to a checkout/worktree path that can differ
// between duties. The stable per-user state root is shared by every local executor process.
const sharedCapacityRoot = (dialect, environment = process.env) => path.join(environment.XDG_STATE_HOME || path.join(environment.HOME ?? homedir(), ".local", "state"), "561-group", `${dialect.pool}-provider-capacity`);
const capacityLockPath = root => path.join(root, "capacity.lock");
const reservationPath = (root, slot) => path.join(root, `slot-${slot}.json`);
const readText = file => { try { return readFileSync(file, "utf8"); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; } };
const readJson = file => {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return undefined; if (error instanceof SyntaxError) return null; throw error; }
};
const writeExclusiveJson = (file, value) => {
  const fd = openSync(file, "wx", 0o600);
  try { writeFileSync(fd, `${JSON.stringify(value)}\n`); }
  finally { closeSync(fd); }
};
const inProcessNote = dialect => `ran ${dialect.label} in-process`;

/** Serialize reservation updates with the kernel's advisory lock. The helper inherits the lock
 *  lifetime from this process and exits when stdin closes; a crash cannot leave a stale lock file
 *  whose partially written owner record could block every provider session. */
async function withCapacityLock(root, operation) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const file = capacityLockPath(root);
  const helper = spawn("flock", ["--exclusive", file, "sh", "-c", 'printf "LOCKED\\n"; cat'], { stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  helper.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  let closed = false;
  let released = false;
  // Once the update is done and stdin is closed, the helper's death releases the lock however it
  // dies (the kernel drops a dead process's flock), so only a death during the update is an error.
  const close = new Promise((resolve, reject) => {
    helper.once("error", reject);
    helper.once("close", (code, signal) => {
      closed = true;
      code === 0 || released ? resolve() : reject(new Error(`provider lock helper exited ${code ?? `by ${signal}`}: ${stderr}`));
    });
  });
  let ready = "";
  await new Promise((resolve, reject) => {
    helper.once("error", reject);
    helper.stdout.setEncoding("utf8").on("data", chunk => {
      ready += chunk;
      if (ready.includes("\n")) resolve();
    });
    helper.once("close", code => reject(new Error(`provider lock helper exited before acquiring the lock (${code}): ${stderr}`)));
  });
  close.catch(() => undefined);
  let result;
  try { result = await operation(); }
  finally {
    // A lock lost during the update leaves its exclusivity unknown, and `close` says so; one
    // released after it is no error, whatever ends the helper.
    released = !closed;
    helper.stdin.end();
    await close;
  }
  return result;
}

async function artifactRunnerIsDefinitelyGone(dialect, directory, unit, systemRunner) {
  const completionMarker = existsSync(path.join(directory, "exit-code"));
  let runner;
  try { runner = JSON.parse(readFileSync(path.join(directory, "runner-process.json"), "utf8")); }
  catch { runner = undefined; } // Missing or malformed birth identity stays uncertain unless systemd proves the unit is inactive.
  if (Number.isInteger(runner?.pid) && typeof runner.boot === "string" && typeof runner.started === "string") {
    let current;
    try { current = processIdentity(runner.pid); } catch { return false; }
    if (current !== undefined && current.boot === runner.boot && current.started === runner.started) return false;
    if ((readText(path.join(directory, "runner-notes.txt")) ?? "").includes(inProcessNote(dialect))) return completionMarker;
  } else if ((readText(path.join(directory, "runner-notes.txt")) ?? "").includes(inProcessNote(dialect))) {
    return false;
  }
  if (typeof unit !== "string" || unit.length === 0) return completionMarker;
  let status;
  try { status = await systemRunner("systemctl", ["--user", "show", `${unit}.service`, "-p", "LoadState", "-p", "ActiveState"], {}); }
  catch { return false; }
  if (status?.exitCode !== 0) return false;
  const state = Object.fromEntries((status.stdout ?? "").trim().split("\n").filter(Boolean).map(line => line.split("=")));
  if (state.LoadState === "not-found"
    || (state.LoadState === "loaded" && ["inactive", "failed"].includes(state.ActiveState))) return true;
  // An earlier turn may have left an exit marker in a legacy task directory. A live unit
  // always outranks that artifact when deciding whether its provider lease can be reclaimed.
  return false;
}

async function reservationWorkersAreDefinitelyGone(dialect, record, systemRunner = systemdCommand) {
  if (!record.artifactDir) return false;
  if (!existsSync(record.artifactDir)) return true;
  const exactTurn = /^turn-\d{6}$/u.test(path.basename(record.artifactDir));
  const directory = exactTurn ? record.artifactDir : latestHarnessTurnDirectory(record.artifactDir).directory;
  if (!await artifactRunnerIsDefinitelyGone(dialect, directory, record.unit, systemRunner)) return false;
  return resolutionWorkersAreDefinitelyGone(dialect, { ...record, artifactDir: directory }, systemRunner);
}

async function resolutionWorkersAreDefinitelyGone(dialect, record, systemRunner = systemdCommand) {
  if (!record.artifactDir || !existsSync(record.artifactDir)) return true;
  const resolutions = readdirSync(record.artifactDir).filter(name => /^resolution-\d+$/u.test(name));
  for (const name of resolutions) {
    const number = Number(name.slice("resolution-".length));
    const task = record.taskId ?? path.basename(record.artifactDir);
    if (!await artifactRunnerIsDefinitelyGone(dialect, path.join(record.artifactDir, name), `${dialect.unit}-${task}-resolution-${number}`, systemRunner)) return false;
  }
  return true;
}

async function workerIsDefinitelyGone(dialect, record, systemRunner = systemdCommand) {
  // A live owning process may still be resolving conflicts, committing its trace, or
  // recording the result after the base session has already exited.
  if (sameProcess(record.owner)) return false;
  if (!await ownerIsDefinitelyGone(record.owner)) return false;
  return reservationWorkersAreDefinitelyGone(dialect, record, systemRunner);
}

async function reconcileReservations(dialect, root, systemRunner) {
  for (const name of readdirSync(root).filter(value => /^slot-\d+\.json$/u.test(value))) {
    const file = path.join(root, name);
    const record = readJson(file);
    if (record === undefined || record === null) continue; // Corrupt or partial state stays occupied.
    if (await workerIsDefinitelyGone(dialect, record, systemRunner)) {
      try { unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const activeTaskUnitNames = async (dialect, systemRunner) => {
  let result;
  try {
    result = await systemRunner("systemctl", ["--user", "list-units", "--type=service", "--state=active",
      "--plain", "--no-legend", "--no-pager", `${dialect.unit}-*.service`], {});
  } catch { return { uncertain: true }; }
  // A failed user-manager query does not prove that no user manager exists (nor that
  // its transient units are absent), so it must never be interpreted as free capacity.
  if (result?.exitCode !== 0) return { uncertain: true };
  const units = new Set();
  const pattern = new RegExp(`^${escapeRegExp(dialect.unit)}-[A-Za-z0-9_.@:-]+\\.service$`, "u");
  for (const line of (result.stdout ?? "").split("\n")) {
    const unit = line.trim().split(/\s+/u)[0];
    if (pattern.test(unit)) units.add(unit);
  }
  return { units: [...units] };
};

const representedTaskUnits = (dialect, records) => {
  const represented = new Set(records.map(record => record?.unit)
    .filter(unit => typeof unit === "string")
    .map(unit => unit.endsWith(".service") ? unit : `${unit}.service`));
  for (const record of records) {
    if (typeof record?.artifactDir !== "string") continue;
    const task = record.taskId ?? path.basename(record.artifactDir);
    let names;
    try { names = readdirSync(record.artifactDir); } catch { continue; }
    for (const name of names) {
      const match = /^resolution-(\d+)$/u.exec(name);
      if (match !== null) represented.add(`${dialect.unit}-${task}-resolution-${match[1]}.service`);
    }
  }
  return represented;
};

/** Provider-wide host capacity. Different model carriers of one provider share its slot files. */
export function harnessCapacitySnapshot(dialect, environment = process.env, host = hostResources()) {
  const limit = harnessConcurrency(dialect, environment, host);
  let active = 0;
  try {
    active = readdirSync(sharedCapacityRoot(dialect, { ...process.env, ...environment })).filter(value => /^slot-\d+\.json$/u.test(value)).length;
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const waiting = queueOf(dialect).waiting.length;
  return Object.freeze({ limit, active, waiting, available: Math.max(0, limit - active - waiting) });
}

async function reserveSharedSlot(dialect, { slot: requested, environment, host, reservation, systemRunner }) {
  const root = sharedCapacityRoot(dialect, { ...process.env, ...environment });
  const limit = harnessConcurrency(dialect, environment, host);
  const id = reservation?.id ?? randomUUID();
  // Each look spawns the flock helper and lists systemd units, so a waiter backs off toward the
  // session poll interval instead of re-asking at a fixed 50 ms for as long as capacity is full.
  for (let delay = 50; ; delay = Math.min(delay * 2, POLL_INTERVAL_MS)) {
    const result = await withCapacityLock(root, async () => {
      await reconcileReservations(dialect, root, systemRunner);
      const records = readdirSync(root).filter(value => /^slot-\d+\.json$/u.test(value)).map(value => readJson(path.join(root, value)));
      const activity = await activeTaskUnitNames(dialect, systemRunner ?? systemdCommand);
      if (activity.uncertain) return reservation?.immediate === true
        ? { refused: "provider-activity-unknown" } : { wait: true };
      const representedUnits = representedTaskUnits(dialect, records);
      const unrepresentedActiveUnits = activity.units.filter(unit => !representedUnits.has(unit));
      const existing = records.find(record => record?.id === id);
      if (existing !== undefined) {
        const sameTask = reservation?.recovering === true
          && await ownerIsDefinitelyGone(existing.owner)
          && await resolutionWorkersAreDefinitelyGone(dialect, existing, systemRunner)
          && existing.taskId === reservation.taskId
          && existing.artifactDir === reservation.artifactDir
          && existing.unit === reservation.unit;
        if (!sameTask) return { wait: true };
        // Claim the dead owner's lease before releasing the flock. A second recovery process
        // will observe this live owner and cannot join the same execution concurrently.
        const claimed = { ...existing, owner: processIdentity(process.pid) };
        const file = reservationPath(root, existing.slot);
        const temporary = `${file}.${randomUUID()}.tmp`;
        try { writeExclusiveJson(temporary, claimed); renameSync(temporary, file); }
        finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; } }
        return { slot: existing.slot, record: claimed, joined: true };
      }
      if (reservation?.scopeKey !== undefined && records.some(record => record?.scopeKey === reservation.scopeKey)) return { refused: "scope-active" };
      if (records.length + unrepresentedActiveUnits.length >= limit) return reservation?.immediate === true
        ? { refused: "provider-capacity-full" } : { wait: true };
      const slot = requested ?? Array.from({ length: limit }, (_, index) => index).find(index => !existsSync(reservationPath(root, index)));
      if (slot === undefined || slot >= limit || existsSync(reservationPath(root, slot))) return reservation?.immediate === true ? { refused: "provider-capacity-full" } : { wait: true };
      const record = { kind: dialect.reservationKind, version: 1, id, slot,
        owner: processIdentity(process.pid), ...(reservation?.taskId === undefined ? {} : { taskId: reservation.taskId }),
        ...(reservation?.scopeKey === undefined ? {} : { scopeKey: reservation.scopeKey }),
        ...(reservation?.executionIdentity === undefined ? {} : { executionIdentity: reservation.executionIdentity }),
        ...(reservation?.session === undefined ? {} : { session: reservation.session }),
        ...(reservation?.model === undefined ? {} : { model: reservation.model }),
        ...(reservation?.artifactDir === undefined ? {} : { artifactDir: reservation.artifactDir }),
        ...(reservation?.unit === undefined ? {} : { unit: reservation.unit }),
      };
      writeExclusiveJson(reservationPath(root, slot), record);
      return { slot, record };
    });
    if (!result.wait) return { root, dialect, ...result };
    await pause(delay);
  }
}

async function bindSharedSession(reservation, session) {
  const thread = typeof session?.thread === "string" && session.thread.length > 0 ? session.thread : undefined;
  if (thread === undefined) throw new TypeError(`provider reservation session binding needs an observed ${reservation.dialect.label} thread`);
  await withCapacityLock(reservation.root, async () => {
    const file = reservationPath(reservation.root, reservation.slot);
    const current = readJson(file);
    if (current?.id !== reservation.record.id) throw new Error("provider reservation changed before its observed session could be bound");
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      writeExclusiveJson(temporary, { ...current, session: thread,
        ...(typeof session.artifactDir === "string" ? { artifactDir: session.artifactDir } : {}),
        ...(Number.isInteger(session.turn) ? { turn: session.turn } : {}) });
      renameSync(temporary, file);
    } finally {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  });
}

async function releaseSharedSlot(reservation, systemRunner = systemdCommand) {
  await withCapacityLock(reservation.root, async () => {
    const file = reservationPath(reservation.root, reservation.slot);
    const current = readJson(file);
    if (current?.id !== reservation.record.id) return;
    if (current.artifactDir && !await reservationWorkersAreDefinitelyGone(reservation.dialect, current, systemRunner)) return;
    unlinkSync(file);
  });
}

/** Each provider's in-process turn queue: its active slots, its waiting tasks, its dispatching count. */
const queues = new Map();
const queueOf = dialect => {
  if (!queues.has(dialect.pool)) queues.set(dialect.pool, { activeSlots: new Set(), waiting: [], dispatching: 0 });
  return queues.get(dialect.pool);
};
const drain = dialect => {
  const queue = queueOf(dialect);
  while (queue.waiting.length > 0 && queue.activeSlots.size + queue.dispatching < harnessConcurrency(dialect, queue.waiting[0].environment, queue.waiting[0].host)) {
    const [{ task, resolve, reject, slot, environment, host, reservation, systemRunner }] = queue.waiting.splice(0, 1);
    queue.dispatching += 1;
    reserveSharedSlot(dialect, { slot, environment, host, reservation, systemRunner }).then(shared => {
      queue.dispatching -= 1;
      queue.activeSlots.add(shared.slot);
      return Promise.resolve().then(() => task(shared.slot, { onSession: session => bindSharedSession(shared, session) })).then(async value => {
        await releaseSharedSlot(shared, systemRunner);
        resolve(value);
      }, async error => {
        await releaseSharedSlot(shared, systemRunner);
        reject(error);
      }).finally(() => {
        queue.activeSlots.delete(shared.slot);
        drain(dialect);
      });
    }, error => { queue.dispatching -= 1; reject(error); drain(dialect); });
  }
};

/** Atomically reserve from the provider's host-wide budget. Independent processes and model carriers share it. */
export function inProviderTurn(dialect, task, { slot, environment = process.env, host, reservation, systemRunner } = {}) {
  return new Promise((resolve, reject) => {
    queueOf(dialect).waiting.push({ task, resolve, reject, slot, environment, host, reservation, systemRunner });
    drain(dialect);
  });
}

/** Reserve the same host-wide provider lease used by turns before a canonical execution is
 *  admitted. Scope and execution identity are diagnostic/effect keys; only an existing matching
 *  scope or a full configured budget refuses the reservation. */
export async function reserveProviderTurn(dialect, { scopeKey, executionIdentity, taskId, artifactDir,
  unit = taskId === undefined ? undefined : `${dialect.unit}-${taskId}`, environment = process.env, host, systemRunner } = {}) {
  if (typeof scopeKey !== "string" || scopeKey.length === 0 || typeof executionIdentity !== "string" || executionIdentity.length === 0) throw new TypeError("provider reservation requires canonical scope and execution identity");
  const result = await reserveSharedSlot(dialect, { environment, host, systemRunner, reservation: { id: randomUUID(), scopeKey, executionIdentity, taskId, artifactDir, unit, immediate: true } });
  if (result.refused !== undefined) return Object.freeze({ acquired: false, reason: result.refused, scopeKey, executionIdentity });
  return Object.freeze({ acquired: true, root: result.root, slot: result.slot, record: result.record, pool: dialect.pool });
}

const leaseOf = (dialect, reservation) => ({ root: reservation.root, slot: reservation.slot, record: reservation.record, dialect });

/** Run under a lease acquired before started admission; the adapter must not reacquire it. */
export async function runReservedProviderTurn(dialect, reservation, task) {
  if (reservation?.acquired !== true || typeof task !== "function") throw new TypeError("an acquired provider reservation and task are required");
  return task(reservation.slot, { onSession: session => bindSharedSession(leaseOf(dialect, reservation), session) });
}

export async function releaseProviderTurn(dialect, reservation, { systemRunner = systemdCommand } = {}) {
  if (reservation?.acquired !== true) return;
  await releaseSharedSlot(leaseOf(dialect, reservation), systemRunner);
}

/** Run a systemd command. Kept behind one function so callers and tests can substitute the host. */
export function systemdCommand(command, args, { cwd } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-4000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on("close", (code, signal) => resolve({ exitCode: code ?? (signal === null ? 1 : 128), stdout, stderr }));
    child.on("error", (error) => resolve({ exitCode: 127, stdout, stderr, error }));
  });
}

export const artifact = (directory, name) => path.join(directory, name);
export const readOptional = (file) => {
  try { return readFileSync(file, "utf8"); } catch (error) { if (error?.code === "ENOENT") return undefined; throw error; }
};
const appendArtifactLine = (directory, name, value) => {
  const prior = readOptional(artifact(directory, name)) ?? "";
  writeFileSync(artifact(directory, name), `${prior}${prior === "" || prior.endsWith("\n") ? "" : "\n"}${value}\n`, { mode: 0o600 });
};

/** The stable storage owned by one dispatched task: the node's machine-local state
 * (`data/state/<dialect.tasks>-state/<id>`), beside the journal it is recorded in. A task started
 * before its node held its own root keeps them in one of its `formerRoots`, and is found there. */
export function harnessTaskArtifactDirectory(dialect, dataRoot, id, formerRoots = []) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_.-]+$/u.test(id)) throw new TypeError(`a ${dialect.label} task needs a filesystem-safe id`);
  for (const root of [dataRoot, ...formerRoots]) {
    const directory = path.join(dataKindDirectory(root, "state", dialect.tasks), id);
    if (existsSync(directory)) return directory;
  }
  return path.join(dataKindDirectory(dataRoot, "state", dialect.tasks), id);
}

const turnRoot = directory => path.join(directory, "turns");
const turnName = sequence => `turn-${String(sequence).padStart(6, "0")}`;
const turnSequence = name => {
  const match = /^turn-(\d{6})$/u.exec(name);
  return match === null ? undefined : Number(match[1]);
};

/** Each provider invocation owns an immutable directory inside its task's durable record. */
function nextHarnessTurnDirectory(directory) {
  const turns = turnRoot(directory);
  mkdirSync(turns, { recursive: true, mode: 0o700 });
  const used = new Set(readdirSync(turns).map(turnSequence).filter(Number.isInteger));
  let sequence = 1;
  for (;;) {
    while (used.has(sequence)) sequence += 1;
    const current = path.join(turns, turnName(sequence));
    try { mkdirSync(current, { recursive: false, mode: 0o700 }); return { directory: current, sequence }; }
    catch (error) { if (error.code !== "EEXIST") throw error; used.add(sequence); sequence += 1; }
  }
}

/** Existing task roots may be read by older consumers; resolve them to the latest exact turn. */
function latestHarnessTurnDirectory(directory) {
  const exactSequence = turnSequence(path.basename(directory));
  if (Number.isInteger(exactSequence)) return { directory, sequence: exactSequence };
  let turns;
  try { turns = readdirSync(turnRoot(directory)).map(name => ({ name, sequence: turnSequence(name) }))
    .filter(turn => Number.isInteger(turn.sequence)).sort((a, b) => b.sequence - a.sequence); }
  catch (error) { if (error.code === "ENOENT") return { directory, sequence: undefined }; throw error; }
  return turns.length === 0 ? { directory, sequence: undefined }
    : { directory: path.join(turnRoot(directory), turns[0].name), sequence: turns[0].sequence };
}

/** What the runner itself witnessed of a session, beside the dialect's reading of the CLI's own
 *  events: the exit code, and every runner, stderr and note line as an error. */
export function readHarnessSessionArtifacts(dialect, directory) {
  const turn = latestHarnessTurnDirectory(directory);
  directory = turn.directory;
  const native = dialect.readSession(directory);
  const errors = [...(native.errors ?? [])];
  const rawExitCode = readOptional(artifact(directory, "exit-code"))?.trim();
  const parsedExitCode = rawExitCode === undefined || rawExitCode === "" ? undefined : Number(rawExitCode);
  const exitCode = Number.isInteger(parsedExitCode) ? parsedExitCode : undefined;
  const stderr = readOptional(artifact(directory, "stderr.txt"))?.trim();
  if (exitCode !== undefined && exitCode !== 0 && stderr) errors.push(stderr);
  for (const line of (readOptional(artifact(directory, "runner-errors.txt")) ?? "").split(/\r?\n/u)) if (line.trim() !== "") errors.push(line.trim());
  for (const line of (readOptional(artifact(directory, "runner-notes.txt")) ?? "").split(/\r?\n/u)) if (line.trim() !== "") errors.push(line.trim());
  const ok = exitCode === 0 && native.message !== undefined && native.failed !== true;
  return Object.freeze({ ...native, ok, exitCode, errors: Object.freeze(errors), artifactDir: directory,
    ...(turn.sequence === undefined ? {} : { turn: turn.sequence }) });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Wait for the wrapper's atomic completion marker, stopping its unit when the bound expires. */
const UNIT_CHECK_POLLS = 15;
/** Whether a transient unit has ended (inactive, failed or gone). */
async function unitEnded(systemRunner, unit) {
  const status = await systemRunner("systemctl", ["--user", "show", `${unit}.service`, "-p", "ActiveState", "-p", "LoadState"], {});
  if (status?.exitCode !== 0) return false;
  const state = Object.fromEntries((status.stdout ?? "").trim().split("\n").map((line) => line.split("=")));
  return state.LoadState === "not-found" || ["inactive", "failed"].includes(state.ActiveState);
}

export async function waitForHarnessSession(dialect, { artifactDir, unit, timeoutMs = 3_600_000, pollIntervalMs = POLL_INTERVAL_MS, systemRunner = systemdCommand, onSession }) {
  artifactDir = latestHarnessTurnDirectory(artifactDir).directory;
  const exitFile = artifact(artifactDir, "exit-code");
  const deadline = Date.now() + timeoutMs;
  let observed = false;
  const observe = async () => {
    if (observed || onSession === undefined) return;
    const session = readHarnessSessionArtifacts(dialect, artifactDir);
    if (session.thread !== undefined && session.model !== undefined) { await onSession(session); observed = true; }
  };
  let stopped;
  let polls = 0;
  try {
    while (!existsSync(exitFile) && Date.now() < deadline) {
      await observe();
      // A unit that ended without publishing its exit marker (its wrapper could not start or write
      // it) will never publish one: the session ended then, not at the deadline.
      if (++polls % UNIT_CHECK_POLLS === 0 && await unitEnded(systemRunner, unit) && !existsSync(exitFile)) {
        appendArtifactLine(artifactDir, "runner-errors.txt", `${unit} ended without publishing its exit code`);
        writeFileSync(exitFile, "126\n", { mode: 0o600 });
        break;
      }
      // A dialect may see from the CLI's own events that the session cannot do its work, such as a
      // required tool server that never connected; it is stopped then, not left to run without it.
      const reason = dialect.stopReason?.(artifactDir);
      if (reason !== undefined) {
        appendArtifactLine(artifactDir, "runner-errors.txt", reason);
        stopped = await systemRunner("systemctl", ["--user", "stop", unit], {});
        if (stopped?.exitCode === 0 && !existsSync(exitFile)) writeFileSync(exitFile, "125\n", { mode: 0o600 });
        break;
      }
      await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
    }
    await observe();
  } catch (error) {
    await systemRunner("systemctl", ["--user", "stop", unit], {});
    throw error;
  }
  if (!existsSync(exitFile) && stopped === undefined) {
    try { stopped = await systemRunner("systemctl", ["--user", "stop", unit], {}); }
    catch { stopped = undefined; }
    appendArtifactLine(artifactDir, "runner-errors.txt", `timeout: ${dialect.label} did not finish within ${timeoutMs} ms`);
    // A successful stop is the completion evidence if systemd kills the wrapper
    // before its trap can publish the marker. A failed/uncertain stop retains the
    // unfinished artifact and its provider reservation for conservative recovery.
    if (stopped?.exitCode === 0 && !existsSync(exitFile)) writeFileSync(exitFile, "124\n", { mode: 0o600 });
  }
  return readHarnessSessionArtifacts(dialect, artifactDir);
}

function shellWrapper() {
  return [
    "prompt=$1; events=$2; errors=$3; last=$4; finished=$5; shift 5",
    '"$@" <"$prompt" >"$events" 2>"$errors"',
    "code=$?",
    'printf "%s\\n" "$code" >"$finished.tmp"',
    'mv "$finished.tmp" "$finished"',
    'exit "$code"',
  ].join("; ");
}

function runInProcess(dialect, { command, args, cwd, promptFile, eventsFile, stderrFile, exitFile, timeoutMs, directory, pollIntervalMs, onSession, environment }) {
  writeFileSync(artifact(directory, "runner-notes.txt"), `systemd-run unavailable; ${inProcessNote(dialect)}\n`, { mode: 0o600 });
  let launchedChild;
  const completed = new Promise((resolve) => {
    const input = openSync(promptFile, "r");
    const output = openSync(eventsFile, "w", 0o600);
    const errors = openSync(stderrFile, "w", 0o600);
    const child = spawn(command, args, { cwd, stdio: [input, output, errors], ...(environment === undefined ? {} : { env: environment }) });
    if (child.pid !== undefined) {
      const identity = processIdentity(child.pid);
      if (identity !== undefined) writeFileSync(artifact(directory, "runner-process.json"), JSON.stringify(identity), { mode: 0o600 });
    }
    launchedChild = child;
    let settled = false;
    let timer;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closeSync(input); closeSync(output); closeSync(errors);
      writeFileSync(exitFile, `${code}\n`, { mode: 0o600 });
      resolve(readHarnessSessionArtifacts(dialect, directory));
    };
    child.on("close", (code, signal) => finish(code ?? (signal === null ? 1 : 128)));
    child.on("error", (error) => { appendArtifactLine(directory, "runner-errors.txt", `spawn: ${error.message}`); finish(127); });
    timer = setTimeout(() => { appendArtifactLine(directory, "runner-errors.txt", `timeout: ${dialect.label} did not finish within ${timeoutMs} ms`); child.kill("SIGTERM"); }, timeoutMs);
  });
  if (onSession === undefined) return completed;
  return waitForHarnessSession(dialect, { artifactDir: directory, timeoutMs, pollIntervalMs, onSession, systemRunner: async () => { launchedChild.kill("SIGTERM"); await completed; } });
}

/** Launch one CLI invocation in the task's unit and wait for its completion marker. The unit is
 *  `--collect`ed when it exits, so a later attempt can take the same name. */
export async function launchHarnessSession(dialect, { directory, input, args, cwd, executable = dialect.executable, unit, timeoutMs, pollIntervalMs, systemRunner, onSession, confinement }) {
  const eventsFile = artifact(directory, "events.jsonl");
  const stderrFile = artifact(directory, "stderr.txt");
  const lastFile = artifact(directory, "last-message.txt");
  const exitFile = artifact(directory, "exit-code");
  const wrapperArgs = [input, eventsFile, stderrFile, lastFile, exitFile, executable, ...args];
  // A transient unit starts from the user manager's environment, not the node's: without the node's
  // PATH it finds neither the CLI nor the `node` its checks run (both live in ~/.local/bin here).
  const sessionEnvironment = nodeFirstEnvironment();
  const names = ["PATH", "HOME", ...dialect.environment];
  const values = { ...Object.fromEntries(names.filter((name) => sessionEnvironment[name]).map((name) => [name, sessionEnvironment[name]])), ...confinement?.environment };
  const environment = Object.entries(values).map(([name, value]) => `--setenv=${name}=${value}`);
  const confined = confinement === undefined ? [] : ["ProtectSystem=strict", "ProtectHome=read-only", "PrivateTmp=yes",
    ...[directory, ...confinement.writable].map((writable) => `ReadWritePaths=-${path.resolve(writable)}`)].map((property) => `--property=${property}`);
  const launched = await systemRunner("systemd-run", ["--user", `--unit=${unit}`, `--slice=${CONTAINMENT_SLICE}`, "--collect", `--working-directory=${cwd}`, ...confined, ...environment, "--", "sh", "-c", shellWrapper(), dialect.unit, ...wrapperArgs], { cwd });
  if (launched.exitCode !== 0) {
    // Another host may have recovered this exact task between the process read
    // and launch. Joining its unit must never create an in-process duplicate.
    if (/already exists|already loaded/iu.test(launched.stderr ?? "")) {
      return waitForHarnessSession(dialect, { artifactDir: directory, unit, timeoutMs, pollIntervalMs, onSession, systemRunner });
    }
    if (confinement !== undefined) throw new Error(`a confined ${dialect.label} session needs its transient unit, and systemd-run refused it: ${(launched.stderr ?? "").trim().slice(0, 300)}`);
    return runInProcess(dialect, { command: executable, args, cwd, promptFile: input, eventsFile, stderrFile, exitFile, timeoutMs, directory, pollIntervalMs, onSession });
  }
  return waitForHarnessSession(dialect, { artifactDir: directory, unit, timeoutMs, pollIntervalMs, systemRunner, onSession });
}

/** Whether a stopped session is one the runner carries on: the provider had no room, or (when the
 *  caller opts in) the required MCP handshake failed before a thread started. */
export function retryableHarnessSession(dialect, result, { artifactDir: directory, retryDelaysMs = RETRY_DELAYS_MS, retryStartup = false }) {
  const attempt = Number.isInteger(result?.turn) ? result.turn
    : latestHarnessTurnDirectory(directory).sequence ?? 1;
  return result.exitCode !== undefined && (dialect.startupFailure(result) ? retryStartup && attempt <= Math.min(2, retryDelaysMs.length)
    : dialect.transient(result) && attempt <= retryDelaysMs.length);
}

/**
 * Carry on a session that stopped because the provider had no room or its required MCP handshake
 * failed before a thread started. Resume only a witnessed thread. Each retry gets a new immutable
 * turn directory, so old evidence cannot become the completion evidence of the resumed turn.
 */
export async function retryTransientHarnessSession(dialect, result, { artifactDir: directory, cwd, taskId, executable = dialect.executable, timeoutMs = 3_600_000, pollIntervalMs = POLL_INTERVAL_MS, systemRunner = systemdCommand, retryDelaysMs = RETRY_DELAYS_MS, retryStartup = false, onSession, ...options }) {
  const unit = `${dialect.unit}-${taskId ?? path.basename(directory)}`;
  let current = result;
  for (;;) {
    const attempt = (Number.isInteger(current?.turn) ? current.turn : latestHarnessTurnDirectory(directory).sequence ?? 1) + 1;
    if (!retryableHarnessSession(dialect, current, { artifactDir: directory, retryDelaysMs, retryStartup })) return current;
    await delay(retryDelaysMs[attempt - 2]);
    const next = nextHarnessTurnDirectory(directory);
    const lastFile = artifact(next.directory, "last-message.txt");
    let input = artifact(next.directory, "prompt.txt");
    let args = dialect.startArguments({ ...options, cwd, lastFile, artifactDir: next.directory, taskId });
    if (current.thread !== undefined) {
      input = artifact(next.directory, "resume-prompt.txt");
      writeFileSync(input, promptText(dialect, `Your last turn stopped because the model was unavailable, not because of your work. Continue the assignment from where you left off.\n`), { mode: 0o600 });
      args = dialect.resumeArguments({ ...options, cwd, lastFile, thread: current.thread, artifactDir: next.directory, taskId });
    } else {
      const previousPrompt = readOptional(artifact(current.artifactDir ?? latestHarnessTurnDirectory(directory).directory, "prompt.txt"));
      if (previousPrompt === undefined) throw new Error(`${dialect.label} startup retry has no witnessed prompt to carry forward`);
      writeFileSync(input, previousPrompt, { mode: 0o600 });
    }
    current = await launchHarnessSession(dialect, { directory: next.directory, input, args, cwd, executable, unit, timeoutMs, pollIntervalMs, systemRunner, onSession, confinement: dialect.confinement?.({ ...options, cwd, artifactDir: next.directory }) });
  }
}

/**
 * Carry on a session that ended without the result its assignment owes. A dialect that can tell
 * (`unfinished(directory, options)`, answering `{ progress }` for a session that ended well yet
 * returned no required result, `progress` being the steps it took) has the same conversation resumed
 * and told to collect what it left running and finish, for as long as each continuation still acts;
 * one that takes no step is stalled, and the session ends refused for it. Each continuation's events
 * are set aside as `events.jsonl.continued-<n>`.
 */
const CONTINUE_UNFINISHED = "Your turn ended without the result this assignment requires. A command you started in the background has finished or will not report on its own: read its output, check the state you left, finish the assignment, and end with the required result.\n";
export async function carryUnfinishedHarnessSession(dialect, result, { artifactDir: directory, cwd, taskId, executable = dialect.executable, timeoutMs = 3_600_000, pollIntervalMs = POLL_INTERVAL_MS, systemRunner = systemdCommand, retryDelaysMs = RETRY_DELAYS_MS, onSession, ...options }) {
  let current = result;
  let previousProgress = Infinity;
  for (;;) {
    if (current.failed === true || current.thread === undefined || dialect.unfinished === undefined) return current;
    const owed = dialect.unfinished(directory, options);
    if (owed === null || owed === undefined) return current;
    if (owed.progress === 0 && previousProgress === 0) {
      return Object.freeze({ ...current, ok: false, errors: Object.freeze([...(current.errors ?? []), `${dialect.label} session stalled: it ended without its required result and its continuation took no step`]) });
    }
    previousProgress = owed.progress;
    const continued = readdirSync(directory).filter((name) => /^events\.jsonl\.continued-\d+$/u.test(name)).length + 1;
    for (const name of ["events.jsonl", "stderr.txt", "exit-code"]) if (existsSync(artifact(directory, name))) renameSync(artifact(directory, name), artifact(directory, `${name}.continued-${continued}`));
    const input = artifact(directory, "continue-prompt.txt");
    writeFileSync(input, promptText(dialect, CONTINUE_UNFINISHED), { mode: 0o600 });
    const args = dialect.resumeArguments({ ...options, cwd, lastFile: artifact(directory, "last-message.txt"), thread: current.thread, artifactDir: directory, taskId });
    const unit = `${dialect.unit}-${taskId ?? path.basename(directory)}`;
    const next = await launchHarnessSession(dialect, { directory, input, args, cwd, executable, unit, timeoutMs, pollIntervalMs, systemRunner, onSession, confinement: dialect.confinement?.({ ...options, cwd, artifactDir: directory }) });
    current = await retryTransientHarnessSession(dialect, next, { ...options, artifactDir: directory, cwd, taskId, executable, timeoutMs, pollIntervalMs, systemRunner, retryDelaysMs, onSession });
  }
}

/** The bytes a dialect's CLI reads from stdin for a turn's text: identity unless the dialect's
 *  optional `promptOf(text)` frames it (a stream-json CLI reads a user event, not bare text). */
const promptText = (dialect, text) => (dialect.promptOf === undefined ? text : dialect.promptOf(text));

/**
 * Resume a witnessed `thread` with a new turn (`prompt`) in its own artifact directory, carried on
 * through a provider's lack of room like the original session. Used where the session that wrote a
 * change must carry it on, such as resolving its own conflicts against a moved main.
 */
export async function resumeHarnessSession(dialect, { thread, prompt, directory, cwd, unitTask, executable = dialect.executable, timeoutMs = 3_600_000, pollIntervalMs = POLL_INTERVAL_MS, systemRunner = systemdCommand, retryDelaysMs = RETRY_DELAYS_MS, onSession, ...options }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const turn = nextHarnessTurnDirectory(directory);
  const input = artifact(turn.directory, "prompt.txt");
  writeFileSync(input, promptText(dialect, prompt), { mode: 0o600 });
  const lastFile = artifact(turn.directory, "last-message.txt");
  const args = dialect.resumeArguments({ ...options, cwd, lastFile, thread, artifactDir: turn.directory, taskId: unitTask });
  const first = await launchHarnessSession(dialect, { directory: turn.directory, input, args, cwd, executable, unit: `${dialect.unit}-${unitTask}`, timeoutMs, pollIntervalMs, systemRunner, onSession, confinement: dialect.confinement?.({ ...options, cwd, artifactDir: turn.directory }) });
  const carried = { ...options, artifactDir: directory, cwd, taskId: unitTask, executable, timeoutMs, pollIntervalMs, systemRunner, retryDelaysMs, onSession };
  return carryUnfinishedHarnessSession(dialect, await retryTransientHarnessSession(dialect, first, carried), carried);
}

/**
 * `{ prompt, cwd, artifactDir?, taskId?, executable?, timeoutMs?, systemRunner?, retryDelaysMs?, ...dialect options }`
 * to `{ ok, exitCode, thread, message, usage, errors, model?, reasoningEffort? }`. A task supplies its durable artifactDir.
 */
export async function runHarnessSession(dialect, { prompt, cwd, artifactDir, taskId, executable = dialect.executable, timeoutMs = 3_600_000, pollIntervalMs = POLL_INTERVAL_MS, systemRunner = systemdCommand, retryDelaysMs = RETRY_DELAYS_MS, onSession, ...options }) {
  if (typeof prompt !== "string" || prompt.trim() === "") throw new TypeError(`a ${dialect.label} session needs a prompt`);
  dialect.checkOptions?.(options);
  const root = artifactDir ?? mkdtempSync(path.join(tmpdir(), `${dialect.name}-session-`));
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const turn = nextHarnessTurnDirectory(root);
  const directory = turn.directory;
  const promptFile = artifact(directory, "prompt.txt");
  writeFileSync(promptFile, promptText(dialect, prompt), { mode: 0o600 });
  const unit = `${dialect.unit}-${taskId ?? path.basename(directory)}`;
  const args = dialect.startArguments({ ...options, cwd, lastFile: artifact(directory, "last-message.txt"), artifactDir: directory, taskId });
  const first = await launchHarnessSession(dialect, { directory, input: promptFile, args, cwd, executable, unit, timeoutMs, pollIntervalMs, systemRunner, onSession, confinement: dialect.confinement?.({ ...options, cwd, artifactDir: directory }) });
  const carried = { ...options, artifactDir: directory, cwd, taskId, executable, timeoutMs, pollIntervalMs, systemRunner, retryDelaysMs, onSession };
  return carryUnfinishedHarnessSession(dialect, await retryTransientHarnessSession(dialect, first, carried), carried);
}

/** Recover only after the original runner is observably gone. Keep the native
 * thread and archived attempt evidence; an absent exit marker alone proves nothing. */
export async function recoverHarnessSession(dialect, { artifactDir: directory, taskId, thread, cwd, executable = dialect.executable,
  timeoutMs = 3_600_000, pollIntervalMs = POLL_INTERVAL_MS, systemRunner = systemdCommand,
  retryDelaysMs = RETRY_DELAYS_MS, onSession, ...options }) {
  const activeTurn = latestHarnessTurnDirectory(directory);
  const activeDirectory = activeTurn.directory;
  if (existsSync(artifact(activeDirectory, "exit-code"))) return readHarnessSessionArtifacts(dialect, activeDirectory);
  const unit = `${dialect.unit}-${taskId ?? path.basename(directory)}`;
  const status = await systemRunner("systemctl", ["--user", "show", `${unit}.service`,
    "-p", "LoadState", "-p", "ActiveState"], {});
  const state = Object.fromEntries((status.stdout ?? "").trim().split("\n").map(line => line.split("=")));
  if (status.exitCode !== 0 || !["not-found", "loaded"].includes(state.LoadState)
    || !["inactive", "failed"].includes(state.ActiveState)) return undefined;
  const processFile = artifact(activeDirectory, "runner-process.json");
  if (existsSync(processFile)) {
    const previous = JSON.parse(readFileSync(processFile, "utf8"));
    const current = processIdentity(previous.pid);
    if (current !== undefined && current.boot === previous.boot && current.started === previous.started) return undefined;
  } else if ((readOptional(artifact(activeDirectory, "runner-notes.txt")) ?? "").includes(inProcessNote(dialect))) {
    return undefined;
  }
  // The wrapper may have completed between the process read and this boundary.
  if (existsSync(artifact(activeDirectory, "exit-code"))) return readHarnessSessionArtifacts(dialect, activeDirectory);
  const session = readHarnessSessionArtifacts(dialect, activeDirectory);
  const nativeThread = thread ?? session.thread;
  if (nativeThread === undefined) throw new Error(`${dialect.label} runner disappeared before a native session was witnessed`);
  const next = nextHarnessTurnDirectory(directory);
  const input = artifact(next.directory, "resume-prompt.txt");
  writeFileSync(input, promptText(dialect, "Your execution process was interrupted. Continue this same allocated duty from its existing evidence and current owning-node state. Check effects already recorded before acting; preserve the original receiving condition.\n"), { mode: 0o600 });
  const args = dialect.resumeArguments({ ...options, cwd, lastFile: artifact(next.directory, "last-message.txt"), thread: nativeThread, artifactDir: next.directory, taskId });
  const first = await launchHarnessSession(dialect, { directory: next.directory, input, args, cwd, executable, unit, timeoutMs, pollIntervalMs, systemRunner, onSession, confinement: dialect.confinement?.({ ...options, cwd, artifactDir: next.directory }) });
  const carried = { ...options, artifactDir: directory, taskId, cwd, executable, timeoutMs, pollIntervalMs, systemRunner, retryDelaysMs, onSession };
  return carryUnfinishedHarnessSession(dialect, await retryTransientHarnessSession(dialect, first, carried), carried);
}
