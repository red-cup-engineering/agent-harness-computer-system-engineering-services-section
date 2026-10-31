#!/usr/bin/env node
/**
 * The host-resource controller: one PreToolUse hook that places the shell commands of agent sessions
 * in a kernel-bounded cgroup. The kernel, not a reading of the command line, decides what a command
 * may use: every Claude Code session runs in the user-manager slice `agent-claude.slice`, and its
 * commands run in `agent-work.slice`, whose memory, CPU weight and task limits bind the sum of all of
 * them (see "Containment" below). The hook denies nothing. Protection of a repository's main branch
 * belongs to the lander, main's only writer, which refuses a mass deletion on the merged tree.
 *
 * In a Claude Code session that is not already in the work slice, every command of a
 * `bypassPermissions` session (except the removals the harness checks itself) and every `Monitor`
 * watch is rewritten (`updatedInput.command`) to run in a transient scope of `agent-work.slice`,
 * keeping its exit status and working directory; any other command is untouched (no output).
 *
 * Contract (Claude Code and Codex share it): the event arrives as JSON on stdin (`tool_name`,
 * `tool_input.command`, `cwd`); a rewrite leaves as `hookSpecificOutput.updatedInput` on stdout with
 * exit 0. The hook FAILS OPEN: on any internal error, malformed input or a missing `systemd-run` it
 * prints nothing and exits 0. It never waits on anything: a 200 ms timer ends the process if stdin
 * never closes.
 *
 * Zero dependencies: projections reference this one owning source file. Settings are read from the
 * hook's own process environment (the harness's): AGENT_HOST_GUARD=off disables it;
 * AGENT_CONTAINMENT=off leaves commands outside the slice.
 */
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { totalmem } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// GNU timeout otherwise sends TERM once and can wait forever for a process that ignores it. Keep each
// caller's requested deadline, finish termination after ten seconds, and let an explicit later
// --kill-after option win. The function is the command shell's own: it is not exported, so no
// BASH_FUNC_ variable enters the environment of what the command starts (systemd-run refuses one).
const requestedTimeoutPrelude = 'if ! declare -F timeout >/dev/null; then timeout() { command timeout --kill-after=10s "$@"; }; fi';
export const LIMITS = Object.freeze({
  maxCommandLength: 200_000,
  /** The whole process ends this many milliseconds after it starts waiting on a stdin that never closes. */
  guardMilliseconds: 200,
});

const onPath = (name, env) => (env.PATH ?? "").split(":").some((dir) => {
  if (dir === "") return false;
  try { accessSync(path.join(dir, name), constants.X_OK); return true; } catch { return false; }
});

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

// ---------------------------------------------------------------------------------------------
// Containment: everything a Claude Code session runs, held by the kernel to a share of the host.
// ---------------------------------------------------------------------------------------------

/**
 * The user-manager slice every process of every Claude Code session runs in. Its cgroup limits bind
 * the sum of all of it (sessions, subagents, monitors, commands, MCP servers), so no number of them
 * can take the machine from the person using it: the cap is the kernel's, not a rule a session is
 * trusted to keep.
 */
export const CONTAINMENT_SLICE = "agent-claude.slice";
/**
 * The slice the commands of every session run in, a sibling of the sessions' own under `agent.slice`.
 * Its memory ceiling binds the commands only, so a runaway build or test is reclaimed or killed and
 * the session that started it (and every subagent it holds) lives on to see the failure.
 */
export const WORK_SLICE = "agent-work.slice";

/**
 * Read the effective allocation of the destination user manager, not the
 * launcher's cgroup. WSL-launched agents and systemd user work are siblings;
 * sizing work from the VM ignored its tighter user.slice allocation and let
 * one npm process throttle the manager before the work limit could act.
 * Only these four known ancestors and their native limit files are read.
 */
