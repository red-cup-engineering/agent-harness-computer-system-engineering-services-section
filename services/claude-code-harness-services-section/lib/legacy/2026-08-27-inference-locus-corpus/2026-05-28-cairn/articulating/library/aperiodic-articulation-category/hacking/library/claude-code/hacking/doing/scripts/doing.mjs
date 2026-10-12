// doing : (agent, intent) -> act   [HACKING: action-tower generator; regime placement admitted]
//
// A bounded act: the body sensing or effecting. The act produces an utterance that enters the
// substrate -- sense and effect both speak the same language. doing is the transfinite-bounded
// generator of the action tower (parallel to predicating). invoking is a doing sub-morphism.

export default function doing(agent, intent) {
  if (!agent || typeof agent.id !== "string" || !agent.id)
    throw new TypeError("doing: agent.id required");
  if (typeof intent !== "string" || intent.length === 0)
    throw new TypeError("doing: intent must be a non-empty string");
  return { agent: agent.id, intent, utterance: [`act:${agent.id}`, intent] };
}
