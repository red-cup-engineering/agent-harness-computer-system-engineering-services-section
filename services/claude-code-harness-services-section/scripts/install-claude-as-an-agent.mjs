#!/usr/bin/env node
import { installClaudeAsAnAgent } from "../src/install-claude-as-an-agent.mjs";

try {
  await installClaudeAsAnAgent();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
