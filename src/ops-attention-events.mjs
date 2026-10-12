// One local adapter projection of a harness's own lifecycle journal into the
// attention-event shape an operations endpoint consumes. It reads the journal
// and renames nothing: every event body is carried through unchanged, tagged
// with the recording journal's own identity for that event.
//
// The contract name, its version, and the source label are parameters, because
// which operations endpoint is being fed and which harness is feeding it are
// facts about a deployment, not about this journal.
import {
  PROVIDER_COMMISSIONED_CATEGORY,
  SKILL_SELECTED_CATEGORY,
  lifecycleEventsAt,
} from "./harness-lifecycle.mjs";

export const DEFAULT_ATTENTION_EVENT_CONTRACT = Object.freeze({
  type: "ops.561.group/harness-attention-event",
  version: 1,
  disposition: "local-adapter-only",
});

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is required`);
  return value.trim();
}

/**
 * Project the skill-selection and provider-commission events one harness
 * recorded into ordered attention events for an operations endpoint.
 *
 * @param {{root: string, source: string, contract?: object, actor?: string}} options
 *   `source` names the harness these events came from; `actor` optionally
 *   restricts the projection to one recorded actor.
 */
export function projectOpsHarnessAttentionEvents({ root, source, contract = DEFAULT_ATTENTION_EVENT_CONTRACT, actor } = {}) {
  const label = requiredText(source, "source");
  const events = lifecycleEventsAt(root, [SKILL_SELECTED_CATEGORY, PROVIDER_COMMISSIONED_CATEGORY])
    .filter(({ record }) => actor === undefined || record.actor === actor)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  return Object.freeze(events.map(({ id, recordedAt, record }) => Object.freeze({
    contract,
    source: label,
    sourceEvent: id,
    observedAt: recordedAt,
    event: record,
  })));
}
