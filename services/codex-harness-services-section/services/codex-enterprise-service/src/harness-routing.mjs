const WORK_CLASSES = new Set(["mechanical", "bounded-inference", "premium-residual"]);

function finite(value, fallback = Number.POSITIVE_INFINITY) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function classifyWork(demand = {}) {
  if (demand.deterministic === true || demand.requiredReasoning === "none") return "mechanical";
  if (demand.bounded === true && Array.isArray(demand.completionConditions) && demand.completionConditions.length > 0) return "bounded-inference";
  return "premium-residual";
}

export function selectRoute(demand, offers, policy = {}) {
  const workClass = classifyWork(demand);
  if (!Array.isArray(offers)) throw new TypeError("signed offer set is required");
  if (policy.usagePressure?.stopNewPremium === true && workClass === "premium-residual") {
    return Object.freeze({ disposition: "refused-usage-pressure", workClass, reason: "new premium derivations are stopped; route bounded or mechanical work outward" });
  }
  const admitted = policy.admittedBudget;
  if (workClass === "premium-residual" && (!admitted || typeof admitted.tier !== "string" || !Number.isFinite(admitted.maximumConsideration))) {
    return Object.freeze({ disposition: "refused-unadmitted-premium", workClass, reason: "premium work requires an explicit admitted budget and tier" });
  }
  const capability = String(demand.capability ?? "");
  const candidates = offers.filter((offer) => offer?.signed === true
    && offer.capability === capability
    && offer.authority === demand.authority
    && finite(offer.capacity, 0) >= finite(demand.capacity, 1)
    && (demand.providerNativeResource === undefined || offer.providerNativeResources?.includes(demand.providerNativeResource))
    && finite(offer.latencyMs) <= finite(demand.maximumLatencyMs)
    && (demand.receiverPolicy === undefined || offer.receiverPolicies?.includes(demand.receiverPolicy))
    && (workClass !== "premium-residual" || finite(offer.consideration) <= admitted.maximumConsideration));
  candidates.sort((left, right) => finite(left.consideration) - finite(right.consideration) || finite(left.latencyMs) - finite(right.latencyMs) || String(left.id).localeCompare(String(right.id)));
  const selected = candidates[0];
  return selected
    ? Object.freeze({ disposition: "selected", workClass, offer: selected.id, provider: selected.provider, model: selected.model, provenance: selected.provenance })
    : Object.freeze({ disposition: "refused-no-exact-offer", workClass, reason: "no live signed offer satisfies capability, authority, capacity, resources, consideration, latency, and receiver policy" });
}

export function subagentProjection(route, registry = new Map()) {
  if (route?.disposition !== "selected") throw new TypeError("selected route is required");
  const stableKey = `${route.provider}\u0000${route.model}\u0000${route.offer}`;
  const existing = registry.get(stableKey);
  if (existing) return Object.freeze({ disposition: "reuse", agentId: existing, forkTurns: "none" });
  const agentId = `routed-${registry.size + 1}`;
  registry.set(stableKey, agentId);
  return Object.freeze({ disposition: "spawn", agentId, forkTurns: "none", model: route.model });
}

export function providerLaunchPreflight(value = {}) {
  const valid = value.safeMode === true && value.strictMcp === true && value.noninteractive === true && value.backgroundIsolation !== "prompt";
  return Object.freeze({ admitted: valid, disposition: valid ? "launch-admitted" : "launch-refused", requirements: ["safe-mode", "strict-mcp", "noninteractive", "non-prompting-background-isolation"] });
}

export function observeMonitor(prior, sample, policy = {}) {
  const minimum = finite(policy.minimumBackoffMs, 1_000), maximum = finite(policy.maximumBackoffMs, 60_000);
  const digest = String(sample?.stateDigest ?? "");
  if (!digest) throw new TypeError("stateDigest is required");
  const changed = !prior || prior.stateDigest !== digest;
  const unchangedCount = changed ? 0 : prior.unchangedCount + 1;
  const nextBackoffMs = changed ? minimum : Math.min(maximum, minimum * (2 ** unchangedCount));
  return Object.freeze({ stateDigest: digest, changed, unchangedCount, nextBackoffMs, emitObservation: changed, injectPremiumContext: changed });
}

export function assertWorkClass(value) {
  if (!WORK_CLASSES.has(value)) throw new TypeError(`unknown work class ${value}`);
  return value;
}
