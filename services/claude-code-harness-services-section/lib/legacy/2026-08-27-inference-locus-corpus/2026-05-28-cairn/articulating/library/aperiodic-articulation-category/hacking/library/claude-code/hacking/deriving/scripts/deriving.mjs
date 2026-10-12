// deriving : goal -> derivation-demand-utterance   [HACKING: conductor act]
//
// A conscious command to the swarm: demand it settle a specific claim/goal. Produces a well-formed
// utterance the conductor MCP turns into a studying pass toward the goal. PURE: emits the utterance.

export default function deriving(goal) {
  if (typeof goal !== "string" || goal.length === 0)
    throw new TypeError("deriving: goal must be a non-empty string");
  return { utterance: [`derive:${goal}`, "settle this claim"], goal };
}
