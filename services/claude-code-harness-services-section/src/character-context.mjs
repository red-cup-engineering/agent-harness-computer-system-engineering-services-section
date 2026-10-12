/**
 * Compile a character store's context for a prompt.
 *
 * Carried from Rom Keldar's compiling-context hook (restored from main's history). Context is
 * assembled in lanes, before the model reads the prompt: the soul structure in full (lane 1); the
 * behavior concepts whose name or description terms appear in the prompt (lane 4); the most recent
 * episodic memory entries (lane 5); and the lore structures whose terms appear in the prompt (lane 6).
 * Within a lane, a closer match comes first. Concepts are read from prose/concepts/ and from
 * prose/teaching/explanations/, the two places the original's code and documentation name.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function frontmatter(text) {
  const match = text.replace(/\r\n/gu, "\n").match(/^---\n([\s\S]*?)\n---/u);
  const fields = {};
  for (const line of match ? match[1].split("\n") : []) { const colon = line.indexOf(":"); if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim(); }
  return fields;
}
const markdown = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).flatMap((entry) => (entry.isDirectory() ? markdown(join(dir, entry.name)) : entry.name.endsWith(".md") ? [join(dir, entry.name)] : [])) : []);
/** Terms from a record's name and description long enough to mean something. */
const termsOf = (fields) => `${fields.name ?? ""} ${fields.description ?? ""}`.toLowerCase().split(/\W+/u).filter((term) => term.length > 3);

export function compileContext(store, prompt, { recentMemories = 3 } = {}) {
  const root = resolve(store); const text = String(prompt ?? "").toLowerCase();
  if (!text.trim()) return "";
  const structures = join(root, "code", "structures");
  const score = (fields) => termsOf(fields).filter((term) => text.includes(term)).length;
  const injections = [];
  const soul = join(structures, "soul.md");
  if (existsSync(soul)) {
    const structure = readFileSync(soul, "utf8"); const source = structure.replace(/\r\n/gu, "\n").match(/^---\n[\s\S]*?^source:\s*(\S.*)$[\s\S]*?\n---/mu)?.[1].trim();
    const sourcePath = source && join(root, source);
    injections.push({ lane: 1, score: 0, label: "soul", content: sourcePath && existsSync(sourcePath) ? `${structure}\n${readFileSync(sourcePath, "utf8")}` : structure });
  }
  const matched = (files, lane, kind) => {
    for (const file of files) {
      const fields = frontmatter(readFileSync(file, "utf8")); const s = score(fields);
      if (s > 0) injections.push({ lane, score: s, label: `${kind}:${fields.name || basename(file, ".md")}`, content: `${fields.name}: ${fields.description || "(no description)"}` });
    }
  };
  matched([...markdown(join(root, "prose", "concepts")), ...markdown(join(root, "prose", "teaching", "explanations"))], 4, "concept");
  for (const file of markdown(join(root, "prose", "memory")).sort().reverse().slice(0, recentMemories)) {
    const fields = frontmatter(readFileSync(file, "utf8"));
    injections.push({ lane: 5, score: 0, label: `memory:${fields.name || basename(file, ".md")}`, content: `${fields.name || basename(file, ".md")}: ${fields.description || "(no description)"}` });
  }
  matched(markdown(structures).filter((file) => basename(file) !== "soul.md"), 6, "lore");
  if (injections.length === 0) return "";
  injections.sort((a, b) => (a.lane !== b.lane ? a.lane - b.lane : b.score - a.score));
  const lines = [`[Compiled context from the ${basename(root)} character store]`, ""];
  for (const injection of injections) lines.push(`=== ${injection.label} ===`, injection.content.trim(), "");
  lines.push("[End compiled context]");
  return `${lines.join("\n")}\n`;
}
