import { ACTOR, CUSTOMER, identity } from "./enterprise.mjs";

export const FRESH_VERIFICATION_ACTOR = "urn:ame:codex-fresh-verification-actuator";
export const FRESH_VERIFICATION_OFFER = "urn:offer:codex-fresh-verification";
export const SEMANTIC_REVIEW_PROVIDER = "urn:ame:semantic-candidate-review-service";

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is required`);
  return value.trim();
}

function exact(value, label, type) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an exact object`);
  const { id, ...body } = value;
  if (id !== identity(body)) throw new TypeError(`${label} must be content addressed exactly`);
  if (body.type !== type || body.version !== 1) throw new TypeError(`${label} must be ${type} version 1`);
  return Object.freeze({ id, ...body });
}

function assay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("assay must be an exact provider observation");
  const artifacts = value.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new TypeError("assay requires at least one exact artifact");
  const selectedArtifacts = artifacts.map((artifact, index) => Object.freeze({
    path: nonempty(artifact?.path, `assay.artifacts[${index}].path`), digest: nonempty(artifact?.digest, `assay.artifacts[${index}].digest`),
  }));
  const endpoint = nonempty(value.endpoint, "assay.endpoint");
  if (!/^(?:https?:\/\/|a2a:)/u.test(endpoint)) throw new TypeError("assay endpoint must be a real A2A or HTTP interface");
  if (!["passed", "failed"].includes(value.outcome)) throw new TypeError("assay outcome must be passed or failed");
  return Object.freeze({
    processDigest: nonempty(value.processDigest, "assay.processDigest"), candidateDigest: nonempty(value.candidateDigest, "assay.candidateDigest"),
    requirementSet: nonempty(value.requirementSet, "assay.requirementSet"), endpoint,
    command: nonempty(value.command, "assay.command"), artifacts: Object.freeze(selectedArtifacts),
    startedAt: nonempty(value.startedAt, "assay.startedAt"), completedAt: nonempty(value.completedAt, "assay.completedAt"),
    outcome: value.outcome, freshProcess: value.freshProcess === true, authorExcluded: value.authorExcluded === true,
  });
}

export function independentAssayCandidate(body) {
  if (body?.mutationAuthority === true || body?.acceptanceAuthority === true || (Array.isArray(body?.conveys) && body.conveys.length > 0)) throw new TypeError("assay provider cannot carry mutation or acceptance authority");
  const selected = {
    type: "IndependentAssayCandidateK", version: 1,
    provider: nonempty(body?.provider ?? SEMANTIC_REVIEW_PROVIDER, "provider"),
    candidate: nonempty(body?.candidate, "candidate"), requirementSet: nonempty(body?.requirementSet, "requirementSet"),
    providerReceipt: nonempty(body?.providerReceipt, "providerReceipt"), reviewSubject: nonempty(body?.reviewSubject, "reviewSubject"),
    assay: assay(body?.assay), consideration: body?.consideration ?? null,
    mutationAuthority: false, acceptanceAuthority: false, conveys: [],
  };
  return Object.freeze({ id: identity(selected), ...selected });
}

function validateRequirementSet(value) {
  const selected = exact(value, "requirementSet", "RequirementSetK");
  if (!Array.isArray(selected.requirements) || selected.requirements.length === 0) throw new TypeError("requirementSet must contain requirements");
  for (const [index, requirement] of selected.requirements.entries()) exact(requirement, `requirementSet.requirements[${index}]`, "RequirementK");
  return selected;
}

export function admitAuthorExcludedVerification(input) {
  if (input?.actor !== ACTOR) throw new TypeError(`verification customer must be ${ACTOR}`);
  const demand = nonempty(input?.demand, "demand");
  const candidate = exact(input?.candidate, "candidate", "CandidatePatchK");
  if (candidate.actor !== ACTOR || candidate.demand !== demand || candidate.verification !== null || candidate.customerOutcome !== null) throw new TypeError("verification requires the exact pending Codex CandidatePatchK");
  const requirements = validateRequirementSet(input?.requirementSet);
  const supplied = exact(input?.providerCandidate, "providerCandidate", "IndependentAssayCandidateK");
  if (supplied.provider !== SEMANTIC_REVIEW_PROVIDER || supplied.provider === candidate.provider) throw new TypeError(`verification requires independent provider ${SEMANTIC_REVIEW_PROVIDER}`);
  if (supplied.candidate !== candidate.id || supplied.requirementSet !== requirements.id) throw new TypeError("provider assay does not bind the exact candidate and requirements");
  nonempty(supplied.providerReceipt, "providerCandidate.providerReceipt");
  nonempty(supplied.reviewSubject, "providerCandidate.reviewSubject");
  const observed = assay(supplied.assay);
  if (observed.candidateDigest !== candidate.id || observed.requirementSet !== requirements.id) throw new TypeError("assay does not bind the exact candidate and requirements");
  if (observed.processDigest === candidate.authorProcessDigest || observed.freshProcess !== true || observed.authorExcluded !== true) throw new TypeError("assay must be a fresh author-excluded process");
  const materialized = Date.parse(candidate.materializedAt), started = Date.parse(observed.startedAt), completed = Date.parse(observed.completedAt);
  if (!Number.isFinite(materialized) || !Number.isFinite(started) || !Number.isFinite(completed) || started < materialized || completed < started) throw new TypeError("assay timestamps do not prove post-materialization completion");
  if (supplied.mutationAuthority !== false || supplied.acceptanceAuthority !== false || !Array.isArray(supplied.conveys) || supplied.conveys.length !== 0) throw new TypeError("assay provider cannot carry mutation or acceptance authority");
  const body = {
    type: "VerificationOutcomeK", version: 1, provider: FRESH_VERIFICATION_ACTOR,
    customer: CUSTOMER, actor: ACTOR, demand, candidate: candidate.id, requirementSet: requirements.id,
    assayProvider: supplied.provider, providerCandidate: supplied.id, providerReceipt: supplied.providerReceipt,
    reviewSubject: supplied.reviewSubject, assay: observed, outcome: observed.outcome,
    consideration: supplied.consideration, offer: FRESH_VERIFICATION_OFFER,
    considerationDisposition: "preserved-provider-observation-not-invented-settlement",
    customerOutcome: null, demandClosure: null, mutationAuthority: false, acceptanceAuthority: false, conveys: [],
  };
  return Object.freeze({ id: identity(body), ...body });
}
