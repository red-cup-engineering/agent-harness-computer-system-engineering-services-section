// governing : (state, opts) -> governance   [HACKING: action-tower generator; regime placement admitted]
//
// Executive regulation -- the finite generator of the action tower (parallel to settling). The budget
// governor is the organism's METABOLISM: the hard cap that bounds swarm growth (no budget -> no work).
// Attention allocates the next work to the highest-dissent subject. Conflict norms prioritize top
// (contradiction) demands. Deterministic. The real cost math (cost-compose / budget-check) is deferred.

export default function governing(state, opts = {}) {
  const budget = Number.isFinite(state?.budget) ? state.budget : 0;
  const spent = Number.isFinite(state?.spent) ? state.spent : 0;
  const remaining = budget - spent;
  const allowed = remaining > 0;

  // attention: the subject with the most open demand (highest dissent) gets worked next
  let attend = null;
  if (Array.isArray(state?.subjects) && state.subjects.length) {
    const ranked = [...state.subjects].sort((a, b) => (b.dissent ?? 0) - (a.dissent ?? 0));
    attend = ranked[0]?.subject ?? null;
  }

  return { allowed, remaining, attend, reason: allowed ? "within-budget" : "budget-exhausted" };
}
