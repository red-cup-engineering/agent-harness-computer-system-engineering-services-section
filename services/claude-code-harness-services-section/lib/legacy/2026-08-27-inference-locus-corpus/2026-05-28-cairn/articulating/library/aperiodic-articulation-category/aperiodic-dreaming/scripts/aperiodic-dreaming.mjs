// aperiodic-dreaming -- DELEGATES to the swarm's bigraded dreaming family (aperiodic corner:
// kappa>=omega_1, base EXTENDS; NETWORK). Channels genuinely new facts via the swarm's `inferring`.
// The harness no longer owns the LLM enactor (docs/GENEALOGY.md §2). This shim preserves the harness
// signature, maps the historical `provider` option to a swarm endpointId, and keeps the claude-code
// memory placement default.

import { aperiodicDream } from "@561/development.experimental.swarm-intelligence";

const ENDPOINT = { groq: "endpoint:groq", nvidia: "endpoint:nvidia-nim", cerebras: "endpoint:cerebras" };

export default async function aperiodicDreaming(experiences, opts = {}) {
  const endpointId = opts.endpointId ?? ENDPOINT[opts.provider ?? "groq"] ?? "endpoint:groq";
  return aperiodicDream(experiences, { ...opts, endpointId, placement: opts.placement ?? "claude-code" });
}
