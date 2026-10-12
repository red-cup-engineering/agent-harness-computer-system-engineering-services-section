#!/usr/bin/env node
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import { decodeAgentLifecycleEvent } from "../src/event.mjs";
import { encodeAgentLifecycleResponse } from "../src/response.mjs";
import { CONTINUE, accept, refuse } from "../src/types.mjs";

const INPUT_LIMIT = 1024 * 1024;

/**
 * The one adapter a hook handler script runs under: read the runtime's wire
 * input from standard input (bounded), decode it into an AgentLifecycleEvent,
 * invoke the handler (a function from the event to a Result of
 * AgentLifecycleResponse), encode the response for that runtime, write it, and
 * return the exit code. A handler's own failure never reaches the runtime as
 * an exception: it becomes a block with the failure as its reason, so the
 * runtime sees a decision and the failure text, never a crash.
 *
 * Runtime is taken from --runtime, else from AGENT_HARNESS_RUNTIME in the
 * environment, else "claude". The wired event is taken from --expected-event
 * and enforced against the delivered event.
 * @param {{ handler: (event: object) => object | Promise<object>, streams: { arguments: readonly string[], standardInput: AsyncIterable<string|Uint8Array>, standardOutput: { write(text: string): unknown }, standardError: { write(text: string): unknown }, environment?: Record<string, string> } }} request
 * @returns {Promise<{ exitCode: 0 | 2, event?: object, response?: object, refusal?: object }>}
 */
export async function runAgentLifecycleHook({ handler, streams }) {
  const runtime = argument("--runtime", streams.arguments) ?? streams.environment?.AGENT_HARNESS_RUNTIME ?? "claude";
  const expectedEvent = argument("--expected-event", streams.arguments);
  const read = await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: streams.standardInput });
  if (read.text.length > INPUT_LIMIT) return finish(streams, refuse("wire-not-admitted", `hook input exceeds ${INPUT_LIMIT} bytes`));
  let wire;
  try {
    wire = JSON.parse(read.text);
  } catch (error) {
    return finish(streams, refuse("wire-not-admitted", `hook input is not JSON: ${error.message}`));
  }
  const decoded = decodeAgentLifecycleEvent({ runtime, wire, expectedEvent });
  if (!decoded.ok) return finish(streams, decoded);
  let result;
  try {
    result = await handler(decoded.value);
  } catch (error) {
    result = refuse("handler-failed", error instanceof Error ? error.message : String(error));
  }
  if (result === undefined) result = accept(CONTINUE);
  else if (result !== null && typeof result === "object" && result.kind === "agent-lifecycle-response") result = accept(result);
  if (!result.ok) return finish(streams, result, decoded.value);
  const encoded = encodeAgentLifecycleResponse({ event: decoded.value, response: result.value });
  if (!encoded.ok) return finish(streams, encoded, decoded.value);
  if (encoded.value.stdout.length > 0) await writeJavascriptNodeStandardOutputText({ type: "JavascriptNodeStandardOutputTextWriteRequest", version: 1, text: encoded.value.stdout }, { standardOutput: streams.standardOutput });
  if (encoded.value.stderr.length > 0) streams.standardError.write(encoded.value.stderr);
  return Object.freeze({ exitCode: encoded.value.exitCode, event: decoded.value, response: result.value });
}

async function finish(streams, refused, event) {
  streams.standardError.write(`${refused.refusal.code}: ${refused.refusal.message}\n`);
  return Object.freeze({ exitCode: 2, event, refusal: refused.refusal });
}

/** The streams of the running process, for a handler script's main guard. */
export function processStreams() {
  return Object.freeze({ arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout, standardError: process.stderr, environment: process.env });
}

if (import.meta.main) {
  process.stderr.write("run-agent-lifecycle-hook is a library adapter: a handler script imports runAgentLifecycleHook and passes its handler.\n");
  process.exitCode = 2;
}
