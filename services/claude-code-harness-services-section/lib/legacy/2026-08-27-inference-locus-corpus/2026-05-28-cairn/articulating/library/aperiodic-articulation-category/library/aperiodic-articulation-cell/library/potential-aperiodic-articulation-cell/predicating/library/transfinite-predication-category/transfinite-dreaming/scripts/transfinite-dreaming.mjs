// transfinite-dreaming -- DELEGATES to the swarm's bigraded dreaming family (transfinite corner:
// omega<kappa<omega_1, fiber EXTENDS). Derives new co-<predicate>s from co-occurrence. Logic lives in
// @561/swarm-intelligence (docs/GENEALOGY.md §5). This shim preserves the harness signature
// (including the `limit` option) and the claude-code memory placement default.

import { transfiniteDream } from "@561/development.experimental.swarm-intelligence";

export default function transfiniteDreaming(rows, opts = {}) {
  return transfiniteDream(rows, { ...opts, placement: opts.placement ?? "claude-code" });
}
