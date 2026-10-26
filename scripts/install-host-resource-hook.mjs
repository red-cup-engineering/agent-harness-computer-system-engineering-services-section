#!/usr/bin/env node
/**
 * Install the host-resource controller (`src/host-resource-hook.mjs`) for one user of a machine, for
 * the machines where no node projection (`claude-harness-project`) writes it: reference the
 * owning source in the user's Claude Code settings (or Codex `hooks.json`) as a
 * PreToolUse hook on Bash. The hook entry is built by the same `hookEntries` the projection uses.
 *
 *   install-host-resource-hook [--settings <file>] [--provider claude|codex]
 *                              [--vscode-settings <file>] [--no-containment] [--dry-run]
 *
 * Every other key of the settings file, and every other hook in it, is kept as it is; an entry this
 * script wrote earlier is replaced, so running it again after the hook changes updates it in place
 * and running it twice changes nothing. A settings file that is not valid JSON is never touched.
 * Settings are validated before effects; unrelated handlers remain in their groups.
 *
 * For Claude Code it also installs the containment that holds every session to a share of the host
 * (`installContainment`): the `agent-claude.slice` unit for the sessions and the `agent-work.slice` unit
 * for their commands, reloaded into the user manager; the
 * launcher `claude-contained` in the user's agent-harness data directory; and, on a machine with a
 * VS Code server, the machine setting `claudeCode.claudeProcessWrapper` naming that launcher, so
 * every session VS Code starts runs inside the slice, together with `EDITOR_SETTINGS`, which keep the
 * editor itself from crawling the tree. `--no-containment` leaves all three alone.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONTAINMENT_SLICE, WORK_SLICE, containmentLimits, hookEntries, hostResourceControl, mergeHostResourceHooks, launcherScript, sessionLimits, sliceUnit } from "../src/host-resource-hook.mjs";

const LAUNCHER_FILE = "claude-contained";
const WRAPPER_SETTING = "claudeCode.claudeProcessWrapper";

/**
 * Machine settings that keep VS Code from holding the opened tree in memory. On Bare Cedar Fog
 * (2026-10-26, Trace log) the crawl came from VS Code's agent host, not from an extension: every
 * window load creates a Copilot CLI chat session there, and the agent host watches each session's
 * working directory recursively (`AgentHostFileMonitorService`, from `_ensureRootWatcher`) with a
 * fixed exclusion of git internals only. It never reads `files.watcherExclude`, so it walked the
 * whole hub, `node_modules` under a section's `data/logs` included: 112 to 346 MB in six minutes,
 * charged to the cgroup the Claude sessions run in. `chat.disableAIFeatures` (window scope, so it
 * holds from machine settings) turns off the built-in Copilot features that create those sessions;
 * the house's carriers are Codex and Claude Code, which reach VS Code through their own extensions.
 * The watcher exclusion holds for every folder this server opens, and Copilot's two whole-folder
 * searches stay off.
 */
export const EDITOR_SETTINGS = Object.freeze({
  "chat.disableAIFeatures": true,
  "files.watcherExclude": Object.freeze({ "**": true }),
  "github.copilot.chat.workspace.codeSearchExternalIngest.enabled": false,
  "github.copilot.chat.localIndex.enabled": false,
});

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
 * Install the containment for one user: `{ unit, workUnit, launcher, vscodeSettings, vscode, reloaded, changed }`.
 * `vscode` is "set", "unchanged", "absent" (no VS Code server here) or "left alone" (its settings
 * are not plain JSON); `reloaded` is whether the user manager took a changed unit.
 */
