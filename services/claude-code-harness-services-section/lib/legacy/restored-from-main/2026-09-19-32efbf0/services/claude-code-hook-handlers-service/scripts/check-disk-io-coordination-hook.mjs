#!/usr/bin/env node
// PreToolUse and PostToolUse: serializes disk-heavy `npm install`-family
// commands across every concurrent session on this machine.
//
// This repository has no shared root install, so the hazard is not any one
// install but several sessions extracting node_modules onto the same disk at
// once -- the documented mechanism behind repeated WSL crashes and forced
// restarts. One lock record, in the machine's own harness state directory
// (derived from its AgentHarnessPolicy, so no path is written here), is the
// coordinating point. A lock older than twenty minutes, or one no session
// ever releases, is treated as abandoned rather than deadlocking every
// future install.
//
// The PostToolUse projection of this same module releases the lock the
// PreToolUse projection took.
import { CONTINUE, block, commandTextOf } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { writeFileText } from "@red-cup-engineering/file-services/write-file";
import { removePath } from "@red-cup-engineering/remove-path-service";
import { commandInvocations } from "../src/shell-command.mjs";
import { readMachineParameters, repositoryRootOf } from "./machine-parameters.mjs";

export const BYPASS_ENV_VAR = "DISK_IO_COORDINATOR_HOOK_BYPASS";
export const LOCK_STATE_NAME = "disk-io-coordinator.lock";
const STALE_MS = 20 * 60 * 1000;
const HEAVY_NPM_SUBCOMMANDS = new Set(["i", "install", "ci", "update", "up", "upgrade"]);
// npm's global options may sit before the subcommand; these take a separate
// value, so the token after them is that value and not the subcommand. Prior
// to this the check read only npm's very next token, and
// `npm --prefix <path> install` -- how this repository's every per-package
// install is actually written -- went uncoordinated.
const NPM_OPTIONS_TAKING_A_VALUE = new Set(["--prefix", "-C", "--workspace", "-w", "--loglevel", "--registry", "--userconfig", "--globalconfig", "--cache"]);

/**
 * The subcommand one npm invocation names: the first token that is neither a
 * global option nor a global option's value.
 *
 * @param {readonly string[]} args - the tokens after `npm`.
 * @returns {string|undefined}
 */
export function npmSubcommandOf(args) {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("-")) return token;
    if (NPM_OPTIONS_TAKING_A_VALUE.has(token)) index += 1;
  }
  return undefined;
}

/**
 * Whether a Bash command actually invokes a disk-heavy `npm install`-family
 * subcommand, as opposed to merely mentioning one in prose -- a commit
 * message arguing against running one, say. The subcommand must appear as
 * `npm`'s own next argument in a real top-level invocation.
 *
 * @param {string} command - the Bash tool's shell command text.
 * @returns {boolean}
 */
export function isDiskHeavyCommand(command) {
  return commandInvocations(command, "npm").some((args) => HEAVY_NPM_SUBCOMMANDS.has(npmSubcommandOf(args)));
}

async function readLock(lockPath, readText) {
  try {
    return JSON.parse(await readText(lockPath));
  } catch {
    return null;
  }
}

/**
 * Whether one lock record is abandoned: unparseable, undated, or older than
 * the stale window.
 *
 * @param {object|null} lock
 * @param {() => Date} [now]
 * @returns {boolean}
 */
export function isStaleLock(lock, now = () => new Date()) {
  const startedAt = Date.parse(lock?.startedAt);
  return !Number.isFinite(startedAt) || now().getTime() - startedAt > STALE_MS;
}

/**
 * Rules on one lifecycle event: a disk-heavy command takes the machine's lock
 * or is blocked because another session holds it; the PostToolUse projection
 * releases the lock this session took.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {object} [options]
 * @param {string} [options.lockPath] - an explicit override; otherwise derived from the machine's policy.
 * @param {Record<string, string|undefined>} [options.environment]
 * @param {() => Date} [options.now]
 * @param {typeof readFileText} [options.readText]
 * @param {typeof writeFileText} [options.writeText]
 * @param {typeof removePath} [options.remove]
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function checkDiskIoCoordination(event, { lockPath, environment = process.env, now = () => new Date(), readText = readFileText, writeText = writeFileText, remove = removePath } = {}) {
  if (environment[BYPASS_ENV_VAR] === "1") return CONTINUE;
  if (event.tool?.name !== "Bash") return CONTINUE;
  const command = commandTextOf(event);
  if (!isDiskHeavyCommand(command)) return CONTINUE;
  let resolvedLockPath = lockPath;
  if (resolvedLockPath === undefined) {
    const root = repositoryRootOf(event, { environment });
    if (root === undefined) return CONTINUE;
    resolvedLockPath = (await readMachineParameters({ root, environment, readText })).statePath(LOCK_STATE_NAME);
  }
  const sessionId = event.session?.id ?? null;
  const lock = await readLock(resolvedLockPath, readText);

  if (event.event === "PostToolUse") {
    if (lock !== null && lock.sessionId === sessionId) await remove({ path: resolvedLockPath });
    return CONTINUE;
  }
  if (lock !== null && lock.sessionId !== sessionId && !isStaleLock(lock, now)) {
    return block(
      `another session (${lock.sessionId ?? "unknown"}) started '${lock.command}' at ${lock.startedAt} and has not finished — `
      + "concurrent npm installs are the documented mechanism behind repeated disk/WSL crashes on this machine; wait for it to "
      + `finish and retry (a lock older than 20 minutes is treated as abandoned; bypass with ${BYPASS_ENV_VAR}=1)`,
    );
  }
  try {
    await writeText(resolvedLockPath, `${JSON.stringify({ sessionId, command, startedAt: now().toISOString() })}\n`);
  } catch {
    // A lock that cannot be written cannot coordinate anything; fail open
    // rather than block every install on a filesystem fault.
  }
  return CONTINUE;
}

if (import.meta.main) {
  const result = await runAgentLifecycleHook({ handler: checkDiskIoCoordination, streams: processStreams() });
  process.exitCode = result.exitCode;
}
