#!/usr/bin/env node
import { readFileSync } from "node:fs";

import { projectAgentOperationTopology } from "../src/agent-operation-topology.mjs";

export { projectAgentOperationTopology };

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(projectAgentOperationTopology(JSON.parse(readFileSync(0, "utf8"))))}\n`);
}
