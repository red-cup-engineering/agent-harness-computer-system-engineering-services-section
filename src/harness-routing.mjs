// observeMonitor, folded local to this package.
//
// The historical @red-cup-engineering/harness-routing-service package was
// deleted (32efbf028f0) alongside this one, as if unused, because this
// package (its only house consumer of observeMonitor) was deleted in the
// same commit. It has no other consumer, so the function becomes this
// package's own rather than a restored one-file package. observeMonitor
// itself is self-contained (no imports of its own); recovered verbatim from
// git history (src/harness-routing.mjs at that package's last commit).
function finite(value, fallback = Number.POSITIVE_INFINITY) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** One status-poll observation: whether state changed, and the next exponential backoff. */
export function observeMonitor(prior, sample, policy = {}) {
  const minimum = finite(policy.minimumBackoffMs, 1_000), maximum = finite(policy.maximumBackoffMs, 60_000);
  const digest = String(sample?.stateDigest ?? "");
  if (!digest) throw new TypeError("stateDigest is required");
  const changed = !prior || prior.stateDigest !== digest;
  const unchangedCount = changed ? 0 : prior.unchangedCount + 1;
  const nextBackoffMs = changed ? minimum : Math.min(maximum, minimum * (2 ** unchangedCount));
  return Object.freeze({ stateDigest: digest, changed, unchangedCount, nextBackoffMs, emitObservation: changed, injectPremiumContext: changed });
}
