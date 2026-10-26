import test from "node:test";
import assert from "node:assert/strict";
import { RECEIVING_JUDGEMENT_SCHEMA, RECEIVING_DECISIONS, receivingJudgementMeaning } from "@red-cup-engineering/agent-harness-computer-system-engineering-services-section/carrier/receiving-judgement";
import * as original from "../src/carrier/receiving-judgement.mjs";

test("the public pure receiving contract is the unchanged original module", () => {
  assert.equal(RECEIVING_JUDGEMENT_SCHEMA, original.RECEIVING_JUDGEMENT_SCHEMA);
  assert.equal(RECEIVING_DECISIONS, original.RECEIVING_DECISIONS);
  assert.equal(receivingJudgementMeaning, original.receivingJudgementMeaning);
  assert.deepEqual(RECEIVING_DECISIONS, ["accepted", "rejected", "unverified"]);
});

test("accurate error receiving remains distinct from successful fulfillment", () => {
  assert.match(receivingJudgementMeaning({ kind: "skill-error" }), /original receiverCondition remains unmet/u);
  assert.match(receivingJudgementMeaning({ kind: "skill-result" }), /original receiverCondition/u);
  assert.equal(RECEIVING_JUDGEMENT_SCHEMA.additionalProperties, false);
});