export function effectiveUserServiceMemory({ memory = totalmem(), uid = process.getuid?.(), cgroupRoot = "/sys/fs/cgroup" } = {}) {
  if (!Number.isSafeInteger(uid) || uid < 0) return memory;
  const ancestors = ["", "user.slice", `user.slice/user-${uid}.slice`, `user.slice/user-${uid}.slice/user@${uid}.service`];
  let effective = memory;
  for (const ancestor of ancestors) for (const limit of ["memory.high", "memory.max"]) {
    try {
      const text = readFileSync(path.join(cgroupRoot, ancestor, limit), "utf8").trim();
      if (!/^[1-9][0-9]*$/u.test(text)) continue;
      const bytes = Number(text);
      if (Number.isSafeInteger(bytes)) effective = Math.min(effective, bytes);
    } catch { /* A non-cgroup host keeps the existing physical-memory fallback. */ }
  }
  return effective;
}

/**
 * The work slice's limits within `memory` bytes of effective user-service allocation: a low CPU weight, so the person at the machine
 * wins any contention while an otherwise idle host still runs agents' work at full speed (a hard CPU
 * quota of a quarter of the processors starved nine agents on an idle sixteen-processor host); a
 * command killed above 60% of the host, with no swap, so an exhausted command fails rather than the
 * machine thrashing; and a task ceiling that stops a runaway fan-out of processes. There is no
 * MemoryHigh: with no swap, anonymous memory cannot be reclaimed, so a high mark only throttles every
 * allocation in the slice without end. On 2026-10-24 the slice sat between its 45% high and 60% max
 * for hours (26.7M high events, 247 max events): every agent's command stalled, nothing was killed.
 */
export function containmentLimits({ memory = effectiveUserServiceMemory() } = {}) {
  const share = (fraction) => `${Math.floor((memory * fraction) / (1024 * 1024))}M`;
  return Object.freeze({ CPUWeight: 20, MemoryMax: share(0.6), MemorySwapMax: 0, TasksMax: 1024 });
}

/** The sessions' slice: protected, not capped. Their memory up to 10% of the host (at most 1.5 GiB) is reclaimed last, so the work slice's pressure never starves the sessions directing it. */
export function sessionLimits({ memory = totalmem() } = {}) {
  return Object.freeze({ CPUWeight: 50, MemoryLow: `${Math.floor(Math.min(memory * 0.1, 1536 * 1024 * 1024) / (1024 * 1024))}M` });
}

