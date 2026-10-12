import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitSetOfHealthWorkIntents, readCheckoutBoundUnitsAllow } from "../scripts/admit-set-of-health-work-intents.mjs";
import {
  CHAIN_ITEMS,
  PLAN_CELL,
  admitAllocationsForTasks,
  allocationIdFor,
  allocationIdentityOf,
  buildTaskAllocation,
  slugify,
} from "../src/work-allocation.mjs";

// The allocating office and the incumbent actor are parameters now, read from
// the calling harness's own policy record; nothing defaults to a machine.
const OFFICE = "executive-officer-to-the-leader";
const ACTOR = "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw";

const FAKE_BINDING = { dataRoot: "/fake/metroplat-root" };

/**
 * Fake `admitAgencyWorkAllocation` reporting `appended` rows on the first
 * call for a given allocation id and 0 on every later call for that same
 * id, matching the real service's already-admitted idempotence.
 */
function fakeAdmitAllocation(appended = 3) {
  const calls = [];
  const admittedIds = new Set();
  const fn = (binding, allocation, options) => {
    calls.push({ binding, allocation, options });
    const alreadyAdmitted = admittedIds.has(allocation.id);
    admittedIds.add(allocation.id);
    const rowsAppended = alreadyAdmitted ? 0 : appended;
    return {
      kind: "metroplat.work.agency-work-allocation-admission",
      allocation: allocation.id,
      subject: allocation.subject,
      office: allocation.office.id,
      incumbent: allocation.incumbency.actor,
      scope: allocation.allocation.scope,
      incumbency: "dignitas",
      appended: rowsAppended,
      status: rowsAppended === 0 ? "already-admitted" : "admitted",
    };
  };
  fn.calls = calls;
  return fn;
}

test("slugify lowercases, collapses non [a-z0-9-] runs, trims edges", () => {
  assert.equal(slugify("@red-cup-engineering/foo Bar_Baz!!"), "red-cup-engineering-foo-bar-baz");
});

test("allocationIdFor and buildTaskAllocation shape one allocation payload deterministically", () => {
  assert.equal(allocationIdFor("task:exact-deps-pkg-a"), "allocation-task:exact-deps-pkg-a");
  const allocation = buildTaskAllocation({ taskCell: "task:exact-deps-pkg-a", subject: "structured-work-intent-x", office: OFFICE, actor: ACTOR });
  assert.equal(allocation.kind, "metroplat.work.agency-work-allocation");
  assert.equal(allocation.id, "allocation-task:exact-deps-pkg-a");
  assert.equal(allocation.subject, "structured-work-intent-x");
  assert.equal(allocation.office.id, OFFICE);
  assert.equal(allocation.incumbency.actor, ACTOR);
  assert.equal(allocation.incumbency.recognition, "t");
  assert.equal(allocation.incumbency.induction, "t");
  assert.equal(allocation.allocation.scope, "task:exact-deps-pkg-a");
  assert.equal(allocation.allocation.assigner, ACTOR);
  assert.equal(allocation.allocation.charge, "t");
});

test("admitAllocationsForTasks admits one allocation per task and sums appended rows", async () => {
  const admitAllocationFn = fakeAdmitAllocation(3);
  const tasks = [{ cell: "task:exact-deps-pkg-a" }, { cell: "task:exact-deps-pkg-b" }];
  const result = await admitAllocationsForTasks({ tasks, subject: "structured-work-intent-x", office: OFFICE, actor: ACTOR, at: "2026-09-03T12:00:00.000Z", binding: FAKE_BINDING, admitAllocationFn });
  assert.equal(result.allocated, 2);
  assert.equal(result.allocationsAppended, 6);
  assert.equal(admitAllocationFn.calls.length, 2);
  await assert.rejects(() => admitAllocationsForTasks({ tasks, subject: "s", office: OFFICE, actor: ACTOR, at: "t", binding: null }), /admitAllocationFn is required/u);
  await assert.rejects(() => admitAllocationsForTasks({ tasks, subject: "s", at: "t", binding: null, admitAllocationFn }), /office is required/u);
});

