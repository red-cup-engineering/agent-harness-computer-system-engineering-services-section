// studying : (subject, claims, swarm, opts) -> studied-subject   [HACKING: name admitted]
//
// Settle a subject's claim-lattice into accepted truth. Each claim-record is an observer holding a
// FOUR value. Consensus is the knowledge-order meet. Acceptance is by a SIMPLE truth-confidence
// heuristic (|mean truth-lean| >= threshold) -- this is a deliberate STUB.
//
// IMPORTANT: the real consensus/disagreement measure is the sheaf Laplacian over the observer network
// sheaf -- a separate, derived apparatus (moduli-descent-laplacian; Hansen-Ghrist). It is NOT
// reimplemented here and the `dissent` value below is NOT a Laplacian; it is a crude dispersion stub
// standing in until the real measure is wired in (see docs/dev/journal).
//
// A subject below threshold is UNSETTLED: its contradiction is a DEMAND the swarm (injected, fungible)
// satisfies by reading files and positing more claims; re-settle until confident or the round budget
// is spent -- contradictions resolve into the dominant truth as evidence accumulates. PURE given the swarm.

function meetK(a, b) {
  if (a === b) return a;
  if (a === "bottom" || b === "bottom") return "bottom";
  if (a === "top") return b;
  if (b === "top") return a;
  return "bottom";
}
const consensusOf = (vals) => (vals.length ? vals.reduce(meetK, "top") : "bottom");

const lean = (v) => (v === "true" ? 1 : v === "false" ? -1 : 0); // bottom, top -> 0 (no clear direction)
const meanLean = (vals) => (vals.length ? vals.map(lean).reduce((a, b) => a + b, 0) / vals.length : 0);

// crude dispersion stub (NOT the Laplacian): mean squared pairwise truth-lean difference
function dissent(vals) {
  const n = vals.length;
  if (n < 2) return 0;
  const x = vals.map(lean);
  let e = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) e += (x[i] - x[j]) ** 2;
  return e / (n * (n - 1) / 2);
}

export default function studying(subject, claims, swarm, opts = {}) {
  if (typeof subject !== "string" || subject.length === 0)
    throw new TypeError("studying: subject must be a non-empty string");
  const { threshold = 0.6, maxRounds = 4 } = opts;
  let observers = Array.isArray(claims) ? [...claims] : [];
  const demands = [];
  let rounds = 0;

  while (rounds < maxRounds) {
    const vals = observers.map((c) => c.value);
    const confident = observers.length >= 1 && Math.abs(meanLean(vals)) >= threshold;
    if (confident) break;
    const demand = {
      subject,
      reason: observers.length < 1 ? "no-evidence" : "below-confidence-threshold",
      confidence: Math.abs(meanLean(vals)),
      round: rounds
    };
    demands.push(demand);
    const added = swarm ? swarm(demand) : [];            // swarm reads files, posits more claims
    if (!Array.isArray(added) || added.length === 0) break; // swarm exhausted -> stop
    observers = observers.concat(added);
    rounds++;
  }

  const vals = observers.map((c) => c.value);
  const m = meanLean(vals);
  const accepted = observers.length >= 1 && Math.abs(m) >= threshold;
  return {
    subject,
    consensus: consensusOf(vals),                         // knowledge-order agreed-committed value
    truth: accepted ? (m > 0 ? "true" : "false") : "top", // resolved truth, or top (still contradictory)
    confidence: Math.abs(m),
    dissent: dissent(vals),                               // STUB dispersion; real measure = deferred sheaf Laplacian
    accepted,
    rounds,
    claimCount: observers.length,
    demands
  };
}
