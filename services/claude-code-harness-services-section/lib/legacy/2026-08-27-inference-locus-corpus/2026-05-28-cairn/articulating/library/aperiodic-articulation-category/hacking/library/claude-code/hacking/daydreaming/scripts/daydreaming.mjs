// daydreaming : context -> dream-utterance   [HACKING: conductor act]
//
// A conscious command to the subconscious: force a daydream -- consolidate from the current context
// off-session (cf. lifecycle.consolidating / the "dream"). Produces a well-formed utterance that the
// conductor MCP turns into swarm consolidation. PURE: emits the utterance; the entrypoint enacts it.

export default function daydreaming(context) {
  const focus = typeof context === "string" ? context : (context?.focus ?? "recent");
  return { utterance: [`daydream:${focus}`, "consolidate current context"], focus };
}