test("the checkout-bound unit allowlist is the machine's own record, never this service's", async () => {
  assert.deepEqual(await readCheckoutBoundUnitsAllow(), []);
  const directory = mkdtempSync(join(tmpdir(), "checkout-bound-units-"));
  try {
    const listed = join(directory, "list.json");
    writeFileSync(listed, JSON.stringify({ units: ["verdaccio.service"] }));
    assert.deepEqual(await readCheckoutBoundUnitsAllow(listed), ["verdaccio.service"]);
    const bare = join(directory, "bare.json");
    writeFileSync(bare, JSON.stringify(["jsnode-server.service"]));
    assert.deepEqual(await readCheckoutBoundUnitsAllow(bare), ["jsnode-server.service"]);
    const malformed = join(directory, "malformed.json");
    writeFileSync(malformed, JSON.stringify({ units: [""] }));
    await assert.rejects(() => readCheckoutBoundUnitsAllow(malformed), /nonempty-string array/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fakeWork() {
  const intents = [];
  const allocations = [];
  return {
    kind: "ops",
    binding: null,
    admitFn: async (_binding, intent, options) => { intents.push({ intent, options }); return { appended: intent.items.length, status: "admitted" }; },
    admitAllocationFn: async (_binding, allocation) => { allocations.push(allocation); return { appended: 3, status: "admitted" }; },
    close: async () => {},
    intents,
    allocations,
  };
}

const ONE_VIOLATION = Object.freeze({
  kind: "metroplat.monitoring.checkout-health.read",
  checked: 4,
  violations: 1,
  truncated: false,
  findings: [{ check: "exact-deps", path: "/repo/pkg-a/package.json", reason: "range", name: "dep", field: "dependencies", specification: "^1.0.0" }],
  failedUnits: [],
  unitsObserved: 0,
  hostsReached: ["local"],
  hostsUnreachable: [],
  checkoutBoundUnits: [],
});

test("admitSetOfHealthWorkIntents runs the checkers on this checkout with the chain and allow list, then admits metroplat's own intent and one allocation per task on the rail", async () => {
  const reads = [];
  const readHealthFn = (request) => { reads.push(request); return ONE_VIOLATION; };
  const work = fakeWork();
  const summary = await admitSetOfHealthWorkIntents({
    root: "/repo",
    changedOnly: true,
    budgetMs: 5000,
    hosts: ["local"],
    checkoutBoundUnitsAllow: ["verdaccio.service"],
    intentId: "health-work-intents-2026-09-03",
    office: "some-office",
    actor: "actor:x",
    work,
    readHealthFn,
    now: () => new Date("2026-09-03T12:00:00.000Z"),
  });
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0], { root: "/repo", changedOnly: true, budgetMs: 5000, hosts: ["local"], checkoutBoundUnitsAllow: ["verdaccio.service"] });
  assert.equal(work.intents.length, 1);
  const [{ intent, options }] = work.intents;
  assert.equal(intent.kind, "metroplat.work.structured-intent");
  assert.equal(intent.id, "health-work-intents-2026-09-03");
  assert.deepEqual(intent.items.slice(0, CHAIN_ITEMS.length).map((item) => item.cell), CHAIN_ITEMS.map((item) => item.cell));
  assert.equal(intent.items.at(-1).parent, PLAN_CELL);
  assert.match(intent.items.at(-1).cell, /^task:exact-deps-/u);
  assert.equal(options.subject, "structured-work-intent-health-work-intents-2026-09-03");
  assert.equal(work.allocations.length, 1);
  assert.equal(work.allocations[0].office.id, "some-office");
  assert.equal(work.allocations[0].incumbency.actor, "actor:x");
  assert.equal(work.allocations[0].allocation.scope, intent.items.at(-1).cell);
  assert.equal(summary.kind, "metroplat.monitoring.checkout-health.work-intent-summary");
  assert.equal(summary.violations, 1);
  assert.equal(summary.admitted, 1);
  assert.equal(summary.allocated, 1);
  assert.equal(summary.allocationsAppended, 3);
  assert.equal(summary.intentId, "health-work-intents-2026-09-03");
});

test("admitSetOfHealthWorkIntents admits nothing and never opens the rail when the checkout is clean", async () => {
  const readHealthFn = () => ({ ...ONE_VIOLATION, violations: 0, findings: [] });
  const work = { admitFn: () => { throw new Error("must not be called"); }, admitAllocationFn: () => { throw new Error("must not be called"); } };
  const summary = await admitSetOfHealthWorkIntents({ readHealthFn, work, now: () => new Date("2026-09-03T12:00:00.000Z") });
  assert.equal(summary.violations, 0);
  assert.equal(summary.admitted, 0);
  assert.equal(summary.intentId, null);
});

test("PLAN_CELL matches the last CHAIN_ITEMS cell", () => {
  assert.equal(PLAN_CELL, CHAIN_ITEMS.at(-1).cell);
});

test("the allocation identity is read off a policy record, refusing one that names neither", () => {
  assert.deepEqual(allocationIdentityOf({ actor: ACTOR, rootOffice: OFFICE }), { actor: ACTOR, office: OFFICE });
  assert.throws(() => allocationIdentityOf({ rootOffice: OFFICE }, "policy.json"), /policy\.json names no actor/);
  assert.throws(() => allocationIdentityOf({ actor: ACTOR }, "policy.json"), /policy\.json names no rootOffice/);
});
