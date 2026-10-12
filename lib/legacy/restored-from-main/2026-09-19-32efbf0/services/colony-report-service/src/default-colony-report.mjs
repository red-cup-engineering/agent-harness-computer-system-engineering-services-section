// Wraps collectColonyReport() as the digest-bound `ColonyCivicIntervalReport`
// contract a union report team subscribes to. No providers are wired in here
// and no colony is compiled in: callers pass whichever provider objects they
// have and the `colonyKind` whose identity the report carries. This is pure
// projection -- no filesystem effect -- so it stays in src/; saving a report
// to disk and reading the latest one back are a separate single effect, in
// ./scripts/save-and-read-colony-report.mjs, alongside the house effect
// owners that perform them.

import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { colonyActorIdentity, collectColonyReport } from "./colony-report.mjs";

// collectColonyReport()'s own Metric shape (`{ id, label, amount, unit, ...extra }`)
// doesn't carry `domain`/`kind`/`displayOrder` — fields the ColonyCivicIntervalReport
// contract requires (see @coesite-operations/union-report-team's collectUnionReport(),
// which groups metrics by `{ id, label, unit, domain, kind, displayOrder }` and sorts
// the aggregated result by `displayOrder`, so an undefined value there would either
// throw digesting the group key or break the final sort). This derives those three
// fields for each raw metric: `domain` from the "events-by-domain/<domain>" id when
// present, else the catch-all "operations" domain (a real DOMAINS member, used for
// every cross-cutting/summary metric that isn't about one specific domain); `kind`
// is "stock" exactly when the metric carries the stock-only `status` field that
// colony-report.mjs's own metric() attaches, else "flow"; `displayOrder` is each
// metric's position in collectColonyReport()'s own deterministic emission order.
function civicMetric(rawMetric, displayOrder) {
  const domain = rawMetric.id.startsWith("events-by-domain/") ? rawMetric.id.slice("events-by-domain/".length) : "operations";
  const kind = rawMetric.status !== undefined ? "stock" : "flow";
  return { ...rawMetric, domain, kind, displayOrder };
}

// The `identifyJsonSemanticContent` digest is objectKind-bound: hashing the
// same value under two different objectKind strings produces two different
// ids. `@coesite-operations/union-report-team`'s `collectUnionReport()`
// re-derives each admitted colony report's `reportDigest`/`cursorDigest`
// itself, hashed under its own fixed objectKind, `"union-report.record"`
// (see its `src/union-report.mjs`), and refuses any colony report whose
// digest doesn't match that recomputation. So a colony report only round-
// trips as "accepted" by that subscriber if it was digest-bound under the
// exact same objectKind — hence the default below.
function digest(value, objectKind = "union-report.record") {
  return identifyJsonSemanticContent({ objectKind, value, witnessRoot: EMPTY_WITNESS_ROOT }).id;
}

/**
 * Wraps collectColonyReport() into the digest-bound `ColonyCivicIntervalReport`
 * contract shape expected by contracted colony-report subscribers (e.g. the
 * `DEFAULT_COLONY_SUBSCRIPTIONS` entries in
 * `@coesite-operations/union-report-team`'s `default-union-report.mjs`): one
 * report naming the `colonyKind`'s own actor identity and its report team's,
 * with a digest-bound replay cursor, plus the aggregated events, stocks, and
 * metrics from `collectColonyReport`.
 */
export async function collectColonyIntervalReport({ colonyKind, window, recordedAt, providers = [], digestObjectKind = "union-report.record" }) {
  const { colonyActor, colonyReportTeamActor } = colonyActorIdentity(colonyKind);
  const report = await collectColonyReport({ window, recordedAt, providers });
  // Echo the caller's own `window` object verbatim (not `report.window`,
  // which `collectColonyReport`'s `reportingWindow()` normalizes down to
  // just `{ fromExclusive, toInclusive }`, dropping any other fields such as
  // a `baseline` flag). Callers like `@coesite-operations/union-report-team`
  // digest-compare this report's `window` against the exact window object
  // they passed in, so silently dropping fields here would always fail that
  // comparison.
  const cursorBody = {
    type: "ColonyReportReplayCursor",
    version: 1,
    colonyActor,
    window,
    responseDigests: report.responses.map((response) => digest(response, digestObjectKind)).sort(),
  };
  const cursor = { ...cursorBody, cursorDigest: digest(cursorBody, digestObjectKind) };
  const body = {
    type: "ColonyCivicIntervalReport",
    schemaVersion: 1,
    actor: colonyReportTeamActor,
    colonyActor,
    colonyKind,
    recordedAt: report.recordedAt,
    window,
    cursor,
    responses: report.responses,
    events: report.events,
    stocks: report.stocks,
    metrics: report.metrics.map((rawMetric, index) => civicMetric(rawMetric, index)),
    coverage: { admitted: report.coverage.providers, accepted: report.coverage.ok, refused: report.coverage.failed },
  };
  return { ...body, reportDigest: digest(body, digestObjectKind) };
}
