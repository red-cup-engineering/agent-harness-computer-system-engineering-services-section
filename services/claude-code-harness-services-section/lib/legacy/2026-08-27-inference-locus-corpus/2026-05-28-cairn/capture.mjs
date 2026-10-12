#!/usr/bin/env node
// capture.mjs -- the body's capture entrypoint. Takes a hook / tool-call / completion payload and runs
// the IO-ARTICULATION rule (capturing), appending the captured claim into the capture stream. A real
// .claude/settings.json hook calls this on every tool use; here it accepts argv/stdin JSON. (Host hook
// wiring = Phase 4.) This is how ALL my activity gets captured and fed to the swarm.

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import capturing from "#script/capturing";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CAPTURE_LOG = "articulating/library/aperiodic-articulation-category/hacking/library/claude-code/capturing/capturing.jsonl";

export function capture(handlerClass, payload, opts = {}) {
  const out = capturing(handlerClass, payload, opts);
  for (const row of out.claims) appendFileSync(join(ROOT, CAPTURE_LOG), JSON.stringify(row) + "\n");
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const handlerClass = process.argv[2] || "tool-call-envelope";
  const raw = process.argv.slice(3).join(" ");
  let payload;
  try { payload = raw ? JSON.parse(raw) : { tool: "Read", input: { path: "x" } }; }
  catch { payload = { tool: raw }; }
  console.log(JSON.stringify(capture(handlerClass, payload), null, 2));
}
