#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { projectAgentCard } from "../src/agent-card.mjs";

export { projectAgentCard };

if (import.meta.main) process.stdout.write(`${JSON.stringify(projectAgentCard(JSON.parse(readFileSync(0, "utf8"))))}\n`);
