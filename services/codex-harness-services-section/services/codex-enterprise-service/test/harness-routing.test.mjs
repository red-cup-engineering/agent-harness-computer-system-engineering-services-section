import assert from "node:assert/strict";
import test from "node:test";
import { classifyWork, observeMonitor, providerLaunchPreflight, selectRoute, subagentProjection } from "../src/harness-routing.mjs";

const demand = { capability: "capability:review", authority: "authority:leader", bounded: true, completionConditions: ["report"], capacity: 1, maximumLatencyMs: 5000, receiverPolicy: "receiver:safe", providerNativeResource: "resource:remote" };
const offer = { id: "offer:1", signed: true, capability: demand.capability, authority: demand.authority, capacity: 2, latencyMs: 100, consideration: 2, receiverPolicies: [demand.receiverPolicy], providerNativeResources: [demand.providerNativeResource], provider: "supplier:a", model: "model:a", provenance: "receipt:a" };

test("work classification and offer selection are endpoint-neutral", () => {
  assert.equal(classifyWork({ deterministic: true }), "mechanical");
  assert.equal(classifyWork(demand), "bounded-inference");
  assert.equal(classifyWork({}), "premium-residual");
  assert.deepEqual(selectRoute(demand, [offer]), { disposition: "selected", workClass: "bounded-inference", offer: "offer:1", provider: "supplier:a", model: "model:a", provenance: "receipt:a" });
  assert.equal(selectRoute({ capability: "other", authority: demand.authority, bounded: true, completionConditions: ["x"] }, [offer]).disposition, "refused-no-exact-offer");
});

test("premium work requires explicit admitted budget and stops under usage pressure", () => {
  const premium = { ...demand, bounded: false };
  assert.equal(selectRoute(premium, [offer]).disposition, "refused-unadmitted-premium");
  assert.equal(selectRoute(premium, [offer], { admittedBudget: { tier: "authorized", maximumConsideration: 3 } }).disposition, "selected");
  assert.equal(selectRoute(premium, [offer], { admittedBudget: { tier: "authorized", maximumConsideration: 3 }, usagePressure: { stopNewPremium: true } }).disposition, "refused-usage-pressure");
});

test("selected endpoints are reused with bounded prompt-only projection", () => {
  const route = selectRoute(demand, [offer]), registry = new Map();
  const first = subagentProjection(route, registry), second = subagentProjection(route, registry);
  assert.equal(first.disposition, "spawn");
  assert.equal(first.forkTurns, "none");
  assert.deepEqual(second, { disposition: "reuse", agentId: first.agentId, forkTurns: "none" });
});

test("provider preflight refuses prompting launch settings", () => {
  assert.equal(providerLaunchPreflight({ safeMode: true, strictMcp: true, noninteractive: true, backgroundIsolation: "isolated" }).admitted, true);
  assert.equal(providerLaunchPreflight({ safeMode: true, strictMcp: true, noninteractive: false }).admitted, false);
});

test("monitoring emits only state changes and backs off exponentially", () => {
  const first = observeMonitor(null, { stateDigest: "one" }, { minimumBackoffMs: 1000, maximumBackoffMs: 8000 });
  const second = observeMonitor(first, { stateDigest: "one" }, { minimumBackoffMs: 1000, maximumBackoffMs: 8000 });
  const third = observeMonitor(second, { stateDigest: "one" }, { minimumBackoffMs: 1000, maximumBackoffMs: 8000 });
  assert.deepEqual([first.emitObservation, second.emitObservation, third.emitObservation], [true, false, false]);
  assert.deepEqual([first.nextBackoffMs, second.nextBackoffMs, third.nextBackoffMs], [1000, 2000, 4000]);
  assert.equal(observeMonitor(third, { stateDigest: "two" }).emitObservation, true);
});
