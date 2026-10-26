#!/usr/bin/env node
/**
 * Install the session-end scratch hook (`src/session-end-scratch-hook.mjs`) as the SessionEnd hook of one user's
 * Claude Code settings, referencing this owning source by absolute path, the way `install-house-context-hook` does.
 *
 *   install-session-end-scratch-hook --codex-home <codex-home.mjs> --parameters <codex-home.json> [--settings <file>] [--install-dir <dir>] [--dry-run] [--uninstall]
 *
 * Every other key and hook of the settings file is kept; an entry this script wrote earlier is replaced, so running
 * it twice changes nothing. The first change keeps `<file>.before-session-end-scratch-hook`; a file that is not valid
 * JSON is never touched. --uninstall removes this hook's entry and nothing else.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HOOK_FILE, mergeSessionEndHooks, sessionEndHookEntries } from "../src/session-end-scratch-hook.mjs";

const SOURCE = fileURLToPath(new URL("../src/session-end-scratch-hook.mjs", import.meta.url));

export function installSessionEndScratchHook({ settings, codexHome, parameters, installDir, environment = process.env, dryRun = false, uninstall = false, node = process.execPath } = {}) {
  const home = environment.HOME ?? homedir();
  const hookPath = path.join(installDir ?? path.join(home, ".local/lib/561-group/session-end-scratch-hook"), HOOK_FILE);
  const settingsPath = path.resolve(settings ?? path.join(environment.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), "settings.json"));
  const before = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : undefined;
  let current = {};
  if (before !== undefined && before.trim() !== "") {
    try { current = JSON.parse(before); } catch (error) { throw new Error(`${settingsPath} is not valid JSON, so it was left alone: ${error.message}`); }
    if (current === null || typeof current !== "object" || Array.isArray(current)) throw new Error(`${settingsPath} is not a JSON object, so it was left alone`);
  }
  if (current.hooks !== undefined && (current.hooks === null || typeof current.hooks !== "object" || Array.isArray(current.hooks))) throw new TypeError("hooks must be an object");
  if (current.hooks?.SessionEnd !== undefined && !Array.isArray(current.hooks.SessionEnd)) throw new TypeError("SessionEnd must be an array");
  const entries = uninstall ? { SessionEnd: [] } : sessionEndHookEntries(["--codex-home", codexHome, "--parameters", parameters, "--node", node], { node, source: hookPath });
  const merged = mergeSessionEndHooks(current.hooks, entries);
  if (merged.SessionEnd.length === 0) delete merged.SessionEnd;
  const next = { ...current, hooks: merged };
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const changed = text !== before;
  if (changed && !dryRun) {
    if (!uninstall) {
      // The hook runs from an installed copy, staged and renamed so a session ending mid-install reads a whole file.
      mkdirSync(path.dirname(hookPath), { recursive: true });
      const stagedHook = `${hookPath}.${process.pid}.tmp`;
      writeFileSync(stagedHook, readFileSync(SOURCE), { mode: 0o600 });
      renameSync(stagedHook, hookPath);
    }
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    const keep = `${settingsPath}.before-session-end-scratch-hook`;
    if (before !== undefined && !existsSync(keep)) copyFileSync(settingsPath, keep);
    const staged = `${settingsPath}.${process.pid}.tmp`;
    writeFileSync(staged, text, { mode: 0o600 });
    renameSync(staged, settingsPath);
  }
  return Object.freeze({ settings: settingsPath, hook: uninstall ? null : hookPath, event: uninstall ? null : "SessionEnd", changed, dryRun, backup: `${settingsPath}.before-session-end-scratch-hook` });
}

function main(argv) {
  const option = (name) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const home = process.env.HOME ?? homedir();
  const installed = path.join(home, ".local/lib/561-group/codex-home-service");
  process.stdout.write(`${JSON.stringify(installSessionEndScratchHook({
    settings: option("--settings"), codexHome: option("--codex-home") ?? path.join(installed, "scripts/codex-home.mjs"),
    parameters: option("--parameters") ?? path.join(installed, "codex-home.json"), installDir: option("--install-dir"), dryRun: argv.includes("--dry-run"), uninstall: argv.includes("--uninstall"),
  }))}\n`);
}

let invoked = false;
try { invoked = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { invoked = false; }
if (invoked) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
