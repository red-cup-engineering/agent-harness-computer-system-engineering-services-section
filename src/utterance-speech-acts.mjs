/**
 * Source-bound speech-act proposals for the *existing* harness utterance reader.
 *
 * An inference/analyst may propose a passage as an idea, question, suggestion,
 * order, etc. This module binds that proposal to the EXACT observed utterance
 * coordinates and UTF-16 source span. It never authenticates a purported Actor,
 * adopts an institutional decision, opens Work, or admits a Requirement.
 *
 * The original utterance and its carrier remain the source. These are readout
 * projections, not a second message store or an authority registry.
 */
export const SPEECH_ACT_KINDS = Object.freeze([
  "idea", "question", "suggestion", "order", "observation",
  "correction", "ruling", "quotation", "information",
]);

const KNOWN_KINDS = new Set(SPEECH_ACT_KINDS);
const refuse = message => { throw new TypeError("utterance speech-act proposal: " + message); };

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function observedSource(utterance) {
  if (!plain(utterance) || typeof utterance.address !== "string" || !utterance.address
    || typeof utterance.session !== "string" || !utterance.session.trim()
    || typeof utterance.at !== "string" || !Number.isFinite(Date.parse(utterance.at))
    || typeof utterance.text !== "string" || !utterance.text.trim()) {
    refuse("an original, occurrence-addressed utterance with text, session and observed time is required");
  }
  return Object.freeze({
    address: utterance.address,
    session: utterance.session,
    at: utterance.at,
    ...(typeof utterance.carrier === "string" && utterance.carrier
      ? { carrier: utterance.carrier } : {}),
  });
}

/** A JS substring must not split one Unicode surrogate pair. */
function codePointBoundary(source, index) {
  if (index <= 0 || index >= source.length) return true;
  const before = source.charCodeAt(index - 1);
  const after = source.charCodeAt(index);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

/**
 * Bind one analyst's proposed speech acts to a single original utterance.
 *
 * A proposal is EXACTLY {start, end, kind}, using UTF-16 offsets into the
 * unmodified original text. Multiple distinct acts may overlap or share one
 * passage. Repeat identical candidates refuse; no model may substitute its
 * paraphrase for source words or attach an act to another source occurrence.
 *
 * "order" describes an analyst's proposed speech-act reading, not competence
 * to command. The returned readout never grants Work/Requirement authority.
 */
export function bindUtteranceSpeechActs(utterance, proposals, { interpretedBy } = {}) {
  const source = observedSource(utterance);
  if (typeof interpretedBy !== "string" || !interpretedBy.trim())
    refuse("interpretedBy must name the actual interpreting actor or system");
  if (!Array.isArray(proposals)) refuse("proposals must be an array");
  const seen = new Set();
  const candidates = proposals.map((proposed, index) => {
    if (!plain(proposed)
      || Object.keys(proposed).sort().join(",") !== "end,kind,start") {
      refuse(`proposal[${index}] must contain exactly end, kind, start`);
    }
    const { start, end, kind } = proposed;
    if (!KNOWN_KINDS.has(kind)) refuse(`proposal[${index}] names an unsupported speech-act kind`);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
      || start < 0 || end <= start || end > utterance.text.length
      || !codePointBoundary(utterance.text, start)
      || !codePointBoundary(utterance.text, end)) {
      refuse(`proposal[${index}] has no valid exact UTF-16 source span`);
    }
    const excerpt = utterance.text.slice(start, end);
    if (!excerpt.trim()) refuse(`proposal[${index}] selects only whitespace`);
    const key = `${start}:${end}:${kind}`;
    if (seen.has(key)) refuse(`proposal[${index}] repeats an earlier source act`);
    seen.add(key);
    return Object.freeze({
      source: source.address,
      span: Object.freeze({ unit: "utf16", start, end }),
      text: excerpt,
      proposedKind: kind,
    });
  });
  return Object.freeze({
    kind: "agent-harness.utterance-speech-acts/v1",
    source,
    interpretedBy,
    candidates: Object.freeze(candidates),
    assessment: "candidate-only",
    workAuthorized: false,
    requirementAdmitted: false,
  });
}

/**
 * Project interpretations over the ACTUAL utterances selected by readUtterances.
 * Unknown IDs refuse instead of silently binding repeated words to the wrong
 * message. Unmentioned occurrences remain unassessed (null), not "no acts".
 */
export function attachUtteranceSpeechActs(utterances, proposalsByAddress, options = {}) {
  if (!Array.isArray(utterances) || !plain(proposalsByAddress))
    refuse("an observed utterance array and source-addressed proposal map are required");
  const addresses = new Set(utterances.map(u => observedSource(u).address));
  if (addresses.size !== utterances.length) refuse("duplicate source occurrence in selected utterances");
  for (const address of Object.keys(proposalsByAddress)) {
    if (!addresses.has(address))
      refuse("interpretation names an unobserved or excluded source occurrence");
  }
  return Object.freeze(utterances.map(u => Object.freeze({
    ...u,
    speechActs: Object.hasOwn(proposalsByAddress, u.address)
      ? bindUtteranceSpeechActs(u, proposalsByAddress[u.address], options)
      : null,
  })));
}
