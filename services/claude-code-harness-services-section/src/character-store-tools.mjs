/**
 * A character store's tools, as Model Context Protocol tool definitions for the house MCP server.
 *
 * Carried from Rom Keldar's MCP server (restored from main's history), which a session reached instead
 * of reading the store directly: specifications, the audit, the session log, surface files, context
 * retrieval, memory, work-items, resources and the heartbeat. The server itself is the house's
 * (`createMcpServer` in mcp-engineering-services-section); these are its catalogue for one store. Every
 * path a tool writes or reads is confined to the store.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { auditCharacterStore } from "./character-store-audit.mjs";
import { WORK_ITEMS, readWorkItems, renderHeartbeat, settleWorkItem } from "./character-work-items.mjs";

const CATEGORIES = ["user", "feedback", "project", "reference"];
const SURFACES = ["CLAUDE.md", "AGENTS.md", "SOUL.md", "IDENTITY.md", "HEARTBEAT.md", "MEMORY.md", "TOOLS.md", "USER.md", "DREAMS.md"];
const SLUG = { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" };
const text = (value) => ({ content: [{ type: "text", text: value }] });
const failure = (value) => ({ content: [{ type: "text", text: value }], isError: true });
function frontmatter(source) {
  const match = source.replace(/\r\n/gu, "\n").match(/^---\n([\s\S]*?)\n---/u); const fields = {};
  for (const line of match ? match[1].split("\n") : []) { const colon = line.indexOf(":"); if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim(); }
  return fields;
}

/** The session log: one {ts, e, a, v} line per event under code/logs/DATE.jsonl, as the store has always kept it. */
export function logEntry(store, e, a, v, at = new Date()) {
  const dir = join(resolve(store), "code", "logs"); mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${at.toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify({ ts: at.toISOString(), e, a, v })}\n`, "utf8");
}

/** `items` is where this store keeps its work-items (a store may keep them elsewhere than governance/work/items). */
export function characterStoreTools(store, { session = `session:${Date.now()}`, now = () => new Date(), items: storeItems = WORK_ITEMS } = {}) {
  const root = resolve(store);
  const within = (relative) => { const path = resolve(root, relative); if (path !== root && !path.startsWith(root + sep)) throw new RangeError(`outside the store: ${relative}`); return path; };
  const governance = [join(root, "governance"), join(root, "work", "governance")].find((dir) => existsSync(dir)) ?? join(root, "governance");
  const specs = join(governance, "rules", "specifications"); const memory = join(root, "prose", "memory");
  const log = (a, v) => logEntry(root, session, a, v, now());
  const guarded = (handler) => async (args) => { try { return await handler(args ?? {}); } catch (error) { return failure(error.message); } };
  return [
    { name: "list_specs", description: "List all specification slugs and titles.", inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: guarded(() => { log("tool_call", "list_specs"); if (!existsSync(specs)) return text("No specs directory found.");
        return text(readdirSync(specs).filter((file) => file.endsWith(".md")).sort().map((file) => `- ${basename(file, ".md")}: ${readFileSync(join(specs, file), "utf8").match(/^#\s+(.+)$/mu)?.[1] ?? basename(file, ".md")}`).join("\n")); }) },
    { name: "read_spec", description: "Read a specification by slug.", inputSchema: { type: "object", required: ["slug"], properties: { slug: SLUG }, additionalProperties: false },
      handler: guarded(({ slug }) => { log("tool_call", { tool: "read_spec", slug }); const path = join(specs, `${slug}.md`); return existsSync(path) ? text(readFileSync(path, "utf8")) : failure(`Spec not found: ${slug}`); }) },
    { name: "audit", description: "Audit the character store (or another store at `path`) against its specifications.", inputSchema: { type: "object", properties: { path: { type: "string" }, items: { type: "string" } }, additionalProperties: false },
      handler: guarded(({ path, items = path ? WORK_ITEMS : storeItems }) => { log("tool_call", { tool: "audit", path }); const { violations, warnings, results } = auditCharacterStore(path ? resolve(path) : root, { items });
        return text([...results.map(({ level, message }) => `  ${level}  ${message}`), `\n${violations} violation(s), ${warnings} warning(s).`].join("\n")); }) },
    { name: "log_event", description: "Record a session event in the store's log.", inputSchema: { type: "object", required: ["type", "description"], properties: { type: { type: "string" }, description: { type: "string" }, context: { type: "string" } }, additionalProperties: false },
      handler: guarded(({ type, description, context }) => { log("session_event", { type, description, context }); return text(`Logged: [${type}] ${description}`); }) },
    { name: "get_surface_files", description: "List the surface files present at the store root.", inputSchema: { type: "object", properties: {}, additionalProperties: false },
      handler: guarded(() => { log("tool_call", "get_surface_files"); const found = SURFACES.filter((file) => existsSync(join(root, file)) && statSync(join(root, file)).isFile()); return text(found.length ? found.map((file) => `- ${file}`).join("\n") : "No surface files."); }) },
    { name: "retrieve_context", description: "Search memory, structures and concepts for content matching a query.", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
      handler: guarded(({ query, limit = 5 }) => {
        log("tool_call", { tool: "retrieve_context", query }); const terms = query.toLowerCase().split(/\s+/u).filter(Boolean); const results = [];
        for (const [dir, label] of [[memory, "memory"], [join(root, "code", "structures"), "structure"], [join(root, "prose", "concepts"), "concept"], [join(root, "prose", "teaching", "explanations"), "concept"]]) {
          if (!existsSync(dir)) continue;
          for (const file of readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
            const source = readFileSync(join(dir, file), "utf8"); const score = terms.filter((term) => source.toLowerCase().includes(term)).length;
            if (score > 0) { const fields = frontmatter(source); results.push({ score, label, name: fields.name || file, description: fields.description || "" }); }
          }
        }
        results.sort((a, b) => b.score - a.score);
        const top = results.slice(0, limit); return text(top.length ? top.map((result) => `[${result.label}] ${result.name}: ${result.description}`).join("\n") : "No matching content.");
      }) },
    { name: "save_memory", description: "Save a memory entry to prose/memory/<category>/<slug>.md.", inputSchema: { type: "object", required: ["category", "slug", "content"], properties: { category: { enum: CATEGORIES }, slug: SLUG, content: { type: "string" } }, additionalProperties: false },
      handler: guarded(({ category, slug, content }) => { const path = within(join("prose", "memory", category, `${slug}.md`)); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content, "utf8"); log("memory_write", { category, slug }); return text(`Saved: prose/memory/${category}/${slug}.md`); }) },
    { name: "read_memory", description: "List memory categories and entries, or read one entry.", inputSchema: { type: "object", properties: { category: { enum: CATEGORIES }, slug: SLUG }, additionalProperties: false },
      handler: guarded(({ category, slug }) => {
        log("memory_read", { category, slug });
        const entries = (dir) => (existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".md")).sort().map((file) => basename(file, ".md")) : []);
        if (!category) { const lines = CATEGORIES.map((name) => [name, entries(join(memory, name))]).filter(([, list]) => list.length).map(([name, list]) => `${name}: ${list.join(", ")}`); return text(lines.length ? lines.join("\n") : "No memory entries."); }
        if (!slug) { const list = entries(join(memory, category)); return text(list.length ? list.join("\n") : `No entries in ${category}.`); }
        const path = join(memory, category, `${slug}.md`); return existsSync(path) ? text(readFileSync(path, "utf8")) : failure(`Not found: ${category}/${slug}`);
      }) },
    { name: "write_memory", description: "Create a dated episodic memory entry, prose/memory/DATE-<slug>.md.", inputSchema: { type: "object", required: ["slug", "description"], properties: { slug: SLUG, description: { type: "string" }, content: { type: "string" } }, additionalProperties: false },
      handler: guarded(({ slug, description, content = "" }) => {
        if (description.includes("\n")) throw new TypeError("a memory description is one line");
        const name = `${now().toISOString().slice(0, 10)}-${slug}`; const path = within(join("prose", "memory", `${name}.md`));
        if (existsSync(path)) throw new Error(`memory already exists: prose/memory/${name}.md`);
        mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, ["---", `name: ${name}`, `description: ${description}`, "---", "", content, ""].join("\n"), "utf8");
        log("memory_write", { type: "episodic", slug }); return text(`Created: prose/memory/${name}.md`);
      }) },
    { name: "list_work_items", description: "List work-items; open or settled is read off settlement witnesses, never a status field.", inputSchema: { type: "object", properties: { state: { enum: ["open", "settled"] }, items: { type: "string" } }, additionalProperties: false },
      handler: guarded(({ state, items = storeItems }) => { log("tool_call", { tool: "list_work_items", state }); const lines = readWorkItems(root, { items }).filter((item) => !state || (item.settled ? "settled" : "open") === state).map((item) => `- [${item.settled ? "settled" : "open"}] ${item.slug}: ${item.description}`); return text(lines.length ? lines.join("\n") : `No work-items${state ? ` ${state}` : ""}.`); }) },
    { name: "settle_work_item", description: "Witness a work-item settled (who observed what, when) and re-render HEARTBEAT; the record never asserts its own completion.", inputSchema: { type: "object", required: ["slug", "witnessed_by", "observed"], properties: { slug: SLUG, witnessed_by: { type: "string" }, observed: { type: "string" }, items: { type: "string" } }, additionalProperties: false },
      handler: guarded(({ slug, witnessed_by, observed, items = storeItems }) => { within(items); settleWorkItem(root, slug, { witnessedBy: witnessed_by, observed, on: now().toISOString().slice(0, 10), items }); log("work_item_settled", { slug, witnessed_by }); return text(`Settlement witnessed on ${slug}; HEARTBEAT regenerated.`); }) },
    { name: "create_resource", description: "Create a Markdown resource with minimal frontmatter at a path inside the store.", inputSchema: { type: "object", required: ["path", "name", "description"], properties: { path: { type: "string" }, name: { type: "string" }, description: { type: "string" }, extra: { type: "object", additionalProperties: { type: "string" } } }, additionalProperties: false },
      handler: guarded(({ path: relative, name, description, extra = {} }) => {
        const path = within(relative); if (existsSync(path)) return failure(`Already exists: ${relative}`);
        if (/\n/u.test(name + description + Object.values(extra).join(""))) throw new TypeError("frontmatter values are one line");
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, ["---", `name: ${name}`, `description: ${description}`, ...Object.entries(extra).map(([key, value]) => `${key}: ${value}`), "---", "", `# ${name}`, ""].join("\n"), "utf8");
        log("tool_call", { tool: "create_resource", path: relative, name }); return text(`Created: ${relative}`);
      }) },
    { name: "regenerate_heartbeat", description: "Re-render HEARTBEAT.md from the work-items' settlement witnesses.", inputSchema: { type: "object", properties: { items: { type: "string" } }, additionalProperties: false },
      handler: guarded(({ items = storeItems }) => { within(items); const { open, settled } = renderHeartbeat(root, { items }); log("tool_call", "regenerate_heartbeat"); return text(`HEARTBEAT.md regenerated: ${open} open, ${settled} settled.`); }) },
  ];
}
