import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dischargeSetOfReadyDuties } from "../scripts/discharge-set-of-ready-duties.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "discharge-set-of-ready-duties.mjs");

function fakeWork(readout) {
  const discharges = [];
  return {
    kind: "ops",
    binding: null,
    readDispatch: async () => readout,
    admitDischargeFn: async (_binding, discharge) => { discharges.push(discharge); return { appended: 1, status: "admitted" }; },
    close: async () => {},
    discharges,
  };
}

test("dischargeSetOfReadyDuties refuses a missing root without touching the rail", async () => {
  await assert.rejects(() => dischargeSetOfReadyDuties({ work: { readDispatch: () => { throw new Error("must not be called"); } } }), /names no root/u);
});

test("dischargeSetOfReadyDuties reads the rail's readout and hands it to metroplat's dischargeReadyDuties with root/apply always present, and limit/scope/kind only when given", async () => {
  const readout = { frontier: [], queue: [], ready: 0 };
  const work = fakeWork(readout);
  const calls = [];
  const dischargeFn = async (request) => { calls.push(request); return { kind: "metroplat.monitoring.checkout-health.duty-discharge", duties: [], ok: true }; };
  const result = await dischargeSetOfReadyDuties({ root: "/repo", work, dischargeFn });
  assert.equal(calls.length, 1);
  const [request] = calls;
  assert.equal(request.readout, readout);
  assert.equal(request.root, "/repo");
  assert.equal(request.apply, false);
  assert.equal(request.binding, null);
  assert.equal(typeof request.planOrDischargeFn, "function");
  for (const key of ["limit", "scope", "kind"]) assert.ok(!(key in request), `${key} must not be present when omitted`);
  assert.equal(result.ok, true);
});

test("dischargeSetOfReadyDuties passes apply/limit/scope/kind through and admits each applied discharge on the rail", async () => {
  const duty = { scope: "task:exact-deps-pkg-a", intent: "health-1", state: "ready" };
  const work = fakeWork({ frontier: [duty], queue: [duty], ready: 1 });
  const calls = [];
  const dischargeFn = async (request) => {
    calls.push(request);
    const planned = await request.planOrDischargeFn({ duty, root: request.root, apply: request.apply, binding: request.binding });
    return { duties: [planned], ok: planned.status === "applied" };
  };
  const planFn = async ({ duty: given, admitDischargeFn, binding }) => {
    const discharge = { kind: "metroplat.work.discharge", id: `discharge-${given.scope}`, intent: given.intent, scope: given.scope, text: "pinned", evidence: ["gate"], producer: { id: "x", revision: "1" } };
    return Object.freeze({ scope: given.scope, intent: given.intent, kind: "exact-deps", status: "applied", discharge, admission: admitDischargeFn(binding, discharge, { at: "t" }) });
  };
  const result = await dischargeSetOfReadyDuties({ root: "/repo", apply: true, limit: 2, scope: "task:exact-deps-pkg-a", repairKind: "exact-deps", work, dischargeFn, planFn });
  const [request] = calls;
  assert.equal(request.apply, true);
  assert.equal(request.limit, 2);
  assert.equal(request.scope, "task:exact-deps-pkg-a");
  assert.equal(request.kind, "exact-deps");
  assert.equal(result.ok, true);
  assert.equal(work.discharges.length, 1);
  assert.equal(work.discharges[0].scope, "task:exact-deps-pkg-a");
  assert.deepEqual(result.duties[0].admission, { appended: 1, status: "admitted" });
});

test("CLI: --help prints usage and exits 0", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: discharge-set-of-ready-duties/u);
});

test("CLI: npm-style symlink --help prints usage and exits 0", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "discharge-ready-duties-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "discharge-set-of-ready-duties");
  await symlink(SCRIPT, bin);
  const result = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage: discharge-set-of-ready-duties/u);
});

test("CLI: missing --root refuses with exit 1 and a stderr message", () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--root is required/u);
});
