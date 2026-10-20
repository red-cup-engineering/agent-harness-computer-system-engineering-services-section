#!/usr/bin/env node
// Write an agent handoff record so a fresh agent continues the Work.
//   write-agent-handoff.mjs --input FILE|- [--out DIR] [--transcript JSONL] [--session ID] [--agent ID] [--prompt]
// --input is the JSON described by formHandoffRecord (src/agent-handoff.mjs). --transcript fills `from.model` and
// `from.contextTokens` from the transcript's last request (usage fields only). The record lands in --out
// (default $AGENT_HANDOFF_DIR or ./data/state/agent-handoffs) as <id>.json; --prompt prints the successor's prompt.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { contextOfClaudeTranscript, formHandoffRecord, renderHandoffPrompt } from "../src/agent-handoff.mjs";

const args = process.argv.slice(2);
const one = (flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args[i + 1]; };
try {
  const inputPath = one("--input");
  if (inputPath === undefined) throw new TypeError("--input FILE|- is required");
  const input = JSON.parse(readFileSync(inputPath === "-" ? 0 : inputPath, "utf8"));
  const transcript = one("--transcript");
  const measured = transcript === undefined ? null : contextOfClaudeTranscript(readFileSync(transcript, "utf8"));
  // Actual transcript testimony outranks caller-authored handoff estimates. A
  // supplied but unreadable transcript has unknown usage, not the caller's
  // previous estimate. Explicit CLI occurrence binding outranks an old draft.
  input.from = {
    ...(input.from ?? {}),
    ...(transcript === undefined ? {} : measured ?? { model: null, contextTokens: null }),
    ...(one("--session") ? { sessionId: one("--session") } : {}),
    ...(one("--agent") ? { agentId: one("--agent") } : {}),
  };
  const record = formHandoffRecord(input);
  const dir = one("--out") ?? process.env.AGENT_HANDOFF_DIR ?? path.join(process.cwd(), "data/state/agent-handoffs");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.id.slice("sha256:".length)}.json`);
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
  if (args.includes("--prompt")) console.log(renderHandoffPrompt(record));
  else console.log(JSON.stringify({ id: record.id, file, contextTokens: record.from.contextTokens }));
} catch (error) {
  console.error(`write-agent-handoff: ${error.message}`);
  process.exit(2);
}
