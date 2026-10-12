// predicating : (potential-aperiodic-articulation-cell, decomposition) -> potential-transfinite-predication-cell
//
// Fires inside the potential articulation-cell [utterance, [void, void]] -- the only phase with room
// to work. Decomposes into a Fregean predication (subject token, predicate claim, object token) and
// seeds it at value "bottom" (no evidence committed yet). FOUR is inherited; this only opens the cell.

export default function predicating(cell, decomposition) {
  if (!Array.isArray(cell) || cell.length !== 2 || !Array.isArray(cell[1]) ||
      cell[1][0] !== null || cell[1][1] !== null)
    throw new TypeError("predicating: requires a potential cell [utterance, [null, null]]");
  const { subject, predicate, object } = decomposition ?? {};
  for (const [k, v] of [["subject", subject], ["predicate", predicate], ["object", object]])
    if (typeof v !== "string" || v.length === 0)
      throw new TypeError(`predicating: decomposition.${k} must be a non-empty string`);
  return { subject, predicate, object, value: "bottom" };
}
