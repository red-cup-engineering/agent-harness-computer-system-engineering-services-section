// inferring : context -> inference
//
// Claude Code's root action morphism -- a degenerate articulating generator in the aperiodic regime.
// It types and validates the boundary between a context and one session-unfold step (a message plus
// embedded next-actions). The ENACTOR (an LLM endpoint; for the conductor seat, me) is fungible and
// supplied externally as `inference`; this script does NOT call a model. That separation IS the
// product thesis: inferring is the morphism, the endpoint is the interchangeable thing that fires it.

export default function inferring(context, inference) {
  if (!context || typeof context !== "object")
    throw new TypeError("inferring: context must be an object (session state + latest input)");
  if (typeof context.input !== "string" || context.input.length === 0)
    throw new TypeError("inferring: context.input must be a non-empty string");
  if (!inference || typeof inference.message !== "string" || inference.message.length === 0)
    throw new TypeError("inferring: enactor must supply an inference with a non-empty message");
  const actions = Array.isArray(inference.actions) ? inference.actions : [];
  return { message: inference.message, actions };
}
