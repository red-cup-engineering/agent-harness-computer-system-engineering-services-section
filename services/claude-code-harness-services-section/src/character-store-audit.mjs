/**
 * Audit a character store for structural integrity.
 *
 * Carried from Rom Keldar's auditing-a-character-store skill (restored from main's history): the
 * identity file, the surface files, the soul structure and every concept it names, skill records,
 * milestone framing and specification frontmatter. One check is added: where the store keeps
 * work-items, HEARTBEAT.md must be the reading their settlement witnesses derive, so a hand-kept
 * or stale HEARTBEAT is a violation rather than a surprise.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { WORK_ITEMS, heartbeatOf } from "./character-work-items.mjs";
import { identityOf, memoryOf, sameMemory, soulOf } from "./character-surface-files.mjs";

const isDir = (path) => existsSync(path) && statSync(path).isDirectory();
const isFile = (path) => existsSync(path) && statSync(path).isFile();
function frontmatter(text) {
  const match = text.replace(/\r\n/gu, "\n").match(/^---\n([\s\S]*?)\n---/u);
  const fields = {};
  for (const line of match ? match[1].split("\n") : []) { const colon = line.indexOf(":"); if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim(); }
  return fields;
}

/** A store's governance tree sits at governance/ or, in older stores, at work/governance/. */
export const governanceOf = (root) => [join(root, "governance"), join(root, "work", "governance")].find(isDir);

export function auditCharacterStore(store, { items = WORK_ITEMS } = {}) {
  const root = resolve(store); const slug = basename(root);
  const results = []; let violations = 0; let warnings = 0;
  const fail = (section, message) => { results.push({ level: "FAIL", section, message }); violations += 1; };
  const warn = (section, message) => { results.push({ level: "WARN", section, message }); warnings += 1; };
  const pass = (section, message) => results.push({ level: "pass", section, message });

  if (isFile(join(root, `${slug}.md`)) || isFile(join(root, "IDENTITY.md"))) pass("Identity", `${slug}.md or IDENTITY.md present`);
  else fail("Identity", `missing identity file (${slug}.md)`);

  for (const file of ["HEARTBEAT.md", "DREAMS.md", "MEMORY.md", "TOOLS.md", "USER.md"]) isFile(join(root, file)) ? pass("Surface files", `${file} present`) : warn("Surface files", `${file} missing`);

  const soul = join(root, "code", "structures", "soul.md");
  if (!isFile(soul)) fail("Soul", "code/structures/soul.md missing");
  else {
    pass("Soul", "code/structures/soul.md present");
    const header = readFileSync(soul, "utf8").replace(/\r\n/gu, "\n").match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
    const source = header.match(/^source:\s*(\S.*)$/mu)?.[1].trim();
    if (source) isFile(join(root, source)) ? pass("Soul", `soul source: ${source}`) : fail("Soul", `soul source: ${source} not found`);
    for (const key of ["values", "must-not", "must"]) {
      let inside = false; const paths = [];
      for (const line of header.split("\n")) {
        if (line.startsWith(`${key}:`)) { inside = true; continue; }
        if (inside && line.startsWith("  - ")) paths.push(line.replace(/^\s*-\s+/u, "").trim());
        else if (inside && !line.startsWith(" ")) inside = false;
      }
      for (const path of paths) isFile(join(root, path)) ? pass("Soul", `soul ${key}: ${path}`) : fail("Soul", `soul ${key}: ${path} not found`);
    }
  }

  const governance = governanceOf(root); const g = governance ? governance.slice(root.length + 1).split("\\").join("/") : "governance";
  const skills = governance && join(governance, "skills");
  if (skills && isDir(skills)) for (const entry of readdirSync(skills).sort()) {
    const path = join(skills, entry);
    if (!isDir(path)) { if (entry !== "_index.md") warn("Skills", `${g}/skills/${entry}: file at skills root (expected directory)`); continue; }
    isFile(join(path, `${entry}.md`)) || isFile(join(path, "SKILL.md")) ? pass("Skills", `skill ${entry}: record present`) : fail("Skills", `skill ${entry}: missing ${entry}.md`);
  }

  const milestones = governance && join(governance, "work", "milestones");
  if (milestones && isDir(milestones)) for (const file of readdirSync(milestones).filter((name) => name.endsWith(".md")).sort()) {
    if (/Level\s+[0-9]/iu.test(readFileSync(join(milestones, file), "utf8"))) warn("Milestones", `milestones/${file}: contains maturity-model level framing`);
  }

  const specs = governance && join(governance, "rules", "specifications");
  if (specs && isDir(specs)) for (const file of readdirSync(specs).filter((name) => name.endsWith(".md")).sort()) {
    const fields = frontmatter(readFileSync(join(specs, file), "utf8"));
    fields.name ? pass("Specifications", `spec ${file}: name present`) : fail("Specifications", `spec ${file}: missing name:`);
    fields.description ? pass("Specifications", `spec ${file}: description present`) : fail("Specifications", `spec ${file}: missing description:`);
    if (fields.type) warn("Specifications", `spec ${file}: has type: field — ungrounded classification tag`);
    if (fields.class) warn("Specifications", `spec ${file}: has class: field — ungrounded classification tag`);
  } else warn("Specifications", `${g}/rules/specifications/ missing`);

  // HEARTBEAT is a readout of the work-items' witnesses; a store that keeps it by hand can disagree with itself.
  if (isDir(join(root, items))) {
    const derived = heartbeatOf(root, { items });
    const kept = isFile(join(root, "HEARTBEAT.md")) ? readFileSync(join(root, "HEARTBEAT.md"), "utf8") : null;
    if (kept === derived.text) pass("Work", `HEARTBEAT.md is the witness reading (${derived.open} open, ${derived.settled} settled)`);
    else fail("Work", `HEARTBEAT.md is not the witness reading of ${items.split("\\").join("/")}/ (${derived.open} open, ${derived.settled} settled); render it, never keep it by hand`);
  }
  // SOUL, IDENTITY and MEMORY are projections of the store's own records, held to them like HEARTBEAT.
  const surfaces = [
    ["SOUL.md", join("code", "structures", "soul.md"), () => soulOf(root), (kept, derived) => kept === derived],
    ["IDENTITY.md", "identity.md", () => identityOf(root), (kept, derived) => kept === derived],
    ["MEMORY.md", join("prose", "memory", "session-context.md"), () => memoryOf(root), sameMemory],
  ];
  for (const [surface, source, derive, same] of surfaces) {
    if (!isFile(join(root, source))) continue;
    let derived;
    try { derived = derive(); } catch (error) { fail("Surfaces", `${surface} cannot be rendered from ${source.split("\\").join("/")}: ${error.message}`); continue; }
    const kept = isFile(join(root, surface)) ? readFileSync(join(root, surface), "utf8") : null;
    if (kept !== null && same(kept, derived)) pass("Surfaces", `${surface} is rendered from ${source.split("\\").join("/")}`);
    else fail("Surfaces", `${surface} is not the rendering of ${source.split("\\").join("/")}; render it, never keep it by hand`);
  }
  return { violations, warnings, results };
}
