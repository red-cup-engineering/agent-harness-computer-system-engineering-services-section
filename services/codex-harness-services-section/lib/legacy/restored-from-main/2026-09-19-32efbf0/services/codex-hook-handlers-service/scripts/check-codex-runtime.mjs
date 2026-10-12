#!/usr/bin/env node
// The Codex runtime's session-start preflight for one machine. The
// agent-harness projection invokes it as exactly:
//
//   node <this script> --expected-event SessionStart
//
// The runtime is fixed to codex here; the machine's configuration record comes
// from CODEX_ENTERPRISE_CONFIGURATION in the environment the projection
// declares, with --configuration <path> as an optional operator override.
//
// It blocks the session when the installed runtime is not current — a missing
// runtime file, an absolute path the runtime names that no longer resolves, a
// global/project skill-name collision, a runtime thread index that disagrees
// with its own transcript tree, or an invalid harness parity baseline — and
// otherwise lets the session continue with one system message naming what it
// observed.
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { CONTINUE, block, respond } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { adoptConfigurationArgument } from "@red-cup-engineering/codex-agent-enterprise-service/configuration";

export const RUNTIME = "codex";

adoptConfigurationArgument(process.argv.slice(2));
// An unusable or absent configuration must still reach the runtime as one
// decision with its reason, never as a crashed hook process.
let preflightModule, unusable;
try {
  preflightModule = await import("./runtime-preflight.mjs");
} catch (error) {
  unusable = error instanceof Error ? error.message : String(error);
}

export async function handler(event) {
  if (unusable !== undefined) return block(`Codex runtime preflight is not configured: ${unusable}`);
  let preflight;
  try {
    preflight = await preflightModule.checkCodexRuntime();
  } catch (error) {
    return block(`Codex runtime preflight refused this session: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (event?.event !== "SessionStart") return CONTINUE;
  return respond({ systemMessage: `Codex runtime preflight: ${preflight.disposition}; ${preflight.stateStore.indexedThreads} indexed threads, harness parity ${preflight.harnessParity.disposition}.` });
}

if (import.meta.main) {
  const streams = processStreams();
  const { exitCode } = await runAgentLifecycleHook({ handler, streams: { ...streams, environment: { ...streams.environment, AGENT_HARNESS_RUNTIME: RUNTIME } } });
  process.exitCode = exitCode;
}
