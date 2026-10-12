// articulating : utterance -> potential-aperiodic-articulation-cell
//
// The topmost generator. Consumes an utterance [token, claim] and produces the potential
// articulation-cell [utterance, [void, void]] -- neither axis articulated yet (bottom of FOUR).
// Pure JSON-in / JSON-out; no fs, no clock, no env. Closure machinery (FOUR, the cell partition)
// is INHERITED by being generated in the aperiodic regime; this script only fires the generator.

export default function articulating(utterance) {
  if (!Array.isArray(utterance) || utterance.length !== 2)
    throw new TypeError("articulating: utterance must be an array of length 2 [token, claim]");
  const [token, claim] = utterance;
  if (typeof token !== "string" || token.length === 0)
    throw new TypeError("articulating: token must be a non-empty string");
  if (typeof claim !== "string" || claim.length === 0)
    throw new TypeError("articulating: claim must be a non-empty string");
  return [utterance, [null, null]]; // [void, void] = potential-aperiodic-articulation-cell
}
