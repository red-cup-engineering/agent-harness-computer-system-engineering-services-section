import assert from "node:assert/strict";
import test from "node:test";
import { admitSessionFinding } from "../src/finding-events.mjs";
import { foldFindingEvents, projectFindings, recallFindingStatus } from "../src/finding-snapshot.mjs";

test("admits and folds charged findings from supplied events", () => {
  const potential = admitSessionFinding({ session: "s1", subject: "migration/scripts", predicate: "is-owned", charge: "potential", evidence: ["test"] }, { at: "2026-08-30T00:00:00.000Z" });
  const active = admitSessionFinding({ session: "s1", subject: ["migration", "scripts"], predicate: "is-not-owned", charge: "active" }, { at: "2026-08-30T00:01:00.000Z" });
  const snapshot = foldFindingEvents([potential.event, active.event], { generatedAt: "2026-08-30T00:02:00.000Z" });
  assert.equal(snapshot.findingCount, 2);
  assert.equal(recallFindingStatus(snapshot.findings, "s1", ["migration", "scripts"]), "stable");
  assert.equal(projectFindings(snapshot, { session: "s1", subject: "migration" }).findings.length, 2);
});

test("refuses findings outside the four-charge carrier", () => {
  assert.throws(() => admitSessionFinding({ session: "s1", subject: "x", predicate: "p", charge: "true" }, { at: "2026-08-30T00:00:00.000Z" }), /charge must be one of/u);
});