export function installContainment({ environment = process.env, vscodeSettings, dryRun = false, reload = reloadUserManager } = {}) {
  const home = environment.HOME ?? homedir();
  const units = path.join(environment.XDG_CONFIG_HOME || path.join(home, ".config"), "systemd", "user");
  const unit = path.join(units, CONTAINMENT_SLICE), workUnit = path.join(units, WORK_SLICE);
  const launcher = path.join(environment.XDG_DATA_HOME || path.join(home, ".local", "share"), "agent-harness", LAUNCHER_FILE);
  const machineSettings = vscodeSettings ?? path.join(home, ".vscode-server", "data", "Machine", "settings.json");

  const unitChanged = [
    writeIfChanged(unit, sliceUnit(sessionLimits(), { description: "Every Claude Code session, protected so its commands' pressure never starves it" }), { dryRun }),
    writeIfChanged(workUnit, sliceUnit(containmentLimits()), { dryRun }),
  ].some(Boolean);
  const launcherChanged = writeIfChanged(launcher, launcherScript(), { dryRun, mode: 0o755 });
  const reloaded = unitChanged && !dryRun ? reload() : false;

  let vscode = "absent";
  if (vscodeSettings !== undefined || existsSync(path.dirname(machineSettings))) {
    const before = existsSync(machineSettings) ? readFileSync(machineSettings, "utf8") : "";
    let current;
    try { current = before.trim() === "" ? {} : JSON.parse(before); } catch { current = undefined; }
    const wanted = { [WRAPPER_SETTING]: launcher, ...EDITOR_SETTINGS };
    if (current === null || typeof current !== "object" || Array.isArray(current)) vscode = "left alone";
    else if (Object.entries(wanted).every(([key, value]) => JSON.stringify(current[key]) === JSON.stringify(value))) vscode = "unchanged";
    else {
      vscode = "set";
      writeIfChanged(machineSettings, `${JSON.stringify({ ...current, ...wanted }, null, 2)}\n`, { dryRun });
    }
  }
  return Object.freeze({ unit, workUnit, launcher, vscodeSettings: machineSettings, vscode, reloaded, changed: unitChanged || launcherChanged || vscode === "set" });
}

const HOOK_FILE = "host-resource-hook.mjs";

/**
 * Reference the retained executable owner in one user's settings. A dry run
 * reports the projected change without writing configuration or containment.
 */
export function installHostResourceHook({ settings, provider = "claude", environment = process.env, dryRun = false, containment = false, vscodeSettings, reload } = {}) {
  if (!["claude", "codex"].includes(provider)) throw new TypeError(`provider is claude or codex, not ${provider}`);
  const home = environment.HOME ?? homedir();
  const hookPath = hostResourceControl({ node: home }).source;
  const retiredHook = path.join(environment.XDG_DATA_HOME || path.join(home, ".local", "share"), "agent-harness", HOOK_FILE);
  const settingsPath = path.resolve(settings ?? (provider === "codex"
    ? path.join(environment.CODEX_HOME || path.join(home, ".codex"), "hooks.json")
    : path.join(environment.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), "settings.json")));

  const before = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : undefined;
  let current = {};
  if (before !== undefined && before.trim() !== "") {
    try { current = JSON.parse(before); } catch (error) { throw new Error(`${settingsPath} is not valid JSON, so it was left alone: ${error.message}`); }
    if (current === null || typeof current !== "object" || Array.isArray(current)) throw new Error(`${settingsPath} is not a JSON object, so it was left alone`);
  }
  if (current.hooks !== undefined && (current.hooks === null || typeof current.hooks !== "object" || Array.isArray(current.hooks))) throw new TypeError("hooks must be an object");
  if (current.hooks?.PreToolUse !== undefined && !Array.isArray(current.hooks.PreToolUse)) throw new TypeError("PreToolUse must be an array");
  for (const group of current.hooks?.PreToolUse ?? []) {
    if (!group || !Array.isArray(group.hooks)) throw new TypeError("each PreToolUse group requires its handler array");
    if (group.hooks.some(handler => !handler || typeof handler !== "object" || Array.isArray(handler))) throw new TypeError("each hook handler must be an object");
  }
  const next = { ...current, hooks: mergeHostResourceHooks(current.hooks, hookEntries(hookPath, { provider }), home, { retiredSources: [retiredHook] }) };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  if ((existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : undefined) !== before) throw new Error("host-resource settings changed during projection");
  const contained = provider === "claude" && containment ? installContainment({ environment, vscodeSettings, dryRun, reload }) : undefined;
  const changed = text !== before;
  if (text !== before) {
    if ((existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : undefined) !== before) throw new Error("host-resource settings changed before projection");
    if (!dryRun) {
      const keep = `${settingsPath}.before-host-resource-hook`;
      if (before !== undefined && !existsSync(keep)) copyFileSync(settingsPath, keep);
      writeIfChanged(settingsPath, text, { mode: 0o600 });
    }
  }
  return Object.freeze({ hook: hookPath, settings: settingsPath, provider, changed: changed || contained?.changed === true, sourceReferenced: true, activeSessionGuarded: false, ...(contained ? { containment: contained } : {}) });
}

function main(argv) {
  if (argv.includes("--dest")) throw new TypeError("--dest is retired; this installer references its owning source, use --settings to name the configuration");
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
