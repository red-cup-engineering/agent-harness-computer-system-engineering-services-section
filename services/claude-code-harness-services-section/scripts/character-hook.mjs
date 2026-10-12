#!/usr/bin/env node
// character-hook block-agent-subagents|lint-frontmatter|validate-spec-frontmatter|guard-reads [STORE]
// Reads the PreToolUse payload on stdin; exit 0 lets the call go ahead, exit 2 blocks it with the reason.
import { CHARACTER_HOOKS } from "../src/character-hooks.mjs";

const [name, store] = process.argv.slice(2);
const rule = CHARACTER_HOOKS[name];
if (!rule) { console.error(`usage: character-hook ${Object.keys(CHARACTER_HOOKS).join("|")} [STORE]`); process.exit(1); }
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let payload;
try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { process.exit(0); }
const decision = rule(payload, store);
if (!decision.block) process.exit(0);
if (name === "guard-reads") process.stdout.write(`${JSON.stringify({ continue: false, reason: decision.reason })}\n`);
process.stderr.write(`${decision.reason}\n`);
process.exit(2);
