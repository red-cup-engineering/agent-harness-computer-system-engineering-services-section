import { ACTOR, CUSTOMER, identity } from "./enterprise.mjs";

export const REQUIREMENT_TRAJECTORY_ACTOR = "urn:ame:codex-requirement-trajectory-actuator";
export const REQUIREMENT_TRAJECTORY_OFFER = "urn:offer:codex-requirement-trajectory";

const MARKET = "urn:ame:inference-work-lot-service";
const CLAUDE = "urn:ame:claude-code-inference-team";
const STAGES = Object.freeze([
  "software-architecture-specification",
  "high-level-design",
  "low-level-design",
  "bounded-work-lots",
]);

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is required`);
  return value.trim();
}

function strings(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be nonempty`);
  const selected = value.map((entry, index) => nonempty(entry, `${label}[${index}]`));
  if (new Set(selected).size !== selected.length) throw new TypeError(`${label} must not contain duplicates`);
  return Object.freeze(selected);
}

function exact(value, label, type) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an exact object`);
  const { id, ...body } = value;
  if (id !== identity(body)) throw new TypeError(`${label} must be content addressed exactly`);
  if (body.type !== type || body.version !== 1) throw new TypeError(`${label} must be ${type} version 1`);
  return Object.freeze({ id, ...body });
}

export function requirementSet(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) throw new TypeError("requirements must be nonempty");
  const records = requirements.map((entry, index) => {
    const body = {
      type: "RequirementK",
      version: 1,
      desiredOutcome: nonempty(entry?.desiredOutcome, `requirements[${index}].desiredOutcome`),
      completionConditions: strings(entry?.completionConditions, `requirements[${index}].completionConditions`),
    };
    return Object.freeze({ id: identity(body), ...body });
  });
  const body = { type: "RequirementSetK", version: 1, requirements: records };
  return Object.freeze({ id: identity(body), ...body });
}

function validateRequirementSet(value) {
  const selected = exact(value, "requirementSet", "RequirementSetK");
  if (!Array.isArray(selected.requirements) || selected.requirements.length === 0) throw new TypeError("requirementSet requirements must be nonempty");
  for (const [index, requirement] of selected.requirements.entries()) {
    const verified = exact(requirement, `requirementSet.requirements[${index}]`, "RequirementK");
    nonempty(verified.desiredOutcome, `requirementSet.requirements[${index}].desiredOutcome`);
    strings(verified.completionConditions, `requirementSet.requirements[${index}].completionConditions`);
  }
  return selected;
}

export function providerPlanCandidate(body) {
  if (Array.isArray(body?.conveys) && body.conveys.length > 0) throw new TypeError("provider plan candidate cannot convey mutation or acceptance authority");
  const selected = {
    type: "ProviderPlanCandidateK",
    version: 1,
    stage: nonempty(body?.stage, "stage"),
    provider: nonempty(body?.provider, "provider"),
    market: nonempty(body?.market ?? MARKET, "market"),
    requirementSet: nonempty(body?.requirementSet, "requirementSet"),
    requirements: body?.requirements,
    predecessor: nonempty(body?.predecessor, "predecessor"),
    offer: nonempty(body?.offer, "offer"),
    marketReceipt: nonempty(body?.marketReceipt, "marketReceipt"),
    providerReceipt: nonempty(body?.providerReceipt, "providerReceipt"),
    consideration: body?.consideration ?? null,
    credentialsIncluded: body?.credentialsIncluded === true,
    ambientRepositoryAccess: body?.ambientRepositoryAccess === true,
    conveys: [],
  };
  return Object.freeze({ id: identity(selected), ...selected });
}

function conditionsByRequirement(requirementSet) {
  return new Map(requirementSet.requirements.map(({ id, completionConditions }) => [id, completionConditions]));
}

function validateCandidate(value, stage, requirements, predecessor) {
  const selected = exact(value, `providerCandidates.${stage}`, "ProviderPlanCandidateK");
  if (selected.stage !== stage) throw new TypeError(`provider candidate stage mismatch: expected ${stage}`);
  if (selected.market !== MARKET) throw new TypeError(`${stage} must be purchased through ${MARKET}`);
  if ([STAGES[0], STAGES[1]].includes(stage) && selected.provider !== CLAUDE) throw new TypeError(`${stage} requires ${CLAUDE}`);
  if (!selected.provider.startsWith("urn:ame:")) throw new TypeError(`${stage} provider must be an Actor URN`);
  if (selected.predecessor !== predecessor) throw new TypeError(`${stage} predecessor receipt mismatch`);
  nonempty(selected.offer, `${stage} offer`);
  nonempty(selected.marketReceipt, `${stage} marketReceipt`);
  nonempty(selected.providerReceipt, `${stage} providerReceipt`);
  if (selected.credentialsIncluded || selected.ambientRepositoryAccess) throw new TypeError(`${stage} crossed the credential or ambient-repository membrane`);
  if (!Array.isArray(selected.requirements) || selected.requirements.length !== requirements.size) throw new TypeError(`${stage} must preserve every requirement`);
  const seen = new Set();
  for (const binding of selected.requirements) {
    const requirement = nonempty(binding?.requirement, `${stage} requirement binding`);
    const expected = requirements.get(requirement);
    if (!expected || seen.has(requirement)) throw new TypeError(`${stage} added, omitted, or duplicated a requirement`);
    const observed = strings(binding.completionConditions, `${stage} ${requirement} completionConditions`);
    if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new TypeError(`${stage} silently changed completion conditions for ${requirement}`);
    seen.add(requirement);
  }
  if (!Array.isArray(selected.conveys) || selected.conveys.length !== 0) throw new TypeError(`${stage} candidate cannot convey mutation or acceptance authority`);
  return selected;
}

export function integrateRequirementBoundActuationPlan(input) {
  if (input?.actor !== ACTOR) throw new TypeError(`planning actor must be ${ACTOR}`);
  const demand = nonempty(input?.demand, "demand");
  const evidenceReceipt = nonempty(input?.evidenceReceipt, "evidenceReceipt");
  const requirements = validateRequirementSet(input?.requirementSet);
  if (input?.providerRefusal) {
    const refusal = input.providerRefusal;
    const stage = nonempty(refusal.stage, "providerRefusal.stage");
    if (!STAGES.includes(stage)) throw new TypeError(`unknown refused planning stage ${stage}`);
    const body = {
      type: "RequirementBoundPlanningObstructionK", version: 1, provider: REQUIREMENT_TRAJECTORY_ACTOR,
      customer: CUSTOMER, actor: ACTOR, demand, requirementSet: requirements.id, evidenceReceipt,
      refusedStage: stage, requiredProvider: stage === STAGES[0] || stage === STAGES[1] ? CLAUDE : MARKET,
      refusalReceipt: nonempty(refusal.receipt, "providerRefusal.receipt"), fallbackAuthorized: false,
      offer: REQUIREMENT_TRAJECTORY_OFFER,
      considerationDisposition: "unknown-until-provider-authored-offer-and-independent-incurrence-observation", conveys: [],
    };
    return Object.freeze({ id: identity(body), ...body });
  }
  if (!Array.isArray(input?.providerCandidates) || input.providerCandidates.length !== STAGES.length) throw new TypeError("one provider candidate for every planning stage is required");
  const expected = conditionsByRequirement(requirements);
  const candidates = [];
  let predecessor = evidenceReceipt;
  for (const [index, stage] of STAGES.entries()) {
    const candidate = validateCandidate(input.providerCandidates[index], stage, expected, predecessor);
    if (candidate.requirementSet !== requirements.id) throw new TypeError(`${stage} requirement-set identity mismatch`);
    candidates.push(candidate);
    predecessor = candidate.id;
  }
  const body = {
    type: "RequirementBoundActuationPlanK", version: 1, provider: REQUIREMENT_TRAJECTORY_ACTOR,
    customer: CUSTOMER, actor: ACTOR, demand, requirementSet: requirements.id, evidenceReceipt,
    stages: candidates.map(({ stage, id, provider, market, offer, marketReceipt, providerReceipt, consideration }) => ({ stage, candidate: id, provider, market, offer, marketReceipt, providerReceipt, consideration })),
    requirements: requirements.requirements.map(({ id, completionConditions }) => ({ requirement: id, completionConditions })),
    offer: REQUIREMENT_TRAJECTORY_OFFER,
    considerationDisposition: "unknown-until-provider-authored-offer-and-independent-incurrence-observation",
    mutationAuthorized: false, acceptanceAuthorized: false, conveys: [],
  };
  return Object.freeze({ id: identity(body), ...body });
}
