import test from "node:test";
import assert from "node:assert/strict";
import { dutyLaneOf, formatSpineLine, rankReadyDuties } from "../scripts/emit-claude-per-turn-duty.mjs";

const READOUT = {
  ready: 6,
  blocked: 0,
  done: 1,
  frontier: [
    { scope: "task:exact-deps-pkg-a", text: "pin", state: "ready" },
    { scope: "task:friction-missing-capability-some-app-1234abcd", text: "some/app.mjs needed x", state: "ready" },
    { scope: "task:import-stratification-metroplat", text: "metroplat has 3 import-stratification violation(s)", state: "ready" },
    { scope: "task:import-stratification-metroplat", text: "the same duty under the office's frontier", state: "ready" },
    { scope: "task:checkout-bound-unit-local-x-service", text: "x.service executes from inside the checkout", state: "ready" },
    { scope: "task:exact-deps-pkg-b", text: "pin", state: "blocked" },
  ],
};

test("dutyLaneOf routes repair-script scopes to lane 0, recognized kinds to lane 1, everything else to lane 2", () => {
  assert.equal(dutyLaneOf("task:exact-deps-pkg-a"), 0);
  assert.equal(dutyLaneOf("task:data-custody-section-x"), 0);
  assert.equal(dutyLaneOf("task:import-stratification-metroplat"), 1);
  assert.equal(dutyLaneOf("task:checkout-bound-unit-local-x-service"), 1);
  assert.equal(dutyLaneOf("task:friction-missing-capability-some-app-1234abcd"), 2);
  assert.equal(dutyLaneOf(undefined), 2);
});

test("rankReadyDuties dedupes by scope, drops non-ready items, and puts the duties a session must hand first, timer-paid duties last", () => {
  const ranked = rankReadyDuties(READOUT).map((item) => item.scope);
  assert.deepEqual(ranked, [
    "task:checkout-bound-unit-local-x-service",
    "task:import-stratification-metroplat",
    "task:friction-missing-capability-some-app-1234abcd",
    "task:exact-deps-pkg-a",
  ]);
});

test("formatSpineLine reads the rail's numeric counts and lists the ranked frontier, never the number `ready` as an array", () => {
  const line = formatSpineLine(READOUT, "fresh");
  assert.match(line, /^rail ops\.561\.group: ready=6 frontier=6 blocked=0 done=1 -- /u);
  assert.ok(line.includes("task:checkout-bound-unit-local-x-service; task:import-stratification-metroplat; task:friction-missing-capability-some-app-1234abcd (+1 more)"), line);
  assert.ok(!line.includes("executes from inside"), "no duty text in the per-turn line");
  assert.equal(formatSpineLine(null, "n"), "");
  assert.equal(formatSpineLine({ ready: 0, frontier: [], blocked: 0, done: 0 }, "fresh"), "rail ops.561.group: ready=0 frontier=0 blocked=0 done=0 (fresh)");
});