/** A systemd user slice unit holding `limits` (`~/.config/systemd/user/<slice>`). */
export function sliceUnit(limits = containmentLimits(), { description = "The commands every Claude Code session runs, held to a share of this host" } = {}) {
  return [
    "[Unit]",
    `Description=${description}`,
    "",
    "[Slice]",
    ...Object.entries(limits).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
}

/**
 * The launcher a harness runs in place of the `claude` executable (the VS Code extension's
 * `claudeCode.claudeProcessWrapper`, which is handed the executable and its arguments): it starts
 * them inside a transient scope of the slice, so the session and everything it ever spawns are
 * contained from its first instruction. A process already in the slice is started directly. Where
 * the user's systemd cannot place it, it says so and starts the session uncontained, whose commands
 * the hook then places in the slice one by one if it can.
 */
export function launcherScript({ slice = CONTAINMENT_SLICE } = {}) {
  const run = `systemd-run --user --scope --quiet --collect --slice=${slice}`;
  return [
    "#!/bin/sh",
    "# Generated by install-host-resource-hook (agent-harness); an install replaces any edit.",
    `# Runs "$@", the claude executable and its arguments, inside ${slice}.`,
    ': "${XDG_RUNTIME_DIR:=/run/user/$(id -u)}"',
    "export XDG_RUNTIME_DIR",
    `case "$(cat /proc/self/cgroup 2>/dev/null)" in */${slice}/*) exec "$@" ;; esac`,
    `if [ -S "$XDG_RUNTIME_DIR/bus" ] && command -v systemd-run >/dev/null 2>&1 && ${run} true 2>/dev/null; then`,
    `  exec ${run} -- "$@"`,
    "fi",
    `echo "claude launcher: the user's systemd could not place this session in ${slice}; it runs uncontained" >&2`,
    'exec "$@"',
    "",
  ].join("\n");
}

/** Whether a process whose `/proc/<pid>/cgroup` reads `cgroup` runs inside the slice. */
export const isContained = (cgroup, slice = CONTAINMENT_SLICE) => typeof cgroup === "string" && cgroup.includes(`/${slice}/`);

const ownCgroup = () => {
  try { return readFileSync("/proc/self/cgroup", "utf8"); } catch { return undefined; }
};

/** Whether a command can be placed in the slice from here: `systemd-run` on PATH and the user manager's bus at `$XDG_RUNTIME_DIR/bus`. */
function canContain(env) {
  if (env.AGENT_CONTAINMENT === "off" || !env.XDG_RUNTIME_DIR || !onPath("systemd-run", env)) return false;
  try { return statSync(path.join(env.XDG_RUNTIME_DIR, "bus")).isSocket(); } catch { return false; }
}

/**
 * `original` run in a transient scope of the work slice, in this shell's environment, keeping its exit
 * status and the directory it ends in (the harness reads the shell's directory after the command,
 * so a `cd` inside the scope must carry back out of it).
 *
 * The scope fails open like the rest of the hook. `canContain` sees only that the user manager's bus
 * socket exists; a manager that has died behind it ("Failed to start transient scope unit: Transport
 * endpoint is not connected") refuses every scope, and the command would never run. The command's
 * first act is to mark that it started, so a scope that never started runs the command here,
 * uncontained, while one that started and was killed in the slice is not run a second time.
 *
 * What systemd-run says when it cannot start the scope is kept, not discarded: its standard error goes to a file beside the
 * directory record (the command's own standard error is restored from file descriptor 3 as its first act, so the command
 * never writes there), and when no scope started that text is shown, then handed with the exit status to `recorder`
 * (`{ node, script }`, the scope-failure record entry), which keeps it with the user manager's state in an OTLP record.
 * The recorder is optional, time-bounded and never the reason the command does not run.
 */
export function containedCommand(original, { slice = WORK_SLICE, recorder = null } = {}) {
  const inner = `: >"$_AH_DIR.ran"; exec 2>&3 3>&-; trap 'pwd -P >"$_AH_DIR" 2>/dev/null' EXIT; ${requestedTimeoutPrelude}; ${original}`;
  const record = recorder ? `; { timeout 30 ${shellQuote(recorder.node)} ${shellQuote(recorder.script)} "$_ah_dir.err" "$_ah_rc" >/dev/null 2>&1 || true; }` : "";
  return [
    '_ah_dir=$(mktemp "${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/agent-dir.XXXXXX" 2>/dev/null || mktemp)',
    `_AH_DIR="$_ah_dir" systemd-run --user --scope --quiet --collect --slice=${slice} -- bash -c ${shellQuote(inner)} 3>&2 2>"$_ah_dir.err"`,
    "_ah_rc=$?",
    `[ -e "$_ah_dir.ran" ] || { cat "$_ah_dir.err" >&2 2>/dev/null${record}; _AH_DIR="$_ah_dir" bash -c ${shellQuote(inner)} 3>&2; _ah_rc=$?; }`,
    '_ah_to=$(cat "$_ah_dir" 2>/dev/null); unlink -- "$_ah_dir"; if [ -e "$_ah_dir.ran" ]; then unlink -- "$_ah_dir.ran"; fi; unlink -- "$_ah_dir.err" 2>/dev/null',
    '[ -z "$_ah_to" ] || cd "$_ah_to"',
    '(exit "$_ah_rc")',
  ].join("; ");
}

const SHELL_TOOLS = /^(Bash|shell|exec_command|local_shell|container\.exec)$/u;
/** Claude Code's Monitor runs a shell command for as long as it watches: always contained. */
const WATCH_TOOLS = /^Monitor$/u;

/** Whether `command` runs `rm`, `rmdir` or `unlink`. Claude Code checks removals itself and must read
 *  them as written; contained, a command is a `systemd-run … bash -c` carrier that check cannot see
 *  into, so such a line is left uncontained. */
export const isSelfCheckedRemoval = (command) => /(?:^|[\s;&|(`{]|\$\()(?:rm|rmdir|unlink)(?=\s|$)/u.test(command);

/**
 * The hook's answer to one PreToolUse event: the `hookSpecificOutput` object, or undefined to let
 * the command run untouched. `provider` is "claude" or "codex"; only a Claude Code session is
 * rewritten. `cgroup` is the session's own cgroup (the hook inherits it).
 *
 * A Claude Code session outside the work slice has its commands placed there: every command when it
 * runs without permission rules (`bypassPermissions`), and otherwise only the `Monitor` watches, so no
 * command an allow rule admits starts asking because of it. A session confined to an allow-list
 * (`dontAsk`) has its rules checked against the rewritten command, which none matches: it is never
 * rewritten.
 */
export function decide(input, { env = process.env, provider = "claude", cgroup = ownCgroup() } = {}) {
  if (env.AGENT_HOST_GUARD === "off" || provider !== "claude") return undefined;
  const toolInput = input?.tool_input;
  const tool = String(input?.tool_name);
  const watch = WATCH_TOOLS.test(tool);
  if (!(SHELL_TOOLS.test(tool) || watch) || typeof toolInput?.command !== "string") return undefined;
  const command = toolInput.command;
  if (command.trim() === "" || command.length > LIMITS.maxCommandLength || input.permission_mode === "dontAsk") return undefined;
  const contain = !isContained(cgroup, WORK_SLICE) && (watch || (input.permission_mode === "bypassPermissions" && !isSelfCheckedRemoval(command))) && canContain(env);
  if (!contain) return undefined;
  return { hookEventName: "PreToolUse", updatedInput: { ...toolInput, command: containedCommand(command, { recorder: { node: process.execPath, script: fileURLToPath(new URL("./scope-failure-record.mjs", import.meta.url)) } }) } };
}

/** The stdin of one hook run to its stdout; undefined for an untouched command or any failure. */
export function run(stdin, { env = process.env, provider = "claude" } = {}) {
  try {
    const output = decide(JSON.parse(stdin), { env, provider });
    return output === undefined ? undefined : JSON.stringify({ hookSpecificOutput: output });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// What a harness projects to install the hook.
// ---------------------------------------------------------------------------------------------

/** The `hooks` object naming the hook for shell tool calls (Claude Code's Bash and Monitor, Codex's Bash), valid in Claude Code settings and in Codex `hooks.json`. */
export function hookEntries(hookPath, { provider = "claude", node = process.execPath, timeout = 15 } = {}) {
  const command = `${shellQuote(node)} ${shellQuote(hookPath)}${provider === "codex" ? " --provider codex" : ""}`;
  return { PreToolUse: [{ matcher: provider === "codex" ? "Bash" : "Bash|Monitor", hooks: [{ type: "command", command, timeout }] }] };
}

/** One source reference for both providers; no copied executable hook bodies. */
export function hostResourceControl({ node, codex = true }) {
  node = path.resolve(node);
  const source = fileURLToPath(import.meta.url);
  const files = new Map();
  if (codex) files.set(".codex/hooks.json", `${JSON.stringify({ hooks: hookEntries(source, { provider: "codex" }) }, null, 2)}\n`);
  return Object.freeze({ source, files, hooks: hookEntries(source) });
}

/** Retain unrelated hooks; replace every copy of this guard, from whichever install wrote it (a source
 *  checkout, an app's dependencies, a release), so a node runs the guard once. */
export function mergeHostResourceHooks(existing, entries, node, { retiredSources = [] } = {}) {
  const sources = [fileURLToPath(import.meta.url), ...retiredSources];
  const guard = /\/host-resource-hook\.mjs['"]?(?:\s|$)/u;
  const hooks = { ...existing };
  hooks.PreToolUse = (hooks.PreToolUse ?? []).flatMap(group => {
    const held = (group.hooks ?? []).filter(handler => {
      const command = String(handler.command ?? "");
      return !guard.test(command) && !sources.some(source => command.includes(source));
    });
    return held.length === 0 ? [] : [{ ...group, hooks: held }];
  });
  hooks.PreToolUse.push(...(entries.PreToolUse ?? []));
  return hooks;
}

/** Enable this one existing feature without replacing the caller's TOML configuration. */
function enabledHooksConfiguration(text) {
  const lines = text.split("\n");
  const start = lines.findIndex(line => /^\s*\[features\]\s*(?:#.*)?$/.test(line));
  if (start < 0) return `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}\n[features]\nhooks = true\n`;
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
  const matches = lines.slice(start + 1, end).map((line, index) => ({ line, index: start + 1 + index })).filter(value => /^\s*hooks\s*=/.test(value.line));
  if (matches.length > 1) throw new Error("host-resource projection refuses duplicate features.hooks settings");
  if (matches.length === 0) lines.splice(start + 1, 0, "hooks = true");
  else {
    const { line, index } = matches[0];
    if (!/^\s*hooks\s*=\s*(true|false)\s*(?:#.*)?$/.test(line)) throw new Error("host-resource projection requires an ordinary Boolean features.hooks setting");
    lines[index] = line.replace(/(=\s*)(true|false)/, "$1true");
  }
  return lines.join("\n");
}

/** Actual local projection, never a Codex trust admission or a claim about an already running session. */
export function writeHostResourceControl({ node, providers = ["claude", "codex"], retiredSources = [], dryRun = false }) {
  node = path.resolve(node);
  if (providers.some(provider => !["claude", "codex"].includes(provider))) throw new TypeError("unknown resource-hook provider");
  const source = fileURLToPath(import.meta.url);
  const written = [];
  const expected = new Map();
  const pending = new Map();
  const read = relative => {
    const file = path.join(node, relative);
    const text = existsSync(file) ? readFileSync(file, "utf8") : undefined;
    expected.set(relative, text);
    return text;
  };
  for (const provider of providers) {
    const relative = provider === "claude" ? ".claude/settings.local.json" : ".codex/hooks.json";
    const held = JSON.parse(read(relative) ?? "{}");
    pending.set(relative, `${JSON.stringify({ ...held, hooks: mergeHostResourceHooks(held.hooks, hookEntries(source, { provider }), node, { retiredSources }) }, null, 2)}\n`);
    if (provider === "codex") pending.set(".codex/config.toml", enabledHooksConfiguration(read(".codex/config.toml") ?? ""));
  }
  // Validate all input before any configuration write; preserve another author's concurrent edit.
  for (const [relative, previous] of expected) {
    const file = path.join(node, relative);
    const current = existsSync(file) ? readFileSync(file, "utf8") : undefined;
    if (current !== previous) throw new Error(`host-resource configuration changed during projection: ${relative}`);
  }
  for (const [relative, text] of pending) {
    if (expected.get(relative) === text) continue;
    written.push(relative);
    if (dryRun) continue;
    const file = path.join(node, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, { mode: 0o600 });
  }
  return Object.freeze({ source, written, codexTrustRequired: providers.includes("codex"), activeSessionGuarded: false });
}

/** The Claude Code CLI arguments that give a headless session (`--setting-sources ""`) the hook. */
export const hookSettingsArguments = (hookPath) => ["--settings", JSON.stringify({ hooks: hookEntries(hookPath) })];

/**
 * The process: the event on stdin to a decision on stdout. Whatever happens, it is gone within
 * `guardMilliseconds` of starting to wait: a stdin that never closes, a closed one or a broken one
 * leaves the command untouched.
 */
function main() {
  const guard = setTimeout(() => process.exit(0), LIMITS.guardMilliseconds);
  guard.unref();
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("error", () => process.exit(0));
  process.stdin.on("end", () => {
    // stdin closed: the 200 ms timer has done its job. What follows is bounded by the decision itself
    clearTimeout(guard);
    try {
      const at = process.argv.indexOf("--provider");
      const output = run(Buffer.concat(chunks).toString("utf8"), { provider: at < 0 ? "claude" : process.argv[at + 1] });
      if (output !== undefined) process.stdout.write(output);
    } catch { /* fail open */ }
  });
}

let invoked = false;
try { invoked = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { invoked = false; }
if (invoked) main();
