#!/usr/bin/env node
// PreToolUse: refuses a Bash git or search invocation this repository's scale
// cannot safely absorb.
//
// This checkout is a 270k-file tree with dozens of independently-installed
// node_modules trees at every depth and several concurrent sessions. Two
// classes of command are unsafe here:
//
//   * wildcard staging or committing, which sweeps up another live session's
//     uncommitted files -- use the commit-git-paths operator by exact path;
//   * unscoped tree or history walks (`git grep`, `git log -p`/`--all` with
//     no path, `grep -r`, an unbounded `find`, a linked `git worktree`),
//     the documented mechanism behind the repeated 2026-09-10 WSL crashes.
//
// The one lawful wildcard staging is a bulk commit the owner asked for in
// their own words, so the transcript is read for that opt-in before refusing.
import { CONTINUE, block, commandTextOf } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { commandInvocations, shellCommandSegmentTokens } from "../src/shell-command.mjs";
import { transcriptHasUserPattern } from "./session-transcript.mjs";

export const BYPASS_ENV_VAR = "GIT_SCALE_SAFETY_HOOK_BYPASS";
const BULK_COMMIT_OPT_IN_PATTERNS = Object.freeze([/\bbulk commit\b/i, /\bblanket commit\b/i, /\bgit add -A\b/i, /\ball (the )?dirt\b.{0,40}\bcommit\b/i]);

function isRecursiveGrepFlag(argument) {
  if (argument === "-r" || argument === "-R" || argument === "--recursive") return true;
  return /^-[a-zA-Z]+$/u.test(argument) && (argument.includes("r") || argument.includes("R"));
}

function excludesNodeModules(rest) {
  return rest.some((argument) => argument.includes("node_modules"));
}

/**
 * Finds a plain (non-git) recursive `grep` or an unbounded `find` in a Bash
 * command: neither skips this repository's many independent `node_modules`
 * trees the way `git grep`/`rg`/`fd` do by respecting `.gitignore`, so a bare
 * recursive walk from any directory can fall into one and hang the machine.
 *
 * @param {string} command - the Bash tool's shell command text.
 * @returns {string|null} a reason naming the violation, or null.
 */
export function findSearchScaleSafetyViolation(command) {
  if (typeof command !== "string") return null;
  for (const tokens of shellCommandSegmentTokens(command)) {
    const [program, ...rest] = tokens;
    if (program === "grep" && rest.some(isRecursiveGrepFlag) && !excludesNodeModules(rest)) {
      return "`grep -r`/`-R` walks every directory including this repository's many independent `node_modules` trees and has hung/crashed the shared machine — use `rg` instead (it skips `.gitignore`d paths, including `node_modules`, by default)";
    }
    if (program === "find" && !rest.includes("-maxdepth") && !excludesNodeModules(rest)) {
      return "a `find` with no `-maxdepth` can walk into one of this repository's many `node_modules` trees and has hung/crashed the shared machine — add `-maxdepth <n>`, exclude `node_modules` explicitly, or use `fd` instead (it skips `.gitignore`d paths by default)";
    }
  }
  return null;
}

function isWildcardAddArgument(argument) {
  return ["-A", "--all", ".", "-u", "--update"].includes(argument);
}

function isWildcardCommitArgument(argument) {
  if (argument === "-a" || argument === "--all") return true;
  return /^-[a-zA-Z]+$/u.test(argument) && !argument.startsWith("--") && argument.includes("a");
}

/**
 * Finds the first git invocation in a Bash command this repository's scale
 * cannot safely absorb.
 *
 * @param {string} command - the Bash tool's shell command text.
 * @returns {string|null} a reason naming the violation, or null.
 */
export function findGitScaleSafetyViolation(command) {
  if (typeof command !== "string" || !command.includes("git")) return null;
  for (const args of commandInvocations(command, "git")) {
    const [subcommand, ...rest] = args;
    if (subcommand === "add" && rest.some(isWildcardAddArgument)) {
      return "`git add -A`/`.`/`-u` stages everything currently sitting in the working tree, including another live session's uncommitted files — use commit-git-paths.mjs by exact path instead (see the use-git skill), or ask the owner and state the request as a deliberate bulk commit";
    }
    if (subcommand === "commit" && rest.some(isWildcardCommitArgument)) {
      return "`git commit -a`/`-am`/`--all` commits everything currently modified in the working tree, including another live session's uncommitted files — use commit-git-paths.mjs by exact path instead";
    }
    if (subcommand === "grep") {
      return "`git grep` walks the whole working tree on this 270k-file repository and has crashed the shared machine — use `rg`/`fd` scoped to a path instead";
    }
    if (subcommand === "log" && rest.some((argument) => ["-p", "--patch", "--all"].includes(argument)) && !rest.includes("--")) {
      return "`git log -p`/`--all` without a `-- <path>` walks the whole repository's history and has crashed the shared machine — add `-- <path>`";
    }
    if (subcommand === "worktree" && rest[0] === "add") {
      return "a linked `git worktree` on this 270k-file repository materializes another full checkout and multiplies disk I/O — do the work directly in this checkout and commit by exact path instead";
    }
  }
  return null;
}

/**
 * Rules on one PreToolUse event: an unsafe git or search command is blocked,
 * unless the transcript shows the owner asked for a bulk commit in their own
 * words.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{environment?: Record<string, string|undefined>, readText?: Function}} [options]
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function checkGitScaleSafety(event, { environment = process.env, readText } = {}) {
  if (environment[BYPASS_ENV_VAR] === "1") return CONTINUE;
  if (event.tool?.name !== "Bash") return CONTINUE;
  const command = commandTextOf(event);
  const violation = findGitScaleSafetyViolation(command) ?? findSearchScaleSafetyViolation(command);
  if (violation === null) return CONTINUE;
  const isWildcardStaging = violation.startsWith("`git add") || violation.startsWith("`git commit");
  const transcriptPath = event.session?.transcriptPath;
  if (isWildcardStaging && typeof transcriptPath === "string" && await transcriptHasUserPattern(transcriptPath, BULK_COMMIT_OPT_IN_PATTERNS, readText)) {
    return CONTINUE;
  }
  return block(`${violation} (bypass with ${BYPASS_ENV_VAR}=1)`);
}

if (import.meta.main) {
  const result = await runAgentLifecycleHook({ handler: checkGitScaleSafety, streams: processStreams() });
  process.exitCode = result.exitCode;
}
