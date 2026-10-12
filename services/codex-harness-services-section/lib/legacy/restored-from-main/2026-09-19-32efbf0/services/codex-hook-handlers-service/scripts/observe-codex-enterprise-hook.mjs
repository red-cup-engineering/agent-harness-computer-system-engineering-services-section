#!/usr/bin/env node
// The Codex runtime's lifecycle hook face for one machine's Codex customer
// enterprise. The agent-harness projection invokes it as exactly:
//
//   node <this script> --expected-event <Event>
//
// so nothing else may be required on the command line. The runtime is fixed to
// codex here, because these handlers serve no other runtime. The machine's
// configuration record comes from CODEX_ENTERPRISE_CONFIGURATION in the
// environment the projection declares; --configuration <path> is an optional
// override for an operator running the handler by hand.
//
// Reading the wire input, enforcing the wired event, encoding the decision, and
// the exit code all belong to the agent-lifecycle-hook adapter. Reading the
// machine's delegation policy belongs to the file effect owner, here, so the
// handler itself stays pure algebra over the typed event.
import { block } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { adoptConfigurationArgument, codexEnterpriseConfiguration } from "@red-cup-engineering/codex-agent-enterprise-service/configuration";

export const RUNTIME = "codex";

adoptConfigurationArgument(process.argv.slice(2));

// The enterprise modules read their configuration at import time, so they are
// imported only once the configuration record has been settled. An unusable or
// absent configuration must still reach the runtime as one decision with its
// reason, never as a crashed hook process.
let enterprise, unusable;
try {
  const configuration = codexEnterpriseConfiguration();
  enterprise = await import("../src/enterprise-hook.mjs");
  const policy = confinePath({ root: configuration.agentsRoot, path: configuration.harnessPolicy }).path;
  enterprise.adoptLaunchPolicy(JSON.parse(await readFileText(policy)).delegationPolicy);
} catch (error) {
  unusable = error instanceof Error ? error.message : String(error);
}

export const HOOK_ADDITIONAL_CONTEXT_LIMIT = enterprise?.HOOK_ADDITIONAL_CONTEXT_LIMIT;

/** The handler, bound to whatever observation options a caller supplies. */
export function handlerWith(options = {}) {
  if (unusable !== undefined) return () => block(`Codex enterprise hook is not configured: ${unusable}`);
  return (event) => enterprise.observeCodexEnterpriseLifecycle(event, options);
}

export const handler = handlerWith();

/** The process streams with this handler's runtime fixed, whatever the environment says. */
export function codexStreams(streams = processStreams()) {
  return Object.freeze({ ...streams, environment: { ...streams.environment, AGENT_HARNESS_RUNTIME: RUNTIME } });
}

if (import.meta.main) {
  const { exitCode } = await runAgentLifecycleHook({ handler, streams: codexStreams() });
  process.exitCode = exitCode;
}
