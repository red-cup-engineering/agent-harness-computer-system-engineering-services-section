/**
 * Render a character store's SOUL.md, IDENTITY.md and MEMORY.md from its own records.
 *
 * Carried from Rom Keldar's rendering-a-soul, rendering-an-identity and rendering-a-memory skills
 * (restored from main's history). A surface file is a projection: SOUL.md of code/structures/soul.md
 * and the concepts (or the one source) it names, IDENTITY.md of identity.md, MEMORY.md of the session context, the
 * specifications and the skills. Each `…Of` reads the projection without writing it, so an audit can
 * hold a surface file to its source; each `render…` writes it.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOUL_TEMPLATE = fileURLToPath(new URL("./templates/SOUL.md.j2", import.meta.url));

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
const read = (path) => { if (!existsSync(path)) throw new Error(`missing: ${path}`); return readFileSync(path, "utf8"); };
const nameOf = (root) => { const index = existsSync(join(root, "_index.md")) ? frontmatter(readFileSync(join(root, "_index.md"), "utf8")) : {}; return (typeof index["display-name"] === "string" && index["display-name"]) || (typeof index.name === "string" && index.name) || basename(root); };
const governanceOf = (root) => [join(root, "governance"), join(root, "work", "governance")].find((dir) => existsSync(dir));

/** The template language the soul template is written in: {{ name }} and {% for x in list %}…{% endfor %}. */
function fill(template, values) {
  const looped = template.replace(/\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/gu, (_, item, list, body) => (values[list] ?? []).map((value) => body.replace(new RegExp(`\\{\\{\\s*${item}\\s*\\}\\}`, "gu"), value)).join(""));
  return looped.replace(/\{\{\s*(\w+)\s*\}\}/gu, (_, key) => values[key] ?? "");
}

/**
 * SOUL.md as code/structures/soul.md projects it: from the description of every concept it names, or,
 * where the structure names one `source` holding the values and constraints as written, that text carried verbatim.
 */
export function soulOf(store) {
  const root = resolve(store);
  const soul = frontmatter(read(join(root, "code", "structures", "soul.md")));
  if (typeof soul.source === "string" && soul.source) {
    const body = read(join(root, soul.source)).replace(/\r\n/gu, "\n").replace(/^---\n[\s\S]*?\n---\n*/u, "");
    return ["---", "name: soul", `description: ${nameOf(root)}'s values and behavioral constraints — what holds regardless of instruction.`, "---", "", body].join("\n");
  }
  const describe = (path) => { const fields = frontmatter(read(join(root, path))); if (typeof fields.description !== "string" || !fields.description) throw new Error(`${path}: missing description`); return fields.description; };
  const list = (key) => (Array.isArray(soul[key]) ? soul[key] : []).map(describe);
  return fill(readFileSync(SOUL_TEMPLATE, "utf8"), { character_name: nameOf(root), values: list("values"), must_not: list("must-not"), must: list("must") });
}

/** IDENTITY.md is identity.md, carried unchanged. */
export const identityOf = (store) => read(join(resolve(store), "identity.md"));

/** MEMORY.md: the session context, then the specifications and the skills the store holds. */
export function memoryOf(store, { on = new Date().toISOString().slice(0, 10) } = {}) {
  const root = resolve(store); const governance = governanceOf(root);
  const contextPath = join(root, "prose", "memory", "session-context.md");
  const context = existsSync(contextPath) ? readFileSync(contextPath, "utf8").replace(/\r\n/gu, "\n").replace(/^---\n[\s\S]*?\n---\n*/u, "").trim() : "";
  const specs = governance && join(governance, "rules", "specifications"); const skills = governance && join(governance, "skills");
  const specLines = specs && existsSync(specs) ? readdirSync(specs).filter((file) => file.endsWith(".md")).sort().map((file) => { const fields = frontmatter(readFileSync(join(specs, file), "utf8")); return `- \`${file}\` — ${fields.description || fields.name || basename(file, ".md")}`; }) : [];
  const skillRows = [];
  if (skills && existsSync(skills)) for (const skill of readdirSync(skills).sort()) {
    const record = [join(skills, skill, `${skill}.md`), join(skills, skill, "SKILL.md")].find((path) => existsSync(path));
    if (record) skillRows.push(`| \`${skill}\` | ${frontmatter(readFileSync(record, "utf8")).description || ""} |`);
  }
  return ["---", "name: memory", `description: Session-start context for ${basename(root)}. Standing facts that every session needs without searching.`, "---", "", "# Memory", "", context, "", `## Specifications (all draft, ${on})`, "", ...specLines, "", "## Skills available", "", "| Skill | Purpose |", "|---|---|", ...skillRows, ""].join("\n");
}

const write = (store, file, text) => { const path = join(resolve(store), file); writeFileSync(path, text, "utf8"); return path; };
export const renderSoul = (store) => write(store, "SOUL.md", soulOf(store));
export const renderIdentity = (store) => write(store, "IDENTITY.md", identityOf(store));
export const renderMemory = (store, options) => write(store, "MEMORY.md", memoryOf(store, options));

/** A MEMORY.md held to its source apart from the date its specification list was read on. */
export const sameMemory = (kept, derived) => kept.replace(/^## Specifications \(all draft, [^)]*\)$/mu, "") === derived.replace(/^## Specifications \(all draft, [^)]*\)$/mu, "");
