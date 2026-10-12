#!/usr/bin/env node
// Project an assistant's briefing for one principal on one MetroPlat instance and print it.
// Usage: project-agent-briefing.mjs --agency-root <dir> --holder <account> --principal <name>
//          --instance-name <host> --instance-title <title> --origin <https://...>
import { projectAgentBriefing } from "../src/agent-briefing.mjs";

const args = process.argv.slice(2);
const value = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const required = ["--agency-root", "--holder", "--principal", "--instance-name", "--instance-title", "--origin"];
const missing = required.filter((flag) => value(flag) === undefined);
if (missing.length) { process.stderr.write(`missing ${missing.join(", ")}\n`); process.exit(2); }
const briefing = projectAgentBriefing({
  agencyRoot: value("--agency-root"), holder: value("--holder"), principal: value("--principal"),
  instance: { name: value("--instance-name"), title: value("--instance-title"), origin: value("--origin") },
});
for (const obstruction of briefing.obstructions) process.stderr.write(`obstruction: ${obstruction}\n`);
process.stdout.write(briefing.markdown);
process.exit(briefing.obstructions.length ? 1 : 0);
