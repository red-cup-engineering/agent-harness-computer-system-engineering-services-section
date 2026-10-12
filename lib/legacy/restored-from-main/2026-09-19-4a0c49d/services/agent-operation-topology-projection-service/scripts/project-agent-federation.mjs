#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { projectAgentFederation } from "../src/agent-federation.mjs";
export { projectAgentFederation };
if (import.meta.main) process.stdout.write(`${JSON.stringify(projectAgentFederation(JSON.parse(readFileSync(0, "utf8"))))}\n`);
