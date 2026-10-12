/**
 * A receiver's three answers: accepted and rejected judge inspected evidence; unverified says the
 * evidence could not be inspected (a tool failed, a read timed out, a subject was unreachable).
 * Unverified is unknown, never a rejection: it admits no discharge and the work is received again.
 */
export const RECEIVING_DECISIONS = Object.freeze(["accepted", "rejected", "unverified"]);
export const RECEIVING_JUDGEMENT_SHAPE = Object.freeze({ decision: RECEIVING_DECISIONS.join("|"), text: "judgement", evidence: ["inspected evidence"] });
export const RECEIVING_JUDGEMENT_SCHEMA = Object.freeze({
  type: "object",
  properties: { decision: { enum: RECEIVING_DECISIONS }, text: { type: "string", minLength: 1 }, evidence: { type: "array", items: { type: "string", minLength: 1 } } },
  required: ["decision", "text", "evidence"],
  additionalProperties: false,
});

/** What an independent verdict judges. Receiving an error report can establish its accuracy,
 * never fulfillment of the work whose condition remains open. Shared by CLI and inference receivers. */
export function receivingJudgementMeaning(result) {
  return result?.kind === "skill-error"
    ? "This is a skill-error report. accepted: inspected evidence verifies the reported failure or unmet condition, including any native diagnostic or codomain assay carried by the result. rejected: inspected evidence contradicts the report. Acceptance receives the error report only; the execution remains failed and the original receiverCondition remains unmet. Do not turn accepting an accurate error report into successful work or invent a rejection of the report merely because the work failed."
    : "This is a skill-result. accepted: inspected evidence verifies the delivery against the original receiverCondition. rejected: inspected evidence shows that condition unmet, or the result names no evidence, or evidence it names does not exist.";
}
