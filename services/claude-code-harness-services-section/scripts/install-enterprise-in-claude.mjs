#!/usr/bin/env node
import { installEnterpriseInClaude } from "../src/install-enterprise-in-claude.mjs";

try {
  await installEnterpriseInClaude();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
