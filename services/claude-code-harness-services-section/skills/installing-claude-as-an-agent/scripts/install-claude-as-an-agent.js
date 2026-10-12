#!/usr/bin/env node
/**
 * @skill installing-claude-as-an-agent
 * @verb-phrase installing claude as an agent
 * @closure-kind process
 * @description Thin re-export of the published owner @red-cup-engineering/claude-harness-projection-service's install-claude-as-an-agent: installClaudeAsAnAgent and the identical CLI (<office> <node> [--dry-run|--list|--clean|--reinstall|--check]). Kept as a same-directory file so this path still works — the installer itself lives once, at the owning package, never copied.
 *
 * @postcondition every export and the CLI behavior are exactly the owning package's — this file adds no logic of its own
 */
export * from "@red-cup-engineering/agent-harness-computer-system-engineering-services-section/claude-code/install-claude-as-an-agent";
import { installClaudeAsAnAgent } from "@red-cup-engineering/agent-harness-computer-system-engineering-services-section/claude-code/install-claude-as-an-agent";

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await installClaudeAsAnAgent();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
