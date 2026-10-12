#!/usr/bin/env node
import { installEnterpriseInClaude } from "@red-cup-engineering/agent-harness-computer-system-engineering-services-section/claude-code/install-enterprise-in-claude";

try {
  await installEnterpriseInClaude();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
