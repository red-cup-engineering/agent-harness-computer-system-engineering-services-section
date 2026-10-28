/**
 * @module agents-md
 * Renders AGENTS.md from records (rule agents-md-is-generated-from-records). A projection record's `agents-md`
 * layout names the file's preamble, its sections in order, each section's heading and text, and the source each
 * section draws on: rules, requirements, a decision queue, carriers or a list held in the record. Every word of
 * the output is a record's; this module holds no text of its own, never clips or rewords a statement, and gives
 * the same bytes for the same records. It is a static file, read once into an agent's cached prompt prefix; no
 * hook projects it per session or per prompt.
 *
 *   house = readProjection({ record, root })   record: the projection record; root: what its paths resolve from
 *   text = renderAgentsMd(house)
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const tryJson = (file) => { try { return readJson(file); } catch { return undefined; } };
const flat = (text) => String(text ?? "").replace(/\s+/gu, " ").trim();
const idOf = (item) => typeof item === "string" ? item : item.id;

/** A record value as text: nested objects are spelled out as `key value` pairs, never `[object Object]`. */
export const spell = (value) => value !== null && typeof value === "object"
  ? Object.entries(value).map(([key, inner]) => `${key} ${spell(inner)}`).join(", ")
  : String(value);

/** The fields a layout must name; each is a parameter of the record, not of this module. */
export const LAYOUT_FIELDS = Object.freeze(["preamble", "sections", "rule-directory", "requirement-directory", "problems-heading"]);

/**
 * The projection record and every record its layout draws on. `problems` lists what the record names and could
 * not be read; they are rendered under the layout's problems heading, never hidden.
 */
export function readProjection({ record, root }) {
  const projection = readJson(record);
  const layout = projection["agents-md"];
  if (layout === undefined) throw new TypeError(`${record} has no "agents-md" layout`);
  const missing = LAYOUT_FIELDS.filter((field) => layout[field] === undefined);
  if (missing.length > 0) throw new TypeError(`${record} "agents-md" layout lacks ${missing.join(", ")}`);
  const problems = [];
  const load = (directory, id, kind) => {
    const value = tryJson(path.resolve(root, directory, `${id}.json`));
    if (value === undefined) problems.push(`${kind} ${id} is named by ${path.basename(record)} and not found in ${directory}`);
    return value;
  };
  const rules = new Map();
  for (const topic of projection.rules ?? []) for (const item of topic.items ?? []) {
    const id = idOf(item);
    if (!rules.has(id)) { const rule = load(layout["rule-directory"], id, "rule"); if (rule) rules.set(id, rule); }
  }
  const requirements = new Map();
  for (const { id } of projection.requirements ?? []) { const requirement = load(layout["requirement-directory"], id, "requirement"); if (requirement) requirements.set(id, requirement); }
  let queue;
  if (projection["decision-queue"] !== undefined) {
    queue = tryJson(path.resolve(root, projection["decision-queue"]));
    if (queue === undefined) problems.push(`decision queue ${projection["decision-queue"]} is not readable`);
  }
  return Object.freeze({ projection, layout, rules, requirements, queue, problems });
}

const isDeferred = (item) => /^deferred/iu.test(item.state ?? "");
const isClosed = (item) => /^(done|closed)/iu.test(item.state ?? "");

/** One renderer per source a section may draw on; each returns the section's body lines. */
export const SOURCES = Object.freeze({
  rules: ({ projection, rules }) => (projection.rules ?? []).flatMap((topic) => [
    `### ${topic.topic}`, "",
    ...(topic.items ?? []).map(idOf).filter((id) => rules.has(id)).map((id) => `- [${id}] ${flat(rules.get(id).statement)}`), "",
  ]),
  requirements: ({ projection, requirements }) => (projection.requirements ?? []).filter(({ id }) => requirements.has(id)).map(({ id, topic }) => {
    const requirement = requirements.get(id);
    const body = requirement.budget ? Object.entries(requirement.budget).map(([key, value]) => `${key} ${spell(value)}`).join("; ") : flat(requirement.statement ?? "");
    return `- ${topic ?? requirement.name}${body ? `: ${body}` : ""} [requirement ${id}]`;
  }),
  "decision-queue": ({ queue }) => [
    ...(queue?.items ?? []).filter(isDeferred).map((item) => `- ${item.id}: ${flat(item.state)}`),
    ...(queue?.items ?? []).filter((item) => !isDeferred(item) && !isClosed(item)).map((item) => `- ${item.id}`),
  ],
  carriers: ({ projection }) => (projection.carriers ?? []).map((carrier) => `- ${carrier.repo}#${carrier.number}${carrier.binds ? `: ${carrier.binds}` : ""}`),
  list: (house, section) => (section.items ?? []).map((item, index) => `${index + 1}. ${flat(item)}`),
});

/** AGENTS.md as text, ending in one newline. */
export function renderAgentsMd(house) {
  const { layout, problems } = house;
  const lines = [...layout.preamble, ""];
  for (const section of layout.sections) {
    const source = SOURCES[section.from];
    if (source === undefined) throw new TypeError(`agents-md section "${section.heading}" draws on unknown source ${section.from}; known: ${Object.keys(SOURCES).join(", ")}`);
    lines.push(`## ${section.heading}`, "");
    if (section.text) lines.push(flat(section.text), "");
    lines.push(...source(house, section), "");
  }
  if (problems.length > 0) lines.push(`## ${layout["problems-heading"]}`, "", ...problems.map((problem) => `- ${problem}`), "");
  return `${lines.join("\n").replace(/\n{3,}/gu, "\n\n").trimEnd()}\n`;
}
