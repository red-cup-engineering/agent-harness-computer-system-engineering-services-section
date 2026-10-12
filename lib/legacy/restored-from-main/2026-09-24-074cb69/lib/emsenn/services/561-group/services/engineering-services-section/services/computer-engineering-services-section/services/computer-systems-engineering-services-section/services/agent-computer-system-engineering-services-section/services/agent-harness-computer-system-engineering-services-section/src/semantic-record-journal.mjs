// createSemanticRecordJournal, folded local to this package.
//
// The historical @red-cup-engineering/semantic-record-journal-service package
// (and, before it, the same capability under witness-journal-services-section)
// is gone: its content-addressed row format now lives only inside the seavt
// chain (eavt-services-section/seavt-services-section), which this house's
// current writing rules put off limits to new imports. This module owns a
// small, self-contained reproduction of the on-disk shape this package's own
// consumers (this package's own writers, and lagoon's fold-harness-lifecycle,
// which reads the raw witness-journal-seavt.jsonl feed directly) already
// depend on: one JSONL row per fact, `{e, a, v, t}`, with e/a/v encoded as
// Relation Model Notation JSON terms and t a plain ISO timestamp string,
// partitioned by date under `<root>/data/logs/<YYYY>/<MM>/<DD>/`.
//
// It uses only Node builtins and the notation's own (non-off-limits) json
// codec — nothing from eavt-services-section or seavt-services-section.
// This module stands in for seavt's own journal until the seavt section
// exports createSemanticRecordJournal itself; fold this back onto that
// export then, rather than growing this stand-in further.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { jsonToTerm, termToJson } from "@red-cup-engineering/computer-code-engineering-services-section/semiotic-expression-notation/json-codec";
import { canonicalJsonValue as canonicalize } from "@red-cup-engineering/json-services-section/canonical-json";

const FEED_FILE_NAME = "witness-journal-seavt.jsonl";

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`Semantic record journal ${label} is required`);
  return value.trim();
}

function axes(charge) {
  if (!charge || Object.getPrototypeOf(charge) !== Object.prototype || typeof charge.support !== "boolean" || typeof charge.refutation !== "boolean") {
    throw new TypeError("Semantic record journal charge requires independent support and refutation booleans");
  }
  return charge;
}

function requiredRelation(relation) {
  if (!relation || Object.getPrototypeOf(relation) !== Object.prototype
    || !Object.hasOwn(relation, "subject") || !Object.hasOwn(relation, "predicate") || !Object.hasOwn(relation, "object")) {
    throw new TypeError("Semantic record journal relation requires subject, predicate, and object");
  }
  return relation;
}

// A term round-trip (jsonToTerm at write time, termToJson at query time)
// rebuilds an object's keys in the notation's own canonical (alphabetical)
// order. The written content id must be computed the same way at both ends,
// or a query's re-derived id from its own decoded value would never match
// the id recorded at write time. This is a plain recursive key sort, not the
// notation's own canonical form — it only needs to be self-consistent here.
/** Content id for one (objectKind, value) pair. Stable within this process and across runs. */
function contentId(objectKind, value) {
  const digest = createHash("sha256").update(JSON.stringify({ objectKind, value: canonicalize(value) })).digest("hex");
  return `ni:///sha-256;${digest}`;
}

function datePrefix(recordedAt) {
  const text = typeof recordedAt === "string" ? recordedAt : "";
  return /^\d{4}-\d{2}-\d{2}/u.test(text) ? text.slice(0, 10) : "0000-00-00";
}

function feedPathFor(root, recordedAt) {
  return join(root, "data", "logs", ...datePrefix(recordedAt).split("-"), FEED_FILE_NAME);
}

function feedFilesBelow(root) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name === FEED_FILE_NAME) found.push(path);
    }
  };
  walk(join(root, "data", "logs"));
  return found.sort();
}

function appendRowIfAbsent(path, row) {
  const line = JSON.stringify(row);
  const existing = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((text) => text !== "") : [];
  if (existing.includes(line)) return false;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${line}\n`, "utf8");
  return true;
}

export function createSemanticRecordJournal({ root, objectKind: defaultObjectKind }) {
  const custodyRoot = resolve(requiredText(root, "root"));

  function record({ objectKind, category, record: value, recordedAt, charge, relation }) {
    const kind = requiredText(objectKind ?? defaultObjectKind, "objectKind");
    const observed = axes(charge);
    const at = requiredText(recordedAt, "recordedAt");
    const id = contentId(kind, value);
    const path = feedPathFor(custodyRoot, at);
    let appended = 0;
    if (appendRowIfAbsent(path, { e: jsonToTerm(id), a: jsonToTerm(requiredText(category, "category")), v: jsonToTerm(value), t: at })) appended += 1;
    if (relation !== undefined) {
      const { subject, predicate, object } = requiredRelation(relation);
      if (appendRowIfAbsent(path, { e: jsonToTerm(subject), a: jsonToTerm(predicate), v: jsonToTerm(object), t: at })) appended += 1;
    }
    return Object.freeze({ id, objectKind: kind, appended, charge: Object.freeze({ ...observed }) });
  }

  function query({ objectKind, category }) {
    const kind = requiredText(objectKind ?? defaultObjectKind, "objectKind");
    const requestedCategory = requiredText(category, "category");
    const records = [];
    for (const path of feedFilesBelow(custodyRoot)) {
      const lines = readFileSync(path, "utf8").split("\n").filter((text) => text !== "");
      for (const line of lines) {
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        if (!row || typeof row !== "object" || !Object.hasOwn(row, "a") || !Object.hasOwn(row, "e") || !Object.hasOwn(row, "v")) continue;
        let rowCategory, id, value;
        try { rowCategory = termToJson(row.a); id = termToJson(row.e); value = termToJson(row.v); } catch { continue; }
        if (rowCategory !== requestedCategory) continue;
        // A feed also holds direct relation facts, which may legitimately
        // share this category's predicate name. Only a row whose own e is
        // this content's own identity is this category's record projection.
        if (contentId(kind, value) !== id) continue;
        records.push(Object.freeze({ id, objectKind: kind, category: requestedCategory, recordedAt: row.t, record: value }));
      }
    }
    return Object.freeze(records);
  }

  return Object.freeze({ root: custodyRoot, record, query });
}
