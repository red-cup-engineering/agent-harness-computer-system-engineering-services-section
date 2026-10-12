import { ACTOR, CUSTOMER, identity } from "./enterprise.mjs";

export const SOURCE_PINNED_ANALYSIS_ACTOR = "urn:ame:codex-source-pinned-analysis-actuator";
export const SOURCE_PINNED_ANALYSIS_OFFER = "urn:offer:codex-source-pinned-analysis";
const NOTEBOOK = "urn:ame:notebooklm-inference-team";

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

function textArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(value.map((entry, index) => nonempty(entry, `${label}[${index}]`)));
}

export function sourceBoundCorpus(segments) {
  if (!Array.isArray(segments) || segments.length === 0) throw new TypeError("segments must be nonempty");
  const selected = segments.map((entry, index) => Object.freeze({
    source: nonempty(entry?.source, `segments[${index}].source`),
    digest: nonempty(entry?.digest, `segments[${index}].digest`),
    coordinates: nonempty(entry?.coordinates, `segments[${index}].coordinates`),
  }));
  if (new Set(selected.map(({ source }) => source)).size !== selected.length) throw new TypeError("corpus source identities must be unique");
  const body = { type: "SourceBoundCorpusK", version: 1, segments: selected };
  return Object.freeze({ id: identity(body), ...body });
}

function validateCorpus(value) {
  const corpus = exact(value, "corpus", "SourceBoundCorpusK");
  if (!Array.isArray(corpus.segments) || corpus.segments.length === 0) throw new TypeError("corpus segments must be nonempty");
  for (const [index, segment] of corpus.segments.entries()) {
    nonempty(segment?.source, `corpus.segments[${index}].source`);
    nonempty(segment?.digest, `corpus.segments[${index}].digest`);
    nonempty(segment?.coordinates, `corpus.segments[${index}].coordinates`);
  }
  return corpus;
}

export function providerAdvisoryCandidate(body) {
  if (Array.isArray(body?.conveys) && body.conveys.length > 0) throw new TypeError("provider advisory cannot convey authority");
  const selected = {
    type: "ProviderAdvisoryCandidateK", version: 1,
    provider: nonempty(body?.provider, "provider"), corpus: nonempty(body?.corpus, "corpus"),
    advice: nonempty(body?.advice, "advice"), citations: body?.citations,
    contradictions: body?.contradictions ?? [], unknowns: body?.unknowns ?? [],
    providerReceipt: nonempty(body?.providerReceipt, "providerReceipt"),
    consideration: body?.consideration ?? null,
    mutationAuthority: false, acceptanceAuthority: false, conveys: [],
  };
  return Object.freeze({ id: identity(selected), ...selected });
}

function validateCandidate(value, corpus) {
  const candidate = exact(value, "providerCandidate", "ProviderAdvisoryCandidateK");
  if (candidate.provider !== NOTEBOOK) throw new TypeError(`source-pinned advisory requires ${NOTEBOOK}`);
  if (candidate.corpus !== corpus.id) throw new TypeError("provider advisory corpus identity mismatch");
  nonempty(candidate.providerReceipt, "providerCandidate.providerReceipt");
  nonempty(candidate.advice, "providerCandidate.advice");
  const sources = new Set(corpus.segments.map(({ source }) => source));
  if (!Array.isArray(candidate.citations) || candidate.citations.length === 0) throw new TypeError("provider advisory requires source citations");
  for (const [index, citation] of candidate.citations.entries()) {
    const source = nonempty(citation?.source, `providerCandidate.citations[${index}].source`);
    nonempty(citation?.coordinates, `providerCandidate.citations[${index}].coordinates`);
    if (!sources.has(source)) throw new TypeError(`provider advisory cited a source outside the exact corpus: ${source}`);
  }
  textArray(candidate.contradictions, "providerCandidate.contradictions");
  textArray(candidate.unknowns, "providerCandidate.unknowns");
  if (candidate.mutationAuthority !== false || candidate.acceptanceAuthority !== false || !Array.isArray(candidate.conveys) || candidate.conveys.length !== 0) throw new TypeError("provider advisory cannot carry mutation or acceptance authority");
  return candidate;
}

export function admitSourcePinnedAdvisory(input) {
  if (input?.actor !== ACTOR) throw new TypeError(`analysis actor must be ${ACTOR}`);
  const demand = nonempty(input?.demand, "demand");
  const deterministicLookupReceipt = nonempty(input?.deterministicLookupReceipt, "deterministicLookupReceipt");
  const corpus = validateCorpus(input?.corpus);
  if (input?.providerRefusal) {
    const body = {
      type: "SourcePinnedAnalysisObstructionK", version: 1, provider: SOURCE_PINNED_ANALYSIS_ACTOR,
      customer: CUSTOMER, actor: ACTOR, demand, corpus: corpus.id, deterministicLookupReceipt,
      requiredProvider: NOTEBOOK, refusalReceipt: nonempty(input.providerRefusal.receipt, "providerRefusal.receipt"),
      bypassAuthorized: false, offer: SOURCE_PINNED_ANALYSIS_OFFER,
      considerationDisposition: "unknown-until-provider-authored-offer-and-independent-incurrence-observation", conveys: [],
    };
    return Object.freeze({ id: identity(body), ...body });
  }
  const candidate = validateCandidate(input?.providerCandidate, corpus);
  const body = {
    type: "ReceiptedAdvisoryK", version: 1, provider: SOURCE_PINNED_ANALYSIS_ACTOR,
    customer: CUSTOMER, actor: ACTOR, demand, corpus: corpus.id, deterministicLookupReceipt,
    advisoryProvider: candidate.provider, providerCandidate: candidate.id, providerReceipt: candidate.providerReceipt,
    citations: candidate.citations, contradictions: candidate.contradictions, unknowns: candidate.unknowns,
    consideration: candidate.consideration, offer: SOURCE_PINNED_ANALYSIS_OFFER,
    mutationAuthority: false, acceptanceAuthority: false, disposition: "advisory-candidate",
    considerationDisposition: "preserved-provider-observation-not-cross-asset-converted", conveys: [],
  };
  return Object.freeze({ id: identity(body), ...body });
}
