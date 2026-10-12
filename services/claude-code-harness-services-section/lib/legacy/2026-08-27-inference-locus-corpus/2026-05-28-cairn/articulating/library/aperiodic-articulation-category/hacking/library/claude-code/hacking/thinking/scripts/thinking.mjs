// thinking : (utterance, decomposition, posit) -> finite-settlement-cell   [INTERNAL: one thought]
//
// One thought = one descent of the meaning tower: articulate -> predicate -> posit -> settle. The
// general cognitive step; the other verbs are specializations or loops over it / the fibers.

import articulating from "#script/articulating";
import predicating from "#script/predicating";
import positing from "#script/positing";
import settling from "#script/settling";

export default function thinking(utterance, decomposition, posit) {
  return settling(positing(predicating(articulating(utterance), decomposition), posit));
}
