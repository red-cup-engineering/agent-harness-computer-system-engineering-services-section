#!/usr/bin/env node
// PreToolUse: refuses a Workflow call whose transcript carries no user-stated
// multi-agent opt-in. A named workflow existing, or the Skill tool suggesting
// one, is not itself authorization: fanning a task out across agents is the
// user's call to make in their own words.
import { CONTINUE, block } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { transcriptHasUserPattern } from "./session-transcript.mjs";

export const BYPASS_ENV_VAR = "WORKFLOW_OPT_IN_HOOK_BYPASS";
const OPT_IN_PATTERNS = Object.freeze([
  /\bultracode\b/i,
  /\b(use|run)\s+a\s+workflow\b/i,
  /\bfan\s+out\s+agents\b/i,
  /\borchestrate\s+this\s+with\s+subagents\b/i,
  /\bmulti-agent\s+orchestration\b/i,
]);

/**
 * Rules on one PreToolUse event: a Workflow call with no user opt-in in the
 * transcript is blocked.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{environment?: Record<string, string|undefined>, readText?: Function}} [options]
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function checkWorkflowOptIn(event, { environment = process.env, readText } = {}) {
  if (environment[BYPASS_ENV_VAR] === "1") return CONTINUE;
  if (event.tool?.name !== "Workflow") return CONTINUE;
  const transcriptPath = event.session?.transcriptPath;
  if (typeof transcriptPath !== "string" || transcriptPath === "") {
    return block(`no transcript is available to verify the user opted into multi-agent orchestration (bypass with ${BYPASS_ENV_VAR}=1)`);
  }
  if (await transcriptHasUserPattern(transcriptPath, OPT_IN_PATTERNS, readText)) return CONTINUE;
  return block(
    "the transcript shows no user opt-in (the word 'ultracode', a stated ultracode session flag, or an explicit ask for "
    + "multi-agent orchestration/a workflow in the user's own words) — ask the user before calling Workflow; a named workflow "
    + `existing, or the Skill tool suggesting one, is not itself authorization (bypass with ${BYPASS_ENV_VAR}=1)`,
  );
}

if (import.meta.main) {
  const result = await runAgentLifecycleHook({ handler: checkWorkflowOptIn, streams: processStreams() });
  process.exitCode = result.exitCode;
}
