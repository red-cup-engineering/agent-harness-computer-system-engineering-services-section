#!/usr/bin/env node
/**
 * @module session-end-scratch-hook
 * Releases an ended Claude Code session's scratch on the SessionEnd event, not on a clock. The hook hands the
 * session id and the session's own process id to the codex-home service's `retire` entrance and returns; that
 * entrance waits for the process to exit (it still holds its folder while SessionEnd fires) and then removes the
 * folder through the same guards as the scratch scope: kept, mounted, open, running under that id, uncommitted or
 * unpushed git work. A held folder is left for the scratch scope. The hook never removes anything itself, never
 * delays the session, and always exits 0.
 *
 *   session-end-scratch-hook --codex-home <codex-home.mjs> --parameters <codex-home.json> [--node <node>]
 *
 * A `/clear` ends a session id inside a process that keeps running, so it is left alone.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Self-contained on purpose: the installer copies this one file to where the hook runs from, so a checkout change
// (clean, pull, submodule update) cannot remove the file a session end depends on.
const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

const SOURCE = fileURLToPath(import.meta.url);
export const HOOK_FILE = "session-end-scratch-hook.mjs";
export const EVENTS = Object.freeze(["SessionEnd"]);
const CONTINUES = new Set(["clear", "resume"]);

export function parseArguments(argv) {
  const options = { codexHome: undefined, parameters: undefined, node: process.execPath };
  for (let index = 0; index < argv.length; index += 2) {
    const key = { "--codex-home": "codexHome", "--parameters": "parameters", "--node": "node" }[argv[index]];
    if (!key || argv[index + 1] === undefined) throw new TypeError(`session-end-scratch-hook: expected --codex-home, --parameters or --node at ${argv[index]}`);
    options[key] = argv[index + 1];
  }
  if (!options.codexHome || !options.parameters) throw new TypeError("session-end-scratch-hook: --codex-home and --parameters are required");
  for (const value of [options.codexHome, options.parameters, options.node]) if (!path.isAbsolute(value)) throw new TypeError("session-end-scratch-hook: paths must be absolute");
  return Object.freeze(options);
}

/** The process that carries `--session-id=<id>` or `--resume <id>` on its command line, or null. */
export function sessionProcess(session, proc = "/proc") {
  for (const pid of readdirSync(proc).filter((d) => /^\d+$/.test(d))) {
    let argv;
    try { argv = readFileSync(path.join(proc, pid, "cmdline"), "utf8").split("\0"); } catch { continue; }
    if (argv.some((arg, i) => arg === `--session-id=${session}` || arg === `--resume=${session}` || ((arg === "--session-id" || arg === "--resume") && argv[i + 1] === session))) return Number(pid);
  }
  return null;
}

/** One SessionEnd payload in, at most one detached `retire` out. Returns what it started, for the caller and tests. */
export function handleSessionEnd(payload, options, { start = (command, args) => spawn(command, args, { detached: true, stdio: "ignore" }).unref(), find = sessionProcess } = {}) {
  if (payload?.hook_event_name !== "SessionEnd") return { started: false, reason: "not SessionEnd" };
  if (typeof payload.session_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(payload.session_id)) return { started: false, reason: "no usable session id" };
  if (CONTINUES.has(payload.reason)) return { started: false, reason: `the process continues (${payload.reason})` };
  const pid = find(payload.session_id);
  const args = [options.codexHome, "retire", `--parameters=${options.parameters}`, `--session=${payload.session_id}`, ...(pid ? [`--after-pid=${pid}`] : [])];
  start(options.node, args);
  return { started: true, command: options.node, args };
}

/** Settings hook group for SessionEnd, running this source with the same arguments. */
export function sessionEndHookEntries(hookArguments, { node = process.execPath, source = SOURCE, timeout = 10 } = {}) {
  parseArguments(hookArguments);
  const command = [node, source, ...hookArguments].map(shellQuote).join(" ");
  return Object.freeze({ SessionEnd: [{ hooks: [{ type: "command", command, timeout }] }] });
}

/** Settings hooks with the entry in place: unrelated hooks are kept, any earlier entry of this hook is replaced. */
export function mergeSessionEndHooks(existing = {}, entries) {
  const hooks = { ...existing };
  hooks.SessionEnd = (hooks.SessionEnd ?? []).flatMap((group) => {
    const held = (group.hooks ?? []).filter((handler) => !String(handler.command ?? "").includes(HOOK_FILE));
    return held.length === 0 ? [] : [{ ...group, hooks: held }];
  });
  hooks.SessionEnd.push(...(entries.SessionEnd ?? []));
  return hooks;
}

const readAll = async (stream) => { let text = ""; for await (const chunk of stream) text += chunk; return text; };

/** The hook: always exits 0, prints nothing. */
export async function main(argv = process.argv.slice(2), { stdin = process.stdin } = {}) {
  try {
    const payload = JSON.parse(await readAll(stdin) || "{}");
    handleSessionEnd(payload, parseArguments(argv));
  } catch { /* an ending session is never held up by its scratch */ }
}

let invoked = false;
try { invoked = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(SOURCE); } catch { invoked = false; }
if (invoked) await main();
