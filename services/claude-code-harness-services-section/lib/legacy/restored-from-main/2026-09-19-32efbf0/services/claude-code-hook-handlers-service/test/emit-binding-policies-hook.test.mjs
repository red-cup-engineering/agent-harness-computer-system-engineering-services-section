import test from "node:test";
import assert from "node:assert/strict";
import { HEADER, emitBindingPolicies, engineEnvironment, readBindingPolicies, renderBindingPolicies } from "../scripts/emit-binding-policies-hook.mjs";
import { commandReceipt, lifecycleEvent, responseOf } from "./lifecycle-event.mjs";

test("the context block is the header then one line per policy, in the engine's own order", () => {
  assert.equal(
    renderBindingPolicies([{ id: "policy:one", name: "First", description: "Must retain the evidence record." }, { id: "policy:two", name: "Second" }]),
    `${HEADER}\n- policy:one: First — Must retain the evidence record.\n- policy:two: Second`,
  );
  assert.equal(renderBindingPolicies([]), "");
  assert.equal(renderBindingPolicies(null), "");
  assert.equal(renderBindingPolicies([{ name: "no id" }]), "");
  assert.equal(renderBindingPolicies([{ id: "policy:bare" }]), `${HEADER}\n- policy:bare: `);
});

test("the engine reads full native policy envelopes in one list command from the repository root", () => {
  const requests = [];
  const policy = { id: "policy:x", kind: "policy", name: "X", description: "Must retain evidence.", body: { tag: "record", fields: {} }, provenance: [], relations: [] };
  const entities = readBindingPolicies({
    root: "/repo",
    environment: { PATH: "/usr/bin" },
    execute: (request) => {
      requests.push(request);
      return commandReceipt({ stdout: JSON.stringify([policy]) });
    },
  });
  assert.deepEqual(entities, [policy]);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.type, "JavascriptNodeCommandExecutionRequest");
  assert.equal(request.command, process.execPath);
  assert.equal(request.directory, "/repo");
  assert.deepEqual(request.arguments, ["/repo/dev/apps/simple-planning-engine.mjs", "call", "list_entities", JSON.stringify({ kind: "policy" })]);
  assert.deepEqual(request.environment, { PATH: "/usr/bin", PLANNING_ENGINE_DATA: "/repo/dev/data/logs/simple-planning-engine-log.jsonl" });
  assert.equal(request.input, null);
});

test("the engine entrypoint, its log, and the listed kind are parameters", () => {
  const requests = [];
  readBindingPolicies({
    root: "/repo",
    engine: "other/engine.mjs",
    engineData: "other/log.jsonl",
    kind: "directive",
    environment: {},
    execute: (request) => {
      requests.push(request);
      return commandReceipt({ stdout: "[]" });
    },
  });
  assert.equal(requests[0].arguments[0], "/repo/other/engine.mjs");
  assert.equal(requests[0].arguments[3], JSON.stringify({ kind: "directive" }));
  assert.equal(requests[0].environment.PLANNING_ENGINE_DATA, "/repo/other/log.jsonl");
});

test("only string environment values are passed, and the engine's log always overrides", () => {
  assert.deepEqual(
    engineEnvironment("/repo/log.jsonl", { PATH: "/usr/bin", MISSING: undefined, PLANNING_ENGINE_DATA: "/stale" }),
    { PATH: "/usr/bin", PLANNING_ENGINE_DATA: "/repo/log.jsonl" },
  );
});

test("an engine that refuses, crashes, or answers with non-JSON yields no policies and never throws", () => {
  for (const result of [{ status: 1, stderr: "refused" }, { status: null, error: "spawn failed" }, { status: 0, stdout: "not json" }, { status: 0, stdout: "{}" }]) {
    assert.deepEqual(readBindingPolicies({ root: "/repo", environment: {}, execute: () => commandReceipt(result) }), []);
  }
});

test("the SessionStart reaction carries the block as additionalContext and adds nothing when nothing binds", () => {
  const event = lifecycleEvent({ event: "SessionStart", source: "startup" });
  const response = responseOf(emitBindingPolicies(event, { environment: {}, root: "/repo", read: () => [{ id: "policy:one", name: "First" }] }));
  assert.equal(response.disposition, "continue");
  assert.equal(response.additionalContext, `${HEADER}\n- policy:one: First`);
  assert.equal(responseOf(emitBindingPolicies(event, { environment: {}, root: "/repo", read: () => [] })).additionalContext, undefined);
});

test("a reading that throws, and an event naming no root, both continue with nothing added", () => {
  const event = lifecycleEvent({ event: "SessionStart" });
  assert.equal(responseOf(emitBindingPolicies(event, { environment: {}, root: "/repo", read: () => { throw new Error("engine is gone"); } })).additionalContext, undefined);
  const priorProjectDirectory = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  try {
    const rootless = lifecycleEvent({ event: "SessionStart", cwd: null });
    assert.equal(responseOf(emitBindingPolicies(rootless, { environment: {}, read: () => [{ id: "policy:one", name: "First" }] })).additionalContext, undefined);
  } finally {
    if (priorProjectDirectory !== undefined) process.env.CLAUDE_PROJECT_DIR = priorProjectDirectory;
  }
});

test("the read's root is the hook's own, and its remaining parameters pass through", () => {
  const seen = [];
  emitBindingPolicies(lifecycleEvent({ event: "SessionStart", cwd: "/from-event" }), {
    environment: {},
    root: "/explicit",
    kind: "directive",
    read: (options) => {
      seen.push(options);
      return [];
    },
  });
  assert.deepEqual(seen, [{ root: "/explicit", kind: "directive" }]);
});
