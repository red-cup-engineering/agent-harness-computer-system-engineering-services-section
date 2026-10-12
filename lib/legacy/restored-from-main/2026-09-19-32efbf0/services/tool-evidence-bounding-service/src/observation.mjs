import { createSemanticRecordJournal } from "@red-cup-engineering/semantic-record-journal-service";
import { stateRoot } from "./state-root.mjs";

// Generic observation trajectory for this package's own evidence store. A
// caller that already owns a trajectory journal (an enterprise, an office)
// supplies `options.appendObservation` to record through its own journal and
// category instead of this package's default.
export function appendObservation(body, options = {}) {
  if (typeof options.appendObservation === "function") return options.appendObservation(body, options);
  const journal = createSemanticRecordJournal({ root: stateRoot(options), objectKind: "tool-evidence.material" });
  const receipt = journal.record({
    category: "tool-evidence.trajectory",
    record: body,
    recordedAt: body.observedAt ?? new Date().toISOString(),
    charge: { support: false, refutation: false },
  });
  return Object.freeze({ record: Object.freeze({ id: receipt.id, ...body }), duplicate: receipt.appended === false });
}
