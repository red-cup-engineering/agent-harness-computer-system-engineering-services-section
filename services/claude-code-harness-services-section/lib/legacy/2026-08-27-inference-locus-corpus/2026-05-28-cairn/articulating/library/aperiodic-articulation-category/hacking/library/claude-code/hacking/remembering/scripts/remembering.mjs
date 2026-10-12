// remembering : (query, memory) -> recognition-weighted recall   [INTERNAL]
//
// Recall = referencing (projection out of the fiber), restricted to the query and ordered by
// recognition weight (sense first). It is the read side; it writes nothing and learns nothing.

import suiting from "#script/suiting";

export default function remembering(query, memory, opts = {}) {
  if (typeof query !== "string" || query.length === 0)
    throw new TypeError("remembering: query must be a non-empty string");
  return suiting(memory, query, { budget: opts.budget ?? 2000, now: opts.now }).memory;
}
