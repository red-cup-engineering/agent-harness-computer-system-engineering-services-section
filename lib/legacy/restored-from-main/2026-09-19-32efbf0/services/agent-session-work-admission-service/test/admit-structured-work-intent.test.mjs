import test from "node:test";
import assert from "node:assert/strict";
import { admitStructuredWorkIntentDocument } from "../scripts/admit-structured-work-intent.mjs";

const FAKE_BINDING = { dataRoot: "/fake/agent-work-root" };

function fakeRail() {
  const admits = [];
  const allocations = [];
  return {
    kind: "filesystem",
    binding: FAKE_BINDING,
    admitFn: (binding, intent, options) => { admits.push({ binding, intent, options }); return { appended: intent.items.length, status: "admitted" }; },
    admitAllocationFn: (binding, allocation, options) => { allocations.push({ binding, allocation, options }); return { appended: 3, status: "admitted" }; },
    admits,
    allocations,
    close: async () => {},
  };
}

const INTENT = {
  kind: "agent-work.structured-intent",
  id: "2026-09-06-example",
  producer: { id: "test" },
  sources: [{ id: "src", kind: "founder-utterance-record" }],
  items: [
    { cell: "endeavor:ops-561-group", text: "e", evidence: ["README.md"], provenance: [{ source: "src" }] },
    { cell: "campaign:c", parent: "endeavor:ops-561-group", text: "c", evidence: ["README.md"], provenance: [{ source: "src" }] },
    { cell: "project:p", parent: "campaign:c", text: "p", evidence: ["README.md"], provenance: [{ source: "src" }] },
    { cell: "plan:pl", parent: "project:p", text: "pl", evidence: ["README.md"], provenance: [{ source: "src" }] },
    { cell: "task:t1", parent: "plan:pl", text: "t1", evidence: ["README.md"], provenance: [{ source: "src" }] },
    { cell: "task:t2", parent: "plan:pl", text: "t2", evidence: ["README.md"], provenance: [{ source: "src" }] },
  ],
};

test("admitStructuredWorkIntentDocument admits the intent once and allocates each task cell", async () => {
  const work = fakeRail();
  const result = await admitStructuredWorkIntentDocument({ intent: INTENT, work, office: "office:test", actor: "actor:test", duty: "duty:test", now: () => new Date("2026-09-06T12:00:00.000Z") });
  assert.equal(work.admits.length, 1);
  assert.equal(work.admits[0].options.subject, "structured-work-intent-2026-09-06-example");
  assert.equal(work.admits[0].options.at, "2026-09-06T12:00:00.000Z");
  assert.deepEqual(work.allocations.map((a) => a.allocation.allocation.scope), ["task:t1", "task:t2"]);
  assert.deepEqual(result, { intentId: "2026-09-06-example", appended: 6, status: "admitted", allocated: 2, allocationsAppended: 6 });
});

test("admitStructuredWorkIntentDocument refuses a document that is not a structured intent", async () => {
  await assert.rejects(() => admitStructuredWorkIntentDocument({ intent: { kind: "other" }, work: fakeRail() }), TypeError);
});
