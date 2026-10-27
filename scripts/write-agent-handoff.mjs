#!/usr/bin/env node
// Write an agent handoff record so a fresh agent continues the Work.
//   write-agent-handoff.mjs --input FILE|- [--out DIR] [--transcript JSONL] [--session ID] [--agent ID] [--prompt]
// --input is the JSON described by formHandoffRecord (src/agent-handoff.mjs). --transcript fills `from.model` and
// `from.contextTokens` from the transcript's last request (usage fields only). The record lands in --out
// (default: this section's agent-handoff state) as <id>.json; --prompt prints the successor's prompt.
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { sectionRootOf } from "../src/section-root.mjs";
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
  const dir = one("--out") ?? dataKindDirectory(sectionRootOf(process.env), "state", "agent-handoff");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${record.id.slice("sha256:".length)}.json`);
  // The handoff's canonical content address is an immutable, shared Session
  // continuation reference. Publish a completely written staging inode with
  // an atomic hard link; never truncate an earlier addressed handoff when
  // concurrent wakes independently finish at the same identity.
  const bytes = `${JSON.stringify(record, null, 2)}\n`;
  const staging = path.join(dir, `.${record.id.slice("sha256:".length)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(staging, "wx", 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    try {
      linkSync(staging, file);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    // Existing content-addressed custody is evidence, never a file to
    // overwrite. A damaged or substituted record must remain an obstruction.
    if (readFileSync(file, "utf8") !== bytes)
      throw new TypeError("existing handoff at the same content address has different bytes");
  } finally {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(staging); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (args.includes("--prompt")) console.log(renderHandoffPrompt(record));
  else console.log(JSON.stringify({ id: record.id, file, contextTokens: record.from.contextTokens }));
} catch (error) {
  console.error(`write-agent-handoff: ${error.message}`);
  process.exit(2);
}
