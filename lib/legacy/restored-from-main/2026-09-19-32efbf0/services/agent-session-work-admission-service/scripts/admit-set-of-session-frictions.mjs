#!/usr/bin/env node
// Stop-hook entry: derive this turn's frictions from the session transcript
// (cursor-bounded) and admit them as ready duties on the work rail.
// Composes the derive and admit functions; never re-implements either.
// Silent when nothing new. The cursor file and the harness policy naming
// the allocating office and actor are parameters the calling machine's own
// hook policy supplies.
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { isMain } from "@red-cup-engineering/javascript-file-main-guard-service";
import { resolveWorkRail } from "@red-cup-engineering/agent-work-computer-system-engineering-services-section/work-rail";
import { admitFrictionWorkIntents } from "./admit-set-of-friction-work-intents.mjs";
import { deriveTranscriptFrictions } from "./derive-set-of-session-frictions.mjs";
import { readAllocationIdentity } from "./read-allocation-identity.mjs";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";


/**
 * One bounded JSON document read from standard input, through the house's own
 * standard-input reader.
 * @param {number} [limit] - refuse an input larger than this many characters.
 * @returns {Promise<unknown>}
 */
async function readStandardInputJson(limit = 1024 * 1024) {
  const read = await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: process.stdin });
  if (read.text.length > limit) throw new Error(`standard input exceeds ${limit} characters`);
  return JSON.parse(read.text);
}

if (isMain(import.meta.url)) {
  let work = null;
  try {
    const input = await readStandardInputJson();
    const expected = argument("--expected-event");
    if (expected && input.hook_event_name !== expected) throw new Error(`hook event '${input.hook_event_name}' does not match projected event '${expected}'`);
    if (typeof input.transcript_path !== "string" || input.transcript_path === "") throw new Error("hook input names no transcript_path");
    const cursorPath = argument("--cursor");
    const policyPath = argument("--policy");
    if (cursorPath === undefined) throw new Error("--cursor <path> is required (the machine's own friction cursor file)");
    if (policyPath === undefined) throw new Error("--policy <path> is required (the harness policy naming the allocating office and actor)");
    const readout = await deriveTranscriptFrictions({ transcript: input.transcript_path, cursorPath: resolveFilepath([cursorPath]), sessionId: input.session_id });
    if (readout.frictions.length === 0) process.exit(0);
    const { actor, office } = await readAllocationIdentity(policyPath);
    work = resolveWorkRail({ dataRoot: argument("--data-root") });
    const summary = await admitFrictionWorkIntents({ readout, work, actor, office });
    process.stdout.write(`frictions: ${summary.admitted} admitted as duties on the ${work.kind} rail (${summary.intentId})\n`);
  } catch (error) {
    process.stderr.write(`admit-set-of-session-frictions: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  } finally {
    await work?.close();
  }
}
