// scott-continuous-dreaming -- DELEGATES to the swarm's bigraded dreaming family (Scott-continuous
// corner: kappa=omega, fixed fiber). Per-cell joinK consolidation of all evidence to the directed sup.
// Logic lives in @561/swarm-intelligence (docs/GENEALOGY.md §5). This shim preserves the harness
// signature and the claude-code memory placement default.

import { scottContinuousDream } from "@561/development.experimental.swarm-intelligence";

export default function scottContinuousDreaming(rows, opts = {}) {
  return scottContinuousDream(rows, { ...opts, placement: opts.placement ?? "claude-code" });
}
