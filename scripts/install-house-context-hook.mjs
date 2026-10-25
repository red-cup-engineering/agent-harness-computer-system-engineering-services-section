#!/usr/bin/env node
/**
 * Install the house-context carrier (`src/house-context-hook.mjs`) as the SessionStart, SubagentStart and
 * UserPromptSubmit hooks of one user's Claude Code settings, referencing this owning source by absolute
 * path (the way `install-host-resource-hook` references the host-resource guard), so every session started in the
 * Group's working trees begins with the Group's rules, decisions and open work.
 *
 *   install-house-context-hook [--settings <file>] [--tree <dir>]... [--dry-run] [--uninstall]
 *
 * Without --tree the user's ~/info and ~/bare-cedar-fog are used where they exist. Every other key and hook of
 * the settings file is kept; an entry this script wrote earlier is replaced, so running it twice changes nothing.
 * The first change to a settings file keeps `<file>.before-house-context-hook`; a file that is not valid JSON is
 * never touched. --uninstall removes this hook's entries and nothing else.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EVENTS, houseContextHookEntries, mergeHouseContextHooks } from "../src/house-context-hook.mjs";

export function installHouseContextHook({ settings, trees, environment = process.env, dryRun = false, uninstall = false, node = process.execPath } = {}) {
  const home = environment.HOME ?? homedir();
  const settingsPath = path.resolve(settings ?? path.join(environment.CLAUDE_CONFIG_DIR || path.join(home, ".claude"), "settings.json"));
  const named = trees?.length ? trees : ["info", "bare-cedar-fog"].map((name) => path.join(home, name)).filter((dir) => existsSync(dir));
  if (!uninstall && named.length === 0) throw new TypeError("no working tree: pass --tree <dir>");
  const before = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : undefined;
  let current = {};
  if (before !== undefined && before.trim() !== "") {
    try { current = JSON.parse(before); } catch (error) { throw new Error(`${settingsPath} is not valid JSON, so it was left alone: ${error.message}`); }
    if (current === null || typeof current !== "object" || Array.isArray(current)) throw new Error(`${settingsPath} is not a JSON object, so it was left alone`);
  }
  if (current.hooks !== undefined && (current.hooks === null || typeof current.hooks !== "object" || Array.isArray(current.hooks))) throw new TypeError("hooks must be an object");
  for (const event of EVENTS) if (current.hooks?.[event] !== undefined && !Array.isArray(current.hooks[event])) throw new TypeError(`${event} must be an array`);
  const entries = uninstall ? Object.fromEntries(EVENTS.map((event) => [event, []])) : houseContextHookEntries(named.flatMap((tree) => ["--tree", tree]), { node });
  const merged = mergeHouseContextHooks(current.hooks, entries);
  for (const event of EVENTS) if (merged[event].length === 0) delete merged[event];
  const next = { ...current, hooks: merged };
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const changed = text !== before;
  if (changed && !dryRun) {
    mkdirSync(path.dirname(settingsPath), { recursive: true });
    const keep = `${settingsPath}.before-house-context-hook`;
    if (before !== undefined && !existsSync(keep)) copyFileSync(settingsPath, keep);
    const staged = `${settingsPath}.${process.pid}.tmp`;
    writeFileSync(staged, text, { mode: 0o600 });
    renameSync(staged, settingsPath);
  }
  return Object.freeze({ settings: settingsPath, events: uninstall ? [] : EVENTS, trees: uninstall ? [] : named, changed, dryRun, backup: `${settingsPath}.before-house-context-hook` });
}

function main(argv) {
  const option = (name) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const trees = argv.flatMap((value, index) => (value === "--tree" ? [argv[index + 1]] : []));
  process.stdout.write(`${JSON.stringify(installHouseContextHook({ settings: option("--settings"), trees, dryRun: argv.includes("--dry-run"), uninstall: argv.includes("--uninstall") }))}\n`);
}

let invoked = false;
try { invoked = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { invoked = false; }
if (invoked) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
