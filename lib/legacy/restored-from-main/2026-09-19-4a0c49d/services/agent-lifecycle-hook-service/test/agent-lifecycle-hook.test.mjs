import assert from "node:assert/strict";
import test from "node:test";
import { CONTINUE, block, commandTextOf, decodeAgentLifecycleEvent, encodeAgentLifecycleResponse, filePathOf, pendingFileText, respond } from "../src/index.mjs";
import { runAgentLifecycleHook } from "../scripts/run-agent-lifecycle-hook.mjs";

const wire = (fields) => ({ session_id: "s1", transcript_path: "/tmp/t.jsonl", cwd: "/repo", ...fields });

test("a PreToolUse wire input from either runtime decodes to one neutral event carrying the tool and the native input", () => {
  for (const runtime of ["codex", "claude"]) {
    const decoded = decodeAgentLifecycleEvent({ runtime, wire: wire({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "u1", tool_input: { command: "git status" } }) });
    assert.equal(decoded.ok, true, JSON.stringify(decoded));
    assert.equal(decoded.value.runtime, runtime);
    assert.equal(decoded.value.tool.name, "Bash");
    assert.equal(commandTextOf(decoded.value), "git status");
    assert.equal(decoded.value.native.tool_use_id, "u1");
  }
});

test("an unknown event, a mismatched wiring, or a non-object input is a typed refusal, never a throw", () => {
  assert.equal(decodeAgentLifecycleEvent({ runtime: "claude", wire: wire({ hook_event_name: "Nope" }) }).refusal.code, "event-unsupported");
  assert.equal(decodeAgentLifecycleEvent({ runtime: "claude", wire: wire({ hook_event_name: "Stop" }), expectedEvent: "PreToolUse" }).refusal.code, "event-mismatch");
  assert.equal(decodeAgentLifecycleEvent({ runtime: "claude", wire: "text" }).refusal.code, "wire-not-admitted");
  assert.equal(decodeAgentLifecycleEvent({ runtime: "gemini", wire: wire({ hook_event_name: "Stop" }) }).refusal.code, "runtime-unsupported");
});

test("responses encode to the shared wire shape: continue is empty JSON, context and permission rulings ride hookSpecificOutput, block is exit 2 with the reason on stderr", () => {
  const event = decodeAgentLifecycleEvent({ runtime: "claude", wire: wire({ hook_event_name: "SessionStart", source: "startup" }) }).value;
  assert.deepEqual(encodeAgentLifecycleResponse({ event, response: CONTINUE }).value, { stdout: "{}\n", stderr: "", exitCode: 0 });
  const context = encodeAgentLifecycleResponse({ event, response: respond({ additionalContext: "Policies binding this worker: none" }).value }).value;
  assert.deepEqual(JSON.parse(context.stdout), { hookSpecificOutput: { additionalContext: "Policies binding this worker: none", hookEventName: "SessionStart" } });
  const toolEvent = decodeAgentLifecycleEvent({ runtime: "codex", wire: wire({ hook_event_name: "PreToolUse", tool_name: "apply_patch", tool_input: "*** Update File: ../x" }) }).value;
  const denied = encodeAgentLifecycleResponse({ event: toolEvent, response: respond({ permission: { decision: "deny", reason: "outside the workspace" } }).value }).value;
  assert.deepEqual(JSON.parse(denied.stdout).hookSpecificOutput, { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "outside the workspace" });
  assert.deepEqual(encodeAgentLifecycleResponse({ event, response: block("no").value }).value, { stdout: "", stderr: "no\n", exitCode: 2 });
});

test("the pending text of a Write, Edit, or MultiEdit is computed from the event and the current text", () => {
  const write = decodeAgentLifecycleEvent({ runtime: "claude", wire: wire({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "/repo/a.mjs", content: "x" } }) }).value;
  assert.equal(filePathOf(write), "/repo/a.mjs");
  assert.equal(pendingFileText({ event: write }), "x");
  const edit = decodeAgentLifecycleEvent({ runtime: "claude", wire: wire({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "/repo/a.mjs", old_string: "b", new_string: "c", replace_all: true } }) }).value;
  assert.equal(pendingFileText({ event: edit, currentText: "abab" }), "acac");
  const multi = decodeAgentLifecycleEvent({ runtime: "claude", wire: wire({ hook_event_name: "PreToolUse", tool_name: "MultiEdit", tool_input: { file_path: "/repo/a.mjs", edits: [{ old_string: "a", new_string: "1" }, { old_string: "b", new_string: "2" }] } }) }).value;
  assert.equal(pendingFileText({ event: multi, currentText: "ab" }), "12");
  assert.equal(pendingFileText({ event: edit }), undefined);
});

function streams(text, args = []) {
  const out = [];
  const err = [];
  return {
    streams: { arguments: args, standardInput: (async function* () { yield text; })(), standardOutput: { write: (chunk) => (out.push(chunk), true) }, standardError: { write: (chunk) => (err.push(chunk), true) }, environment: {} },
    out: () => out.join(""),
    err: () => err.join(""),
  };
}

test("the adapter runs a pure handler end to end and turns a handler failure into a block, never a crash", async () => {
  const good = streams(JSON.stringify(wire({ hook_event_name: "UserPromptSubmit", prompt: "hi" })), ["--runtime", "codex", "--expected-event", "UserPromptSubmit"]);
  const run = await runAgentLifecycleHook({ handler: (event) => respond({ additionalContext: `prompt seen: ${event.prompt}` }), streams: good.streams });
  assert.equal(run.exitCode, 0);
  assert.deepEqual(JSON.parse(good.out()), { hookSpecificOutput: { additionalContext: "prompt seen: hi", hookEventName: "UserPromptSubmit" } });
  const wrongEvent = streams(JSON.stringify(wire({ hook_event_name: "Stop" })), ["--expected-event", "PreToolUse"]);
  assert.equal((await runAgentLifecycleHook({ handler: () => CONTINUE, streams: wrongEvent.streams })).exitCode, 2);
  assert.match(wrongEvent.err(), /event-mismatch/u);
  const failing = streams(JSON.stringify(wire({ hook_event_name: "Stop" })));
  const failed = await runAgentLifecycleHook({ handler: () => { throw new Error("boom"); }, streams: failing.streams });
  assert.equal(failed.exitCode, 2);
  assert.match(failing.err(), /handler-failed: boom/u);
  const silent = streams(JSON.stringify(wire({ hook_event_name: "Stop" })));
  assert.equal((await runAgentLifecycleHook({ handler: () => undefined, streams: silent.streams })).exitCode, 0);
  assert.equal(silent.out(), "{}\n");
});
