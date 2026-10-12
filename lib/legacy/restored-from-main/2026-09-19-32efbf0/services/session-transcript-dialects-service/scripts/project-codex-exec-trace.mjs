#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { projectCodexExecTrace } from "../src/codex-exec-trace.mjs";

export { projectCodexExecTrace };

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  process.stdout.write(`${JSON.stringify(projectCodexExecTrace(input.jsonl, input))}\n`);
}
