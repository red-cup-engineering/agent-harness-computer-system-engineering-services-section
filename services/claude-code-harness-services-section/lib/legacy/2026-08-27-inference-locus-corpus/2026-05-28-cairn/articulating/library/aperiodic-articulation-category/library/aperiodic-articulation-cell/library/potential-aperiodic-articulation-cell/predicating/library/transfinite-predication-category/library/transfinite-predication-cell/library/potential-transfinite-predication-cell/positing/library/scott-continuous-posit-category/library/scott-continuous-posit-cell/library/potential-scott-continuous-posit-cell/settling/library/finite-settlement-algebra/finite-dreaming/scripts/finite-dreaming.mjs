// finite-dreaming -- DELEGATES to the swarm's bigraded dreaming family (finite corner: kappa<omega,
// fixed fiber). The logic (composition / generalization / contradiction-surfacing) now lives in
// @561/swarm-intelligence (docs/GENEALOGY.md §5; the dreaming coincidence journal). This shim
// preserves the harness signature and the claude-code memory placement default. Dreaming is the
// swarm's closure-discipline on the trace; the harness only triggers and consumes it.

import { finiteDream } from "@561/development.experimental.swarm-intelligence";

export default function dreaming(rows, opts = {}) {
  return finiteDream(rows, { ...opts, placement: opts.placement ?? "claude-code" });
}
