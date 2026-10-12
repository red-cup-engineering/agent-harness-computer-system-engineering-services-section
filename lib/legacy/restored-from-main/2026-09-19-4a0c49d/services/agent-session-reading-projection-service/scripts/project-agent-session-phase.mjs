#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { projectAgentSessionPhase } from "../src/session-phase.mjs";
export { projectAgentSessionPhase };
if (import.meta.main) { const input=JSON.parse(readFileSync(0,"utf8")); process.stdout.write(`${JSON.stringify(projectAgentSessionPhase(input.sources,input.params,input.options))}\n`); }
