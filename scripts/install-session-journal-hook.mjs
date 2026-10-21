#!/usr/bin/env node
/**
 * Install the session journal (`src/session-journal-hook.mjs`) as a SessionStart hook in a Claude Code
 * settings file, referencing this owning source, so every session the settings govern starts with
 * the node's work board.
 *
 *   install-session-journal-hook --settings <file> [--dry-run] -- <session-journal-hook arguments>
 *
 * Every other key and hook of the settings file is kept; an entry this script wrote earlier (from any
 * copy of the hook) is replaced, so running it again updates the entry in place and running it twice
 * changes nothing. A settings file that is not valid JSON is never touched.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { journalHookEntry, mergeJournalHooks } from "../src/session-journal-hook.mjs";

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const own = split < 0 ? argv : argv.slice(0, split);
const hookArguments = split < 0 ? [] : argv.slice(split + 1);
const settingsAt = own.indexOf("--settings");
const settings = settingsAt < 0 ? undefined : own[settingsAt + 1];
const dryRun = own.includes("--dry-run");
try {
  if (settings === undefined) throw new TypeError("usage: install-session-journal-hook --settings <file> [--dry-run] -- <hook arguments>");
  const file = path.resolve(settings);
  const before = existsSync(file) ? readFileSync(file, "utf8") : "{}";
  const current = JSON.parse(before);
  const next = { ...current, hooks: mergeJournalHooks(current.hooks, journalHookEntry(hookArguments)) };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const changed = text !== before;
  if (changed && !dryRun) {
    mkdirSync(path.dirname(file), { recursive: true });
    const staged = `${file}.${process.pid}.tmp`;
    writeFileSync(staged, text);
    renameSync(staged, file);
  }
  console.log(JSON.stringify({ settings: file, hook: "SessionStart", changed, dryRun }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
