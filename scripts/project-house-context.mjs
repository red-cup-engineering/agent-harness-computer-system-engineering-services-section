#!/usr/bin/env node
// Print the house context a session receives: the same projection the house-context hook injects, from the
// same records, for a session or sub-agent that was not given it (the hook is the carrier; this is the
// tool a brief tells an agent to call first when it finds the context absent).
//
//   project-house-context [--tree <working tree>...] [--cwd <dir>] [--event SessionStart|SubagentStart] [--offline]
//   project-house-context --section <561-group-services-section dir> ...
//   project-house-context --prompt "<text>" --event UserPromptSubmit     (what a capitalized prompt injects)
import { main } from "../src/house-context-hook.mjs";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { Readable } from "node:stream";

const argv = process.argv.slice(2);
const take = (flag) => { const at = argv.indexOf(flag); return at < 0 ? undefined : argv.splice(at, 2)[1]; };
const cwd = take("--cwd") ?? process.cwd();
const prompt = take("--prompt");
const event = argv.includes("--event") ? argv[argv.indexOf("--event") + 1] : "SessionStart";
if (!argv.includes("--event")) argv.push("--event", event);
if (!argv.includes("--tree") && !argv.includes("--section")) {
  // Without a named tree, the user's own Group working trees (the ones the installed hook names).
  for (const name of ["info", "bare-cedar-fog"]) if (existsSync(`${homedir()}/${name}`)) argv.push("--tree", `${homedir()}/${name}`);
}
const chunks = [];
const stdout = { write: (text) => chunks.push(text) };
await main(argv, { stdin: Readable.from([JSON.stringify({ hook_event_name: event, cwd, prompt })]), stdout });
const reply = chunks.join("");
if (reply === "") process.stderr.write("nothing to project: the directory is outside the named working trees, or the prompt is not in capitals\n");
else process.stdout.write(`${JSON.parse(reply).hookSpecificOutput.additionalContext}\n`);
