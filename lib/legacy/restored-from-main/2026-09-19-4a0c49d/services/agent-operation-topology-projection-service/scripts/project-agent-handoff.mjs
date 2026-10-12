#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { projectAgentHandoff } from "../src/agent-handoff.mjs";
export { projectAgentHandoff };
if (import.meta.main) process.stdout.write(`${JSON.stringify(projectAgentHandoff(JSON.parse(readFileSync(0, "utf8"))))}\n`);
