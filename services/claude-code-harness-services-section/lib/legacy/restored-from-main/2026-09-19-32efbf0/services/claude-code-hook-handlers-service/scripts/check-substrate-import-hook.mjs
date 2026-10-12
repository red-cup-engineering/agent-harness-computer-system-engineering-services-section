#!/usr/bin/env node
// PreToolUse: refuses a Write or Edit whose resulting text newly hand-imports
// a substrate module (a Node built-in or third-party package) that a house
// service already owns, or should own. The pending text is computed by the
// lifecycle-hook platform from the event and the file's current text; the
// finding itself is the audit service's.
import { CONTINUE, block, filePathOf, pendingFileText } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { newlyIntroducedNodeBuiltinImportFindings } from "@red-cup-engineering/audit-node-builtin-imports-service";
import { hasExtension } from "@red-cup-engineering/filepath-services-section";
import { readFileText } from "@red-cup-engineering/file-services/read-file";

const QUALIFYING_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const CHECKED_EXTENSIONS = Object.freeze([".mjs", ".mts", ".js", ".ts"]);
export const BYPASS_ENV_VAR = "SUBSTRATE_IMPORT_HOOK_BYPASS";

function findingReason(finding) {
  if (finding.needsUpstreamWrapper) {
    return `imports \`${finding.builtin}\` at line ${finding.line}, which has no house wrapper yet — the task is building that wrapper upstream (computer-code/data/networking), not hand-wiring the substrate here`;
  }
  return `imports \`${finding.builtin}\` at line ${finding.line}, which \`${finding.houseService}\` already owns — use that instead of the substrate directly`;
}

/**
 * Rules on one PreToolUse event: a JavaScript carrier whose pending text
 * newly reaches for a substrate a house service owns is blocked.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{environment?: Record<string, string|undefined>, readText?: typeof readFileText}} [options]
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function checkSubstrateImport(event, { environment = process.env, readText = readFileText } = {}) {
  if (environment[BYPASS_ENV_VAR] === "1") return CONTINUE;
  if (!QUALIFYING_TOOLS.has(event.tool?.name)) return CONTINUE;
  const filePath = filePathOf(event);
  if (filePath === undefined || !hasExtension(filePath, CHECKED_EXTENSIONS)) return CONTINUE;
  let currentText;
  try {
    currentText = await readText(filePath);
  } catch {
    // A file that is not there yet is a brand-new carrier: there is no
    // before-text to compare against, and every import in it is new.
    currentText = undefined;
  }
  const text = pendingFileText({ event, currentText });
  if (typeof text !== "string") return CONTINUE;
  const findings = newlyIntroducedNodeBuiltinImportFindings({
    path: filePath,
    text,
    beforeText: currentText,
    packageName: event.tool.input?.packageName,
  });
  if (findings.length === 0) return CONTINUE;
  return block(`${filePath}: ${findings.map(findingReason).join("; ")} (bypass with ${BYPASS_ENV_VAR}=1)`);
}

if (import.meta.main) {
  const result = await runAgentLifecycleHook({ handler: checkSubstrateImport, streams: processStreams() });
  process.exitCode = result.exitCode;
}
