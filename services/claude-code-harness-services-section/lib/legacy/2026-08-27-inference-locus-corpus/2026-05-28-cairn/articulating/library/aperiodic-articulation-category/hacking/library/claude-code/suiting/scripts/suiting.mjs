// suiting : (available-memory, task, opts) -> context-spacesuit   [HACKING: name admitted]
//
// Restriction (referencing = projection out of the fiber). Composes the MINIMAL six-component suit
// for a task: project the relevant memory, trim to the token budget (~1.5K -- the cure to the 515x
// overhead). Writes NOTHING durable -- composing a suit is not learning. Pure.

import { weightOf } from "#script/recognizing";

const approxTokens = (s) => Math.ceil(JSON.stringify(s).length / 4); // crude estimate, ~4 chars/token

export default function suiting(available, task, opts = {}) {
  if (typeof task !== "string" || task.length === 0)
    throw new TypeError("suiting: task must be a non-empty string");
  const { identity = "claude-code", budget = 1500, constraints = [], capabilities = [], perception = [] } = opts;
  const mem = Array.isArray(available) ? available : [];

  // relevance: a memory is relevant if any of its cell coordinates (subject/predicate/value/placement)
  // mentions a task token. (Subject `e` matters most for recall and was wrongly omitted before.)
  const taskTokens = task.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const matched = mem.filter((m) =>
    taskTokens.some((tok) => `${m.e} ${m.a} ${m.v} ${m.placement}`.toLowerCase().includes(tok)));
  // recognition-weight: highest-trust first (sense > remembered-sense > learning), so the suit fills
  // with the most-trusted claims within budget
  const ranked = matched.map((m) => ({ m, w: weightOf(m, opts.now) })).sort((a, b) => b.w - a.w);
  // collapse to one claim per (subject, predicate): the highest-weight value wins -> sense beats learning
  const seen = new Set();
  const relevant = ranked
    .filter(({ m }) => { const k = `${m.e}|${m.a}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(({ m }) => m);

  const suit = { identity, constraints, capabilities, perception, memory: [], mission: task, tokenEstimate: 0 };
  for (const m of relevant) {                       // restriction to budget
    const trial = { ...suit, memory: [...suit.memory, m] };
    if (approxTokens(trial) > budget) break;
    suit.memory.push(m);
  }
  suit.tokenEstimate = approxTokens(suit);
  return suit;
}
