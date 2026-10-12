// prompting : utterance -> user-prompt
//
// The human-enactor sibling of inferring (same aperiodic regime; sibling, not upstream). A
// restriction of articulating to the human-typing enactor. Produces a user-prompt: the user token
// and the prompt claim, ready for the conductor to articulate and descend.

export default function prompting(utterance) {
  if (!Array.isArray(utterance) || utterance.length !== 2)
    throw new TypeError("prompting: utterance must be [token, claim]");
  const [token, claim] = utterance;
  if (typeof token !== "string" || token.length === 0)
    throw new TypeError("prompting: token (the user) must be a non-empty string");
  if (typeof claim !== "string" || claim.length === 0)
    throw new TypeError("prompting: claim (the prompt) must be a non-empty string");
  return { kind: "user-prompt", user: token, prompt: claim };
}
