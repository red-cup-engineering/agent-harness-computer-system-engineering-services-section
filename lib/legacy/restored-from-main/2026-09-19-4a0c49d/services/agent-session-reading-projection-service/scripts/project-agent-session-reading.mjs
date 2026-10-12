#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { projectAgentSessionReading } from "../src/session-reading.mjs";
export { projectAgentSessionReading };
if (import.meta.main) { const input = JSON.parse(readFileSync(0, "utf8")); process.stdout.write(`${JSON.stringify(projectAgentSessionReading(input.sources, input.params, input.options))}\n`); }
