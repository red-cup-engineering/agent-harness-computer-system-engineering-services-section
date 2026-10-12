// imagining : memory -> hypothetical recombinations   [INTERNAL]
//
// Counterfactual extension: recombine known subjects/predicates/objects into cells NOT yet present,
// marked hypothetical (low trust, never sense). Imagination proposes; it does not assert.

export default function imagining(memory, { limit = 5 } = {}) {
  const cells = (Array.isArray(memory) ? memory : []).map((c) => ({ e: c.e ?? c.subject, a: c.a ?? c.predicate, v: c.v ?? c.value }));
  const have = new Set(cells.map((c) => JSON.stringify([c.e, c.a, c.v])));
  const subs = [...new Set(cells.map((c) => c.e))];
  const preds = [...new Set(cells.map((c) => c.a))];
  const objs = [...new Set(cells.map((c) => c.v))];
  const out = [];
  for (const e of subs) for (const a of preds) for (const v of objs) {
    if (out.length >= limit) return out;
    const k = JSON.stringify([e, a, v]);
    if (!have.has(k)) { have.add(k); out.push({ e, a, v, evidence: ["imagining:hypothetical"], hypothetical: true }); }
  }
  return out;
}
