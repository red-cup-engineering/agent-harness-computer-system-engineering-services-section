import assert from "node:assert/strict";
import test from "node:test";
import { requireParticipationHook, requireSuccessfulHookArrival } from "../src/hooks/service.mjs";

const sourceSession = "actual-harness-session-from-transport";
const event = (name = "SessionStart", sessionId = sourceSession) => ({
  harness: "mcp",
  payload: { hook_event_name: name, ...(sessionId === null ? {} : { session_id: sessionId }) },
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
    for (const missing of [null, "", "   "]) {
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


test("canonical source session is preserved across codec's admitted alternate field names", () => {
  for (const [field, value, canonical] of [
    ["session_id", sourceSession, sourceSession],
    ["sessionId", sourceSession, sourceSession],
    ["session", sourceSession, sourceSession],
    ["session_id", "  " + sourceSession + "  ", sourceSession],
  ]) {
    const payload = { hook_event_name: "SessionStart", [field]: value };
    const admitted = requireParticipationHook({ harness: "mcp", payload });
    assert.equal(admitted.sessionId, canonical, "source-qualified caller session is one canonical value");
    assert.deepEqual(admitted.payload, payload, "do not rewrite original event testimony");
    assert.equal(Object.hasOwn(admitted, "actor"), false, "session normalization never grants an Actor");
  }
});


test("the original arrival writer must return an admitted addressed receipt before participation", () => {
  const admitted = Object.freeze({
    kind: "system.arrival.receipt", ok: true,
    obstructions: [], admission: { type: "arrival", thread: "2026-10-31", address: "ni:///sha-256;aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  assert.equal(requireSuccessfulHookArrival(admitted), admitted);
  for (const refused of [
    undefined,
    null,
    { kind: "metroplat.hook.admission-report", ok: false, errors: ["missing hook event"] },
    { ...admitted, ok: false, obstructions: ["invalid packet"] },
    { ...admitted, ok: true, obstructions: ["contradictory packet"] },
    { ...admitted, obstructions: undefined },
    { ...admitted, admission: undefined },
    { ...admitted, admission: { address: "" } },
    { ...admitted, admission: { address: "   " } },
  ]) {
    assert.throws(() => requireSuccessfulHookArrival(refused),
      /original arrival was not admitted before participation/);
  }
});
