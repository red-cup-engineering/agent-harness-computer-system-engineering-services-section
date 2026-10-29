import assert from "node:assert/strict";
import test from "node:test";
import { requireParticipationHook } from "../src/hooks/service.mjs";

const sourceSession = "actual-harness-session-from-transport";
const event = (name = "SessionStart", sessionId = sourceSession) => ({
  harness: "mcp",
  payload: { hook_event_name: name, ...(sessionId === undefined ? {} : { session_id: sessionId }) },
});

test("native participation preflight requires an admitted source event, not an arbitrary payload", () => {
  for (const bad of [
    { harness: "mcp", payload: { session_id: sourceSession } },
    { harness: "mcp", payload: {} },
  ]) {
    assert.throws(() => requireParticipationHook(bad),
      /hook envelope refused before participation/u);
  }
});

test("SessionStart, SessionEnd and ordinary MCP hooks cannot invent a missing session", () => {
  for (const name of ["SessionStart", "SessionEnd", "UserPromptSubmit"]) {
    for (const missing of [undefined, "", "   "]) {
      assert.throws(() => requireParticipationHook(event(name, missing)),
        /original source session id required before participation/u);
    }
  }
  // The same preflight applies to other participating harnesses, not just MCP.
  assert.throws(() => requireParticipationHook({
    harness: "claude", payload: { hook_event_name: "SessionStart" },
  }), /original source session id required before participation/u);
});

test("oversize session claims refuse before they reach host recognition or Body effects", () => {
  assert.throws(() => requireParticipationHook(event("SessionStart", "a".repeat(513))),
    /exceeds 512 bytes/u);
  assert.throws(() => requireParticipationHook(event("SessionStart", "🦉".repeat(129))),
    /exceeds 512 bytes/u);
});

test("source-qualified shape preserves original event and session for the host's own authority decision", () => {
  const input = event();
  const admitted = requireParticipationHook(input);
  assert.equal(admitted.kind, "metroplat.hook.envelope");
  assert.equal(admitted.harness, "mcp");
  assert.equal(admitted.hookEventName, "SessionStart");
  assert.equal(admitted.sessionId, sourceSession);
  assert.deepEqual(admitted.payload, input.payload);
  assert.equal(Object.hasOwn(admitted, "actor"), false, "the payload shape does not confer a civic or Actor right");
  assert.equal(Object.hasOwn(admitted, "office"), false, "host recognition remains mandatory");
  const end = requireParticipationHook(event("SessionEnd"));
  assert.equal(end.sessionId, admitted.sessionId);
});

test("non-MCP real-session hook remains admissible without inventing a session or caller", () => {
  const result = requireParticipationHook({
    harness: "codex", payload: { hook_event_name: "Stop", session_id: "codex-original-session" },
  });
  assert.equal(result.harness, "codex");
  assert.equal(result.sessionId, "codex-original-session");
  assert.equal(result.hookEventName, "Stop");
});
