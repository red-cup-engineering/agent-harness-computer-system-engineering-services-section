// ruminating : (subject, memory) -> bounded re-derivation   [INTERNAL]
//
// Re-process one subject by repeatedly dreaming over it. Per the rumination/self-reflection note:
// introspection becomes pathological RUMINATION when unbounded, productive SELF-REFLECTION when it
// stops once it stops producing. So the loop is bounded (maxRounds) AND halts when no new claim is
// derived -- the governance bound is what makes it self-reflection rather than rumination.

import dreaming from "#script/finite-dreaming";

export default function ruminating(subject, memory, { maxRounds = 3 } = {}) {
  let cells = (Array.isArray(memory) ? memory : []).filter((c) => (c.e ?? c.subject) === subject);
  const derived = [];
  let rounds = 0;
  for (; rounds < maxRounds; rounds++) {
    const d = dreaming(cells);
    if (!d.length) break;                 // nothing new -> halt (self-reflection, not endless rumination)
    derived.push(...d);
    cells = cells.concat(d);
  }
  return { subject, rounds, derived };
}
