import assert from "node:assert/strict";
import test from "node:test";
import { main, parseArguments } from "../scripts/project-enterprise-position.mjs";

const argv = [
  "--observed-at", "2026-08-29T00:00:00Z",
  "--output", "/tmp/codex-enterprise-position.json",
];

test("parses an explicit observation time and create-only output", () => {
  assert.deepEqual(parseArguments(argv), {
    observedAt: "2026-08-29T00:00:00Z",
    output: "/tmp/codex-enterprise-position.json",
  });
  assert.throws(() => parseArguments([...argv, "--output", "duplicate"]), /duplicate/);
  assert.throws(() => parseArguments(["--unknown", "value"]), /unknown/);
});

test("projects the Actor position without expanding its authority", async () => {
  const actorPosition = { type: "CodexEnterprisePosition", actor: "urn:ame:fixture" };
  let observedWrite;
  const result = await main(argv, {
    project: () => actorPosition,
    write: async (...args) => { observedWrite = args; },
  });
  assert.deepEqual(result.position, { ...actorPosition, observedAt: "2026-08-29T00:00:00Z" });
  assert.equal(observedWrite[0], "/tmp/codex-enterprise-position.json");
  assert.deepEqual(observedWrite[2], { flag: "wx", mode: 0o600 });
  assert.deepEqual(JSON.parse(observedWrite[1]), result.position);
});
