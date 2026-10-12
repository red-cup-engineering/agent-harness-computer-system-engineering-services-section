// The standing work chain and the allocation model every admitter in this
// service shares. Nothing here names a machine, a host, or an actor: the
// allocating office and incumbent actor are parameters, read from the
// calling harness's own policy record (see {@link readAllocationIdentity}).
export const CHAIN_ITEMS = Object.freeze([
  Object.freeze({
    cell: "endeavor:ops-561-group",
    text: "ops.561.group: the ERP/ICS control plane for agents and humans, earned through metroplat, earned through FAE, LAGOON, and MARSH.",
  }),
  Object.freeze({
    cell: "campaign:internal-compute-market",
    parent: "endeavor:ops-561-group",
    text: "Sell every compute on the internal market, buy it from ourselves, track all resources; the Web-signal MAPE-K loop is its first customer.",
  }),
  Object.freeze({
    cell: "project:core-stability",
    parent: "campaign:internal-compute-market",
    text: "Get the core stable: one RMN grammar and runtime across every active consumer, SEAVT strata realized, every cited theorem checked by command, every manifest true, every pin exact and existing on the registry.",
  }),
  Object.freeze({
    cell: "plan:2026-09-03-core-stability",
    parent: "project:core-stability",
    text: "This week's plan: land the RMN repin campaign green and committed; publish the reader repin train; make the Lean package manifest true; gate every theorem citation with the audit die on GitHub Actions.",
  }),
]);

export const PLAN_CELL = "plan:2026-09-03-core-stability";

/**
 * The office and incumbent actor an allocation is charged to, read off an
 * already-parsed harness policy record. Every admitter takes this as a
 * parameter so no actor address is ever welded into code.
 *
 * @param {object} policy - a harness policy naming `actor` and `rootOffice`.
 * @param {string} [label] - what to name in a refusal.
 * @returns {{actor: string, office: string}}
 * @throws {Error} when the record names neither.
 */
export function allocationIdentityOf(policy, label = "the harness policy") {
  if (typeof policy?.actor !== "string" || policy.actor === "") throw new Error(`${label} names no actor`);
  if (typeof policy.rootOffice !== "string" || policy.rootOffice === "") throw new Error(`${label} names no rootOffice`);
  return Object.freeze({ actor: policy.actor, office: policy.rootOffice });
}

/**
 * The deterministic allocation id for one task cell.
 * @param {string} taskCell
 * @returns {string}
 */
export function allocationIdFor(taskCell) {
  return `allocation-${taskCell}`;
}

/**
 * One `metroplat.work.agency-work-allocation` payload allocating a task
 * item's scope to the given office and actor, against the structured-work-
 * intent feed subject that declared it. Matches the rail's own schema
 * exactly (no `duty` field: the admission verb's
 * `additionalProperties: false` rejects one).
 * @param {{taskCell: string, subject: string, office: string, actor: string}} options
 * @returns {object}
 */
export function buildTaskAllocation({ taskCell, subject, office, actor }) {
  for (const [name, value] of Object.entries({ taskCell, subject, office, actor })) {
    if (typeof value !== "string" || value.length === 0) throw new TypeError(`buildTaskAllocation: ${name} is required`);
  }
  return {
    kind: "metroplat.work.agency-work-allocation",
    id: allocationIdFor(taskCell),
    subject,
    office: { id: office },
    incumbency: { actor, recognition: "t", induction: "t" },
    allocation: { scope: taskCell, assigner: actor, charge: "t" },
  };
}

/**
 * Admits one allocation per given task item so each shows up on MetroPlat's
 * agent-work-dispatch readout as a ready duty. Idempotent per task:
 * `admitAllocationFn` reports `appended: 0` for a task already allocated
 * under its deterministic id. Shared by every admitter in this service.
 * @param {{tasks: readonly {cell: string}[], subject: string, office: string, actor: string, at: string, binding: object|null, admitAllocationFn: Function}} options
 * @returns {Promise<{allocated: number, allocationsAppended: number}>}
 */
export async function admitAllocationsForTasks({ tasks, subject, office, actor, at, binding, admitAllocationFn }) {
  if (typeof admitAllocationFn !== "function") throw new TypeError("admitAllocationsForTasks: admitAllocationFn is required (a rail's admit verb)");
  let allocationsAppended = 0;
  for (const task of tasks) {
    const allocation = buildTaskAllocation({ taskCell: task.cell, subject, office, actor });
    const admission = await admitAllocationFn(binding, allocation, { at });
    allocationsAppended += admission.appended;
  }
  return { allocated: tasks.length, allocationsAppended };
}

/**
 * Deterministic cell slug: lowercase, non `[a-z0-9-]` runs collapsed to one
 * `-`, leading/trailing `-` trimmed.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}
