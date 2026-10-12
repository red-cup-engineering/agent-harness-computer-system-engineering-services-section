// wondering : memory -> open questions   [INTERNAL]
//
// Surface the unsettled: every top (contradiction) or bottom (no-evidence) cell is an open question --
// a demand the conductor can route to inquiring (outward) or deriving/ruminating (inward).

export default function wondering(memory) {
  const qs = [];
  for (const r of (Array.isArray(memory) ? memory : [])) {
    const e = r.e ?? r.subject, a = r.a ?? r.predicate, v = r.v ?? r.value;
    if (v === "top" || v === "bottom") qs.push(`What is the truth of: ${e} ${a}?`);
  }
  return [...new Set(qs)];
}
