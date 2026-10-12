import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BOUNDED_DISCOVERY_EXECUTABLE, boundedDiscoveryRewrite, declaredToolBudget, readToolEvidence } from "../src/tool-evidence.mjs";

const ACTOR = "urn:ame:bounded-discovery-test-caller";
const state = () => ({ stateRoot: mkdtempSync(join(tmpdir(), "bounded-discovery-")) });

test("the package names its own bounded-discovery executable", () => {
  assert.ok(BOUNDED_DISCOVERY_EXECUTABLE.endsWith("/scripts/execute-bounded-discovery.mjs"));
  assert.equal(existsSync(BOUNDED_DISCOVERY_EXECUTABLE), true);
});

test("a rewrite carries the caller's evidence boundary into the fresh runner process", () => {
  const input = { tool_name: "Bash", tool_input: { command: "rg pattern .", workdir: process.cwd(), max_output_tokens: 4000 }, cwd: process.cwd(), model: "gpt-5.6-sol" };
  const options = { ...state(), actor: ACTOR, discoveryScriptPath: BOUNDED_DISCOVERY_EXECUTABLE };
  const rewrite = boundedDiscoveryRewrite(input, { ...options, budget: declaredToolBudget(input) });
  const request = JSON.parse(Buffer.from(rewrite.updatedInput.command.split(" ").at(-1), "base64url"));
  assert.equal(request.actor, ACTOR);
  assert.equal(request.stateRoot, options.stateRoot);
});

test("the executable boundary pages a large stream into a receipt without losing its carrier", () => {
  const options = state();
  const request = Buffer.from(JSON.stringify({
    command: "for i in $(seq 1 5000); do printf ' M lib/submodule-%05d/src/file.mjs\\n' \"$i\"; done",
    cwd: process.cwd(), model: "gpt-5.6-sol", provider: "openai", actor: ACTOR, stateRoot: options.stateRoot,
    budget: { ...declaredToolBudget({ tool_name: "Bash", tool_input: { command: "git status" } }), maximumPremiumContextBytes: 12_288 },
  })).toString("base64url");
  const run = spawnSync(process.execPath, [BOUNDED_DISCOVERY_EXECUTABLE, "--request", request], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, / M lib\/submodule-00001\/src\/file\.mjs/u);
  assert.match(run.stdout, /bounded discovery receipt ni:\/\/\/sha-256;/u);
  const receipt = run.stdout.match(/ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}/u)[0];
  const page = readToolEvidence({ receipt, stream: "stdout", maximumBytes: 1024 }, options);
  assert.equal(page.returnedBytes, 1024);
  assert.equal(page.stream, "stdout");
  assert.equal(page.availableCarriers.length, 2);
  assert.ok(page.totalBytes > 176_000);
  assert.equal(existsSync(page.carrier), true);
  const repeated = spawnSync(process.execPath, [BOUNDED_DISCOVERY_EXECUTABLE, "--request", request], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.match(repeated.stdout, /bounded discovery receipt ni:\/\/\/sha-256;/u);
});
