/**
 * A character store's work-items, open or settled by witness.
 *
 * A work-item is the trackable entry: it exists because somebody judged the work actionable and
 * committed it to the store. The record carries no status and no assignee; `raised-by` is provenance
 * (who judged it actionable), not who is to do it. A record may never assert its own completion —
 * a record that could would be marking its own homework — so settlement is a witness entry under
 * `## Settlement`: who observed the item settled, when, and what they observed. Open and settled are
 * read off those witnesses, never off a field, and the store's HEARTBEAT.md is rendered from that
 * reading rather than kept by hand.
 *
 * Carried from Rom Keldar's governance skills (making-, settling- and rendering-a-heartbeat), restored
 * from main's history; see legacy-capability-reallocation-service/data/restorations.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export const WORK_ITEMS = join("governance", "work", "items");
const WITNESS = /^- witnessed: .+ — observed: .+$/mu;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const today = () => new Date().toISOString().slice(0, 10);

function frontmatter(text) {
  const match = text.replace(/\r\n/gu, "\n").match(/^---\n([\s\S]*?)\n---/u);
  const fields = {}; let current = null;
  for (const line of match ? match[1].split("\n") : []) {
    if (/^\s*-\s+/u.test(line)) { if (current) (Array.isArray(fields[current]) ? fields[current] : (fields[current] = [])).push(line.replace(/^\s*-\s+/u, "").trim()); continue; }
    const colon = line.indexOf(":");
    if (colon > 0) { const key = line.slice(0, colon).trim(); const value = line.slice(colon + 1).trim(); current = key; fields[key] = value || []; }
  }
  return fields;
}

/** Settled iff the record carries at least one settlement witness. */
export const isSettled = (text) => WITNESS.test(text.replace(/\r\n/gu, "\n"));

/** Every work-item record in a store, each with its open/settled reading. */
export function readWorkItems(store, { items = WORK_ITEMS } = {}) {
  const dir = join(resolve(store), items);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((file) => file.endsWith(".md") && file !== "_index.md").sort().map((file) => {
    const text = readFileSync(join(dir, file), "utf8"); const fields = frontmatter(text);
    return { slug: basename(file, ".md"), name: typeof fields.name === "string" && fields.name ? fields.name : basename(file, ".md"), description: typeof fields.description === "string" ? fields.description : "", file: join(items, file).split("\\").join("/"), settled: isSettled(text), witnesses: text.replace(/\r\n/gu, "\n").split("\n").filter((line) => WITNESS.test(line)) };
  });
}

/** The HEARTBEAT.md a store's work-items derive, without writing it. */
export function heartbeatOf(store, { items = WORK_ITEMS, sources = "emsenn (primary) → predication category theory (secondary) → FARS (tertiary)" } = {}) {
  const root = resolve(store);
  const all = readWorkItems(root, { items }); const open = all.filter((item) => !item.settled);
  const index = existsSync(join(root, "_index.md")) ? frontmatter(readFileSync(join(root, "_index.md"), "utf8")) : {};
  const name = (typeof index["display-name"] === "string" && index["display-name"]) || (typeof index.name === "string" && index.name) || basename(root);
  const lines = ["---", "name: heartbeat", `description: Open work-items in ${name}, derived from settlement witnesses.`, "---", "", `# ${name} — open work-items`, "", "## Sources of truth (read first)", "", `Before acting, derive from: ${sources}.`, ""];
  if (open.length === 0) lines.push(`No open work-items (${all.length} settled). Settled records carry their witnesses in \`${items.split("\\").join("/")}/\`.`);
  else {
    lines.push("## Open work-items", "", "Open means: no settlement witness on the record yet. This list is derived, not asserted.", "");
    for (const item of open) lines.push(`- [ ] **${item.name}** — ${item.description} (\`${item.file}\`)`);
  }
  lines.push("");
  return { text: lines.join("\n"), open: open.length, settled: all.length - open.length };
}

/** Render HEARTBEAT.md from the store's work-items: the open list is derived, not asserted. */
export function renderHeartbeat(store, options = {}) {
  const heartbeat = heartbeatOf(store, options);
  writeFileSync(join(resolve(store), "HEARTBEAT.md"), heartbeat.text, "utf8");
  return heartbeat;
}

/** Commit a new work-item to the store, then re-render its HEARTBEAT. */
export function makeWorkItem(store, slug, description, { dependsOn = [], raisedBy, items = WORK_ITEMS, on = today() } = {}) {
  if (!SLUG.test(slug)) throw new TypeError(`work-item slug must be kebab-case: ${slug}`);
  if (typeof description !== "string" || !description.trim() || description.includes("\n")) throw new TypeError("a work-item needs a one-line description");
  if (typeof raisedBy !== "string" || !raisedBy.trim()) throw new TypeError("a work-item needs raised-by: who judged it actionable");
  const dir = join(resolve(store), items); const path = join(dir, `${slug}.md`);
  if (existsSync(path)) throw new Error(`work-item already exists: ${path}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, ["---", `name: ${slug}`, `description: ${description.trim()}`, `raised: ${on}`, `raised-by: ${raisedBy.trim()}`, ...(dependsOn.length ? ["depends-on:", ...dependsOn.map((item) => `  - ${item}`)] : []), "---", "", `# ${slug}`, ""].join("\n"), "utf8");
  renderHeartbeat(store, { items });
  return path;
}

/** Witness a work-item settled — who observed what, when — then re-render the HEARTBEAT. */
export function settleWorkItem(store, slug, { witnessedBy, observed, on = today(), items = WORK_ITEMS } = {}) {
  if (typeof witnessedBy !== "string" || !witnessedBy.trim()) throw new TypeError("a settlement needs a witness: who observed it");
  if (typeof observed !== "string" || !observed.trim()) throw new TypeError("a settlement needs a readback: what was observed. A witness line with no observation is a status field by another name.");
  if (/\n/u.test(witnessedBy + observed)) throw new TypeError("a settlement witness occupies one line");
  const path = join(resolve(store), items, `${slug}.md`);
  if (!existsSync(path)) throw new Error(`work-item not found: ${path}`);
  const witness = `- witnessed: ${on} by ${witnessedBy.trim()} — observed: ${observed.trim()}`;
  let text = readFileSync(path, "utf8").replace(/\r\n/gu, "\n");
  if (/^## Settlement\s*$/mu.test(text)) text = text.replace(/(^## Settlement\s*\n(?:\s*\n)?(?:- witnessed:.*\n?)*)/mu, (section) => `${section.replace(/\n*$/u, "\n")}${witness}\n`);
  else text = `${text.replace(/\n*$/u, "\n\n")}## Settlement\n\n${witness}\n`;
  writeFileSync(path, text, "utf8");
  renderHeartbeat(store, { items });
  return path;
}

/** The reminder a prompt hook injects while work-items stay open; empty when the board is clean. */
export function openWorkReminder(store, options) {
  const open = readWorkItems(store, options).filter((item) => !item.settled);
  return open.length ? `[Work tracking: ${open.length} open work-item(s): ${open.map((item) => item.name).join(", ")}. If any were finished in this session, settle them with a witnessed readback (who observed what, when), not a status flip.]\n` : "";
}
