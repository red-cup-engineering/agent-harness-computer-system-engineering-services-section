// being : spec -> agent (modeled-player)   [HACKING: action-tower generator; D9 blocks final conformance]
//
// The organism comes to exist as a self / swarm-member, represented as a MODELED PLAYER
// (spotcomp/MODELED-PLAYERS.md): P = (id, capability, handedness, governance, inbox, outbox). In/Out
// are EAVT traces -- the member's OWN logs, not special messages.
//
// The two hands of experiencing/ (within doing/), per emsenn's spiral framing:
//   - kind "learning" : inward -- observes the shared trace, posits/contributes (learning, dreaming).
//   - kind "sensing"  : outward (a drone) -- a SENSE: observes the environment (repo, web) and
//                       actuates reads/searches, taking the outside world into its own observation and
//                       reporting claims back. sensing feeds being -> doing -> experiencing -> sensing.

export default function being(spec) {
  const id = spec?.id;
  if (typeof id !== "string" || id.length === 0)
    throw new TypeError("being: spec.id must be a non-empty string");
  const role = typeof spec?.role === "string" && spec.role ? spec.role : "swarm-member";
  const kind = spec?.kind === "sensing" ? "sensing" : "learning";
  const capability = Array.isArray(spec?.capability) ? spec.capability
    : (kind === "sensing" ? ["observe-external", "capture", "report"] : ["observe", "posit", "contribute"]);
  const handedness = {
    recv: spec?.recv ?? ["utterance"],
    send: spec?.send ?? ["claim"],
    actuate: spec?.actuate ?? (kind === "sensing" ? ["read-repo", "web-search"] : []),
    observe: spec?.observe ?? (kind === "sensing" ? ["repo", "web", "environment"] : ["shared-trace"])
  };
  return {
    id, role, kind, capability, handedness,
    governance: typeof spec?.governance === "string" ? spec.governance : "budget-bounded",
    inbox: `trace:inbox/${id}`,
    outbox: `trace:outbox/${id}`
  };
}
