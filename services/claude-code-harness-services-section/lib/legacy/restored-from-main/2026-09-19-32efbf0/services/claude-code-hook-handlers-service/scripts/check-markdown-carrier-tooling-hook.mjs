#!/usr/bin/env node
// PreToolUse: refuses a raw Write/Edit/MultiEdit of a Markdown carrier. This
// house owns a real Markdown-engine operator
// (@red-cup-engineering/markdown-engineering-services-section's
// scripts/markdown-services.mjs, with write-markdown-file,
// replace-markdown-section, apply-markdown-edit and
// mutate-markdown-frontmatter among its bins) for exactly this, the same way
// commit-git-paths.mjs is the one lawful route for a commit.
//
// Founder-ruled 2026-09-11 after a session hand-edited Markdown rule carriers
// directly with the Edit tool twice, despite being told to stop after the
// first time: "fix it so future sessions CANNOT NOT use the tool... by the
// methods I keep screaming" -- meaning enforced here, not left to an agent's
// memory of a skill it may or may not reread.
import { CONTINUE, block, filePathOf } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { isMarkdownPath } from "@red-cup-engineering/filepath-services-section";

const QUALIFYING_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
export const BYPASS_ENV_VAR = "MARKDOWN_CARRIER_TOOLING_HOOK_BYPASS";

/**
 * Rules on one PreToolUse event: a Markdown carrier written through the raw
 * file tools is blocked; everything else continues.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{environment?: Record<string, string|undefined>}} [options]
 * @returns {object} an AgentLifecycleResponse, or a Result carrying one.
 */
export function checkMarkdownCarrierTooling(event, { environment = process.env } = {}) {
  if (environment[BYPASS_ENV_VAR] === "1") return CONTINUE;
  if (!QUALIFYING_TOOLS.has(event.tool?.name)) return CONTINUE;
  const filePath = filePathOf(event);
  if (filePath === undefined || !isMarkdownPath(filePath)) return CONTINUE;
  return block(
    `direct ${event.tool.name} of a Markdown carrier ('${filePath}') is refused — this house owns a real `
    + "Markdown-engine operator for this: markdown-engineering-services-section's scripts/markdown-services.mjs "
    + "(bins include write-markdown-file, replace-markdown-section, apply-markdown-edit, mutate-markdown-frontmatter, "
    + "validate-markdown-document). Load the write-markdown skill and use that operator instead of a raw Write/Edit "
    + `(bypass with ${BYPASS_ENV_VAR}=1 only for a case the operator genuinely cannot express)`,
  );
}

if (import.meta.main) {
  const result = await runAgentLifecycleHook({ handler: checkMarkdownCarrierTooling, streams: processStreams() });
  process.exitCode = result.exitCode;
}
