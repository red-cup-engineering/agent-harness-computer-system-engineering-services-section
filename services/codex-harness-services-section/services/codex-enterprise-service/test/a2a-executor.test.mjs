import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "rsc-quiescent.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
import { ACTOR } from "../src/enterprise.mjs";
import { executeA2aOperationBytes, operationBytes, operationFromBytes } from "../src/a2a-executor.mjs";

function request() {
  const body = { type: "CodexEnterprisePositionOperation", provider: ACTOR };
  return { id: semanticId(body), ...body };
}

test("the A2A operation is executable as canonical RMN below the ActivityPub carrier", () => {
  const input = request();
  const result = operationFromBytes(executeA2aOperationBytes(operationBytes(input), {
    position: () => ({ type: "CodexEnterprisePosition", actor: ACTOR, observations: 0 }),
  }));
  assert.equal(result.type, "CodexEnterprisePositionOperationResult");
  assert.equal(result.provider, ACTOR);
  assert.equal(result.request, input.id);
  assert.deepEqual(result.position, { type: "CodexEnterprisePosition", actor: ACTOR, observations: 0 });
});

test("the same bounded evidence compiler is addressable through A2A/RMN", () => {
  const body = { type: "CodexToolEvidenceCompileOperation", provider: ACTOR, raw: "one\ntwo\n", maximumRawBytes: 4096, phase: "context-discovery" };
  const input = { id: semanticId(body), ...body };
  const result = operationFromBytes(executeA2aOperationBytes(operationBytes(input), {
    compileToolEvidence: (request) => ({
      receipt: { id: "urn:sha256:test", output: { quantity: { amount: request.raw.length, unit: "bytes" } } },
      receiptPath: "/evidence/receipt.json",
      modelContext: JSON.stringify({ summary: { lineCount: 2 }, premiumContext: { truncated: false } }),
    }),
  }));
  assert.equal(result.type, "CodexToolEvidenceCompileOperationResult");
  assert.equal(result.provider, ACTOR);
  assert.equal(result.request, input.id);
  assert.equal(result.premiumContext.summary.lineCount, 2);
});

test("A2A preserves an oversized evidence pointer without parsing a receipt into premium context", () => {
  const body = { type: "CodexToolEvidenceCompileOperation", provider: ACTOR, raw: "large", maximumRawBytes: 4096, phase: "context-discovery" };
  const input = { id: semanticId(relationalWitnessJournalDocument(body)), ...body };
  const pointer = "Data available at urn:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa. Use read_codex_tool_evidence.";
  const result = operationFromBytes(executeA2aOperationBytes(operationBytes(input), {
    compileToolEvidence: () => ({
      receipt: { id: "urn:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", premiumContext: { truncated: true } },
      receiptPath: "/evidence/receipt.json",
      modelContext: pointer,
    }),
  }));
  assert.equal(result.premiumContext, pointer);
  assert.doesNotMatch(result.premiumContext, /ToolEvidenceReceipt|carrier|summary/u);
});
