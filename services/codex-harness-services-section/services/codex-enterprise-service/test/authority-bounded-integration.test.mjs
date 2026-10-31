import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { ACTOR, identity } from "../src/enterprise.mjs";
import { codexMutationIntent, executeAuthorityBoundIntegration, leaderAuthority } from "../src/authority-bounded-integration.mjs";

const demand = "urn:demand:authority-bounded-execute";

function plan() {
  const body = { type: "RequirementBoundActuationPlanK", version: 1, actor: ACTOR, demand, mutationAuthorized: false, acceptanceAuthorized: false, conveys: [] };
  return { id: identity(body), ...body };
}

function fixture(path = "candidate.txt") {
  const actuationPlan = plan();
  const intent = codexMutationIntent({ demand, plan: actuationPlan.id, path, beforeDigest: null, afterContent: "candidate bytes\n", sourceProviderReceipts: ["urn:provider-receipt:bounded-work-lot"] });
  const authority = leaderAuthority({
    demand, plan: actuationPlan.id, sourceDigest: "urn:sha256:leader-expression", transportReceipt: "urn:receipt:trusted-codex-user-turn",
    issuedAt: "2020-01-01T00:00:00.000Z",
    scope: [{ path: intent.path, operation: intent.operation, beforeDigest: intent.beforeDigest, afterDigest: intent.afterDigest }],
  });
  return { actuationPlan, intent, authority };
}

function executeInput(values) {
  return { actor: ACTOR, demand, ...values, nativeResourceReceipt: "urn:receipt:codex-native-usage" };
}

test("only exact single-use Leader authority actuates exact bytes and returns a pending candidate", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "codex-authorized-workspace-"));
  const claimsRoot = mkdtempSync(join(tmpdir(), "codex-authority-claims-"));
  const values = fixture();
  const candidate = executeAuthorityBoundIntegration(executeInput(values), { workspaceRoot, claimsRoot, now: () => new Date("2026-07-27T12:00:00.000Z") });
  assert.equal(readFileSync(join(workspaceRoot, "candidate.txt"), "utf8"), "candidate bytes\n");
  assert.equal(candidate.type, "CandidatePatchK");
  assert.equal(candidate.authority, values.authority.id);
  assert.equal(candidate.plan, values.actuationPlan.id);
  assert.equal(candidate.verification, null);
  assert.equal(candidate.customerOutcome, null);
  assert.equal(candidate.acceptanceAuthority, false);
  assert.throws(() => executeAuthorityBoundIntegration(executeInput(values), { workspaceRoot, claimsRoot, now: () => new Date("2026-07-27T12:00:00.000Z") }), /already been consumed|workspace bytes changed/u);
});

test("missing, byte-mismatched, and path-escaping authority refuses before filesystem mutation", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "codex-authority-refusal-"));
  const claimsRoot = mkdtempSync(join(tmpdir(), "codex-authority-refusal-claims-"));
  const values = fixture();
  assert.throws(() => executeAuthorityBoundIntegration(executeInput({ ...values, authority: undefined }), { workspaceRoot, claimsRoot }), /authority must be an exact object/u);
  const mismatch = leaderAuthority({ ...values.authority, scope: [{ ...values.authority.scope[0], afterDigest: "urn:sha256:not-the-candidate" }] });
  assert.throws(() => executeAuthorityBoundIntegration(executeInput({ ...values, authority: mismatch }), { workspaceRoot, claimsRoot, now: () => new Date("2026-07-27T12:00:00.000Z") }), /exact mutation bytes/u);
  assert.throws(() => codexMutationIntent({ demand, plan: values.actuationPlan.id, path: "../escape", beforeDigest: null, afterContent: "no", sourceProviderReceipts: ["urn:r"] }), /workspace-relative/u);
  assert.equal(existsSync(join(workspaceRoot, "candidate.txt")), false);
});

test("a fresh MAPE MCP process performs the real scoped write and emits its own author-process digest", () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "codex-execute-mcp-"));
  const claimsRoot = mkdtempSync(join(tmpdir(), "codex-execute-mcp-claims-"));
  const values = fixture("fresh.txt");
  const request = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "execute_authority_bounded_integration", arguments: executeInput(values) } };
  const server = new URL("../src/mape-office-mcp.mjs", import.meta.url);
  const run = spawnSync(process.execPath, [server.pathname], { cwd: workspaceRoot, env: { ...process.env, CODEX_AUTHORIZED_WORKSPACE_ROOT: workspaceRoot, CODEX_AUTHORITY_CLAIMS_ROOT: claimsRoot }, input: `${JSON.stringify(request)}\n`, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const candidate = JSON.parse(run.stdout).result.structuredContent;
  assert.equal(candidate.type, "CandidatePatchK");
  assert.match(candidate.authorProcessDigest, /^urn:sha256:[a-f0-9]{64}$/u);
  assert.equal(readFileSync(join(workspaceRoot, "fresh.txt"), "utf8"), "candidate bytes\n");
});
