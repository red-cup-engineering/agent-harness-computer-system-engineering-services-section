#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cliArgument, readBoundedHookInput } from "./lib/claude-hook-input.mjs";
import { assertActorAddress } from "@red-cup-engineering/claude-harness-projection-service";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_POLICY = join(PACKAGE_ROOT, "content/harness/claude-agent-harness.json");
const EVENT = "UserPromptSubmit";
const MAX_BYTES = 512;

function loadReminder(policyPath) {
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  if (policy.type !== "ClaudeAgentHarnessProjection") {
    throw new Error("short reminder must come from the Bare Cedar Fog Claude harness policy");
  }
  assertActorAddress(policy.actor, policyPath);
  if (typeof policy.shortReminder !== "string" || policy.shortReminder.trim() === "") throw new Error("Claude harness policy names no shortReminder");
  if (Buffer.byteLength(policy.shortReminder, "utf8") > MAX_BYTES) throw new Error(`Claude shortReminder exceeds ${MAX_BYTES} UTF-8 bytes`);
  return policy.shortReminder;
}

export function emitShortReminder({ input, expectedEvent = EVENT, policyPath = DEFAULT_POLICY }) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Claude hook input must be a JSON object");
  if (expectedEvent !== EVENT || input.hook_event_name !== EVENT) {
    throw new Error(`short reminder is admitted only for ${EVENT}`);
  }
  return Object.freeze({
    hookSpecificOutput: {
      hookEventName: EVENT,
      additionalContext: loadReminder(policyPath),
    },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const output = emitShortReminder({ input: await readBoundedHookInput(process.stdin), expectedEvent: cliArgument("--expected-event") });
    process.stdout.write(JSON.stringify(output));
  } catch (error) {
    process.stderr.write(`emit-claude-short-reminder: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
