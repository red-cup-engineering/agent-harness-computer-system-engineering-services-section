#!/usr/bin/env node
/**
 * Install the host-resource controller (`src/host-resource-hook.mjs`) for one user of a machine, for
 * the machines where no node projection (`claude-harness-project`) writes it: reference the owning
 * source file in the user's Claude Code settings (or Codex `hooks.json`) as a
 * PreToolUse hook on Bash. The hook entry is built by the same `hookEntries` the projection uses.
 *
 *   install-host-resource-hook [--settings <file>] [--provider claude|codex]
 *                              [--vscode-settings <file>] [--no-containment] [--dry-run]
 *
 * Every other key of the settings file, and every other hook in it, is kept as it is; an entry this
 * script wrote earlier is replaced, so running it again after the hook changes updates it in place
 * and running it twice changes nothing. A settings file that is not valid JSON is never touched.
 * The first time a settings file is changed its earlier text is kept beside it as
 * `<file>.before-host-resource-hook`.
 *
 * For Claude Code it also installs the containment that holds every session to a share of the host
 * (`installContainment`): the `agent-claude.slice` user unit, reloaded into the user manager; the
 * launcher `claude-contained` in the user's agent-harness data directory; and, on a machine with a
 * VS Code server, the machine setting `claudeCode.claudeProcessWrapper` naming that launcher, so
 * every session VS Code starts runs inside the slice. `--no-containment` leaves all three alone.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONTAINMENT_SLICE, hookEntries, hostResourceControl, launcherScript, sliceUnit } from "../src/host-resource-hook.mjs";

const LAUNCHER_FILE = "claude-contained";
const WRAPPER_SETTING = "claudeCode.claudeProcessWrapper";

/** Write `text` to `file` atomically, if it differs; whether it did. */
function writeIfChanged(file, text, { dryRun, mode } = {}) {
  if (existsSync(file) && readFileSync(file, "utf8") === text) return false;
  if (dryRun) return true;
  mkdirSync(path.dirname(file), { recursive: true });
  const staged = `${file}.${process.pid}.tmp`;
  writeFileSync(staged, text);
  if (mode !== undefined) chmodSync(staged, mode);
  renameSync(staged, file);
  return true;
}

const reloadUserManager = () => spawnSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore", timeout: 30_000 }).status === 0;

/**
 * Install the containment for one user: `{ unit, launcher, vscodeSettings, vscode, reloaded, changed }`.
 * `vscode` is "set", "unchanged", "absent" (no VS Code server here) or "left alone" (its settings
 * are not plain JSON); `reloaded` is whether the user manager took a changed unit.
 */
export function installContainment({ environment = process.env, vscodeSettings, dryRun = false, reload = reloadUserManager } = {}) {
  const home = environment.HOME ?? homedir();
  const unit = path.join(environment.XDG_CONFIG_HOME || path.join(home, ".config"), "systemd", "user", CONTAINMENT_SLICE);
  const launcher = path.join(environment.XDG_DATA_HOME || path.join(home, ".local", "share"), "agent-harness", LAUNCHER_FILE);
  const machineSettings = vscodeSettings ?? path.join(home, ".vscode-server", "data", "Machine", "settings.json");

  const unitChanged = writeIfChanged(unit, sliceUnit(), { dryRun });
  const launcherChanged = writeIfChanged(launcher, launcherScript(), { dryRun, mode: 0o755 });
  const reloaded = unitChanged && !dryRun ? reload() : false;

  let vscode = "absent";
  if (vscodeSettings !== undefined || existsSync(path.dirname(machineSettings))) {
    const before = existsSync(machineSettings) ? readFileSync(machineSettings, "utf8") : "";
    let current;
    try { current = before.trim() === "" ? {} : JSON.parse(before); } catch { current = undefined; }
    if (current === null || typeof current !== "object" || Array.isArray(current)) vscode = "left alone";
    else if (current[WRAPPER_SETTING] === launcher) vscode = "unchanged";
    else {
      vscode = "set";
      writeIfChanged(machineSettings, `${JSON.stringify({ ...current, [WRAPPER_SETTING]: launcher }, null, 2)}\n`, { dryRun });
    }
  }
  return Object.freeze({ unit, launcher, vscodeSettings: machineSettings, vscode, reloaded, changed: unitChanged || launcherChanged || vscode === "set" });
}

const HOOK_FILE = "host-resource-hook.mjs";

const isOurs = (entry) => (entry?.hooks ?? []).some((handler) => typeof handler?.command === "string" && handler.command.includes(HOOK_FILE));

/**
 * `{ hook, settings, provider, changed }`: the owning hook source and the settings file naming it.
 * With `dryRun` nothing is written and `changed` says what would be.
 */
export function installHostResourceHook({ settings, provider = "claude", environment = process.env, dryRun = false, containment = false, vscodeSettings, reload } = {}) {
  if (!["claude", "codex"].includes(provider)) throw new TypeError(`provider is claude or codex, not ${provider}`);
  const contained = provider === "claude" && containment ? installContainment({ environment, vscodeSettings, dryRun, reload }) : undefined;
  const outcome = (hook, settingsFile, changed) => Object.freeze({ hook, settings: settingsFile, provider, changed: changed || contained?.changed === true, ...(contained ? { containment: contained } : {}) });
  const home = environment.HOME ?? homedir();
  const hookPath = hostResourceControl({ node: home }).source;
  const settingsPath = path.resolve(settings ?? (provider === "codex"
    ? path.join(environment.CODEX_HOME || path.join(home, ".codex"), "hooks.json")
    : path.join(environment.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), "settings.json")));

  const before = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : undefined;
  let current = {};
  if (before !== undefined && before.trim() !== "") {
    try { current = JSON.parse(before); } catch (error) { throw new Error(`${settingsPath} is not valid JSON, so it was left alone: ${error.message}`); }
    if (current === null || typeof current !== "object" || Array.isArray(current)) throw new Error(`${settingsPath} is not a JSON object, so it was left alone`);
  }
  const ours = hookEntries(hookPath, { provider }).PreToolUse;
  const others = Array.isArray(current.hooks?.PreToolUse) ? current.hooks.PreToolUse.filter((entry) => !isOurs(entry)) : [];
  const next = { ...current, hooks: { ...current.hooks, PreToolUse: [...others, ...ours] } };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const changed = text !== before;
  if (dryRun || !changed) return outcome(hookPath, settingsPath, changed);

  if (text !== before) {
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    const keep = `${settingsPath}.before-host-resource-hook`;
    if (before !== undefined && !existsSync(keep)) copyFileSync(settingsPath, keep);
    writeFileSync(settingsPath, text);
  }
  return outcome(hookPath, settingsPath, changed);
}

function main(argv) {
  const option = (name) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const result = installHostResourceHook({
    settings: option("--settings"),
    provider: option("--provider") ?? "claude",
    vscodeSettings: option("--vscode-settings"),
    containment: !argv.includes("--no-containment"),
    dryRun: argv.includes("--dry-run"),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

let invoked = false;
try { invoked = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { invoked = false; }
if (invoked) main(process.argv.slice(2));
