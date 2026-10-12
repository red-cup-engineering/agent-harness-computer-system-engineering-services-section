#!/usr/bin/env node
/**
 * @skill installing-codex-as-an-agent
 * @verb-phrase installing codex as an agent
 * @closure-kind process
 * @description Projects one enterprise office and all skills realizing its duties into a project-scoped Codex custom-agent TOML file. Use when seating an office as a colleague to which a Codex dispatcher can delegate; use the enterprise installer to project a whole roster.
 *
 * @precondition the named office resolves uniquely from the caller's standpoint and conforms to an office record shape
 * @precondition every duty and skill named by the office resolves uniquely from the enterprise's own pools
 * @precondition an existing target agent is absent, recorded in this installer's manifest, or byte-identical to this installer's rendered projection
 * @postcondition the node holds one .codex/agents/<office-id>.toml custom agent whose instructions are a deterministic projection of the office, duties, and skills
 * @postcondition the node's Codex-agent manifest records the installed office and clean removes exactly that projection
 * @witness the source office, every held skill, and the custom-agent target
 * @witness on refusal, the unmet precondition and every conflicting seat
 *
 * An office is the source; Codex's custom-agent TOML is output. The projection
 * carries the office's normative structure, position, deontic profile, duties,
 * and the full text of every skill that realizes those duties. It does not copy
 * the scripts those skills name: those remain self-contained at the enterprise.
 * Every projected office receives the Codex defaults `gpt-5.6-terra` at
 * `medium` reasoning effort. The office record's `x-agent.model` is a Claude
 * model slug, not a Codex override, and is deliberately never translated.
 * This projector currently admits no per-office Codex model override: change
 * projection policy here, then reinstall, rather than editing generated TOML.
 *
 * Run:
 *
 * ```sh
 * node .../install-codex-as-an-agent.js <office> [<node>] --root <root>
 * node .../install-codex-as-an-agent.js <office> [<node>] --list
 * node .../install-codex-as-an-agent.js <office> [<node>] --dry-run
 * node .../install-codex-as-an-agent.js <office> [<node>] --clean
 * node .../install-codex-as-an-agent.js <office> [<node>] --reinstall
 * ```
 */
// install-codex-as-an-agent — install ONE office into ONE node of the tree as a
// SUBAGENT: a single file at <node>/.codex/agents/<office-id>.toml.
//
// The office is the source; the agent file is the output, a deterministic
// projection of the office's record and skills:
//
//   1. the TOML fields (name, description) are generated from the record
//   2. the body is the office speaking — its normative structure, position,
//      deontic profile, and duties
//   3. every skill that realizes a duty the office records, every skill the
//      record provides, and every skill seated under the office, is projected
//      IN FULL into the body, so the agent starts holding them
//
// Skills project into developer_instructions rather than the node-wide skill
// registry. A skill held by one office should not thereby become an affordance
// of the dispatcher or every peer office. Scripts are NOT copied — a skill's
// text names its scripts by repo path, and the agent runs them where they seat.
//
// Closure-kind: process. No branching on surprise — every unmet precondition
// exits non-zero with the reason. Same office and node produce the same agent.
//
// usage:
//   install-codex-as-an-agent.js <office> <node> [--dry-run]
//   install-codex-as-an-agent.js <office> <node> --list
//   install-codex-as-an-agent.js <office> <node> --clean
//   install-codex-as-an-agent.js <office> <node> --reinstall
//
// <office> is a path to an office record or office directory, or a bare office
// id resolved from where you stand: the nearest office of that id by filesystem
// distance wins. Where you stand is the working directory, or --from <path>.
//
// <node> is the directory whose .codex/agents/ receives the agent — a path, or
// omitted to mean the repo root.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(argValue("--root") ?? process.cwd());
const DRY_RUN = process.argv.includes("--dry-run");
const STANDPOINT = resolve(argValue("--from") ?? process.cwd());

// Directories that are never part of an office's own record, and never a pool.
// Harness directories are excluded because they are output — output is never evidence about
// the record.
const SKIP_DIRS = new Set([
  "fixtures",
  "node_modules",
  ".git",
  ".claude",
  ".codex",
  ".agents",
  "dist",
  "build",
  "archive",
  "_archive",
  "triage",
  "preservation",
]);

// Codex projection policy, applied uniformly to every office. `x-agent`
// belongs to the Claude projection and its model slugs are not portable.
// There is intentionally no per-office Codex override until one is justified
// and seated under an explicit Codex-specific office extension.
const CODEX_MODEL = "gpt-5.6-terra";
const CODEX_REASONING_EFFORT = "medium";
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function die(message) {
  console.error(`install-codex-as-an-agent: ${message}`);
  process.exit(1);
}

function rel(p) {
  return relative(REPO_ROOT, p) || ".";
}

// --- pools: rosters, duty pools, skill pools ---------------------------------

const POOL_CACHE = {};

function pools(name) {
  if (POOL_CACHE[name]) return POOL_CACHE[name];
  if (name === "skills") {
    const explicit = process.argv.flatMap((value, index) => value === "--skill-root" ? [process.argv[index + 1]] : []);
    if (explicit.some((path) => !path || path.startsWith("--"))) die("--skill-root requires a directory");
    if (explicit.length) return POOL_CACHE[name] = explicit.map((path) => resolve(path));
  }
  const found = [];
  (function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const child = join(dir, entry.name);
      if (entry.name === name) found.push(child);
      else walk(child);
    }
  })(REPO_ROOT);
  POOL_CACHE[name] = found;
  return found;
}

function distanceFrom(standpoint, target) {
  const r = relative(standpoint, target);
  return r === "" ? 0 : r.split("/").length;
}

// Nearest wins; only a true tie is refused.
function nearest(kind, id, seats, standpoint) {
  const ranked = seats
    .map((path) => ({ path, distance: distanceFrom(standpoint, path) }))
    .sort((a, b) => a.distance - b.distance);
  if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) {
    die(
      `${kind} '${id}' seats at two places equidistant from ${rel(standpoint)} — nothing decides between them:\n` +
        ranked
          .filter((s) => s.distance === ranked[0].distance)
          .map((s) => `  ${rel(s.path)}`)
          .join("\n") +
        `\nName it by path, or stand somewhere that decides.`,
    );
  }
  return ranked[0].path;
}

// --- frontmatter ---------------------------------------------------------------

function frontmatter(file) {
  if (!existsSync(file)) return undefined;
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, "utf8"));
  return match ? match[1] : undefined;
}

function frontmatterValue(file, key) {
  const fm = frontmatter(file);
  if (!fm) return undefined;
  const match = new RegExp(`^${key}:[ \\t]*(.+)$`, "m").exec(fm);
  return match ? match[1].trim() : undefined;
}

function frontmatterList(file, key) {
  const fm = frontmatter(file);
  if (!fm) return [];
  const inline = new RegExp(`^${key}:[ \\t]*\\[(.*)\\][ \\t]*$`, "m").exec(fm);
  if (inline) return inline[1].split(",").map((s) => s.trim()).filter(Boolean);
  const block = new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]*-[ \\t]*.+\\r?\\n?)+)`, "m").exec(fm);
  if (block) {
    return block[1]
      .split("\n")
      .map((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

// Reads `key: value` and the block-scalar forms (`key: >` / `key: |` with an
// indented body). Frontmatter here is written by hand in both shapes, so both
// are read; folded lines join with spaces, as YAML folds them.
function frontmatterText(file, key) {
  const fm = frontmatter(file);
  if (!fm) return undefined;
  const block = new RegExp(`^${key}:[ \\t]*[>|][+-]?[ \\t]*\\r?\\n((?:[ \\t]+.*\\r?\\n?|[ \\t]*\\r?\\n)+)`, "m").exec(fm);
  if (block) {
    return block[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  }
  return frontmatterValue(file, key);
}

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

// --- precondition: the argument names an office --------------------------------

// An office seats in a roster in one of three shapes: a bare record
// `offices/<id>.md`, a directory `offices/<id>/` holding `<id>.md`, or a
// canonical record `offices/<id>.schema.json` conforming to emsenn/office.
function officeAt(path) {
  if (existsSync(path) && statSync(path).isDirectory()) {
    const id = basename(path);
    const record = join(path, `${id}.md`);
    if (existsSync(record)) return { id, dir: path, record, seated: true };
    const canonical = join(path, `${id}.schema.json`);
    if (existsSync(canonical)) return { id, dir: path, record: canonical, seated: true, canonical: true };
    return undefined;
  }
  if (path.endsWith(".md") && existsSync(path)) {
    const id = basename(path, ".md");
    return { id, dir: dirname(path), record: path, seated: false };
  }
  if (path.endsWith(".schema.json") && existsSync(path)) {
    const id = basename(path, ".schema.json");
    return { id, dir: dirname(path), record: path, seated: false, canonical: true };
  }
  if (path.endsWith(".json") && existsSync(path)) {
    const id = basename(path, ".json");
    return { id, dir: dirname(path), record: path, seated: false, canonical: true };
  }
  return undefined;
}

function canonicalOffice(office) {
  let spec;
  try {
    spec = JSON.parse(readFileSync(office.record, "utf8"));
  } catch (e) {
    die(`${rel(office.record)} is unreadable: ${e.message}`);
  }
  if (spec.kind !== "office") {
    die(`${rel(office.record)} declares 'kind: ${spec.kind ?? "(nothing)"}' — refusing to install from a non-office.`);
  }
  const claimed = spec.id ?? (typeof spec.$id === "string" ? spec.$id.split("/").pop() : undefined);
  if (claimed !== office.id) {
    die(`${rel(office.record)} carries id '${claimed}' — that is not office '${office.id}'.`);
  }
  return spec;
}

function resolveOffice(arg) {
  if (!arg) {
    die(
      "no office given. usage: install-codex-as-an-agent.js <office> <node> [--dry-run|--list|--clean|--reinstall]",
    );
  }

  let office;
  if (arg.includes("/") || isAbsolute(arg)) {
    const path = isAbsolute(arg) ? arg : resolve(REPO_ROOT, arg);
    office = officeAt(path) ?? officeAt(`${path}.json`) ?? officeAt(`${path}.md`) ?? officeAt(`${path}.schema.json`);
    if (!office) die(`office path '${arg}' is neither an office record nor an office directory.`);
  } else {
    const rosters = pools("offices");
    const seats = rosters
      .flatMap((roster) => [join(roster, arg), join(roster, `${arg}.json`), join(roster, `${arg}.md`), join(roster, `${arg}.schema.json`)])
      .filter((p) => officeAt(p));
    if (seats.length === 0) {
      die(
        `office '${arg}' seats in no roster. Rosters searched:\n  ` +
          (rosters.length ? rosters.map(rel).join("\n  ") : "(none)"),
      );
    }
    office = officeAt(nearest("office", arg, seats, STANDPOINT));
  }

  if (office.canonical) {
    office.spec = canonicalOffice(office);
    return office;
  }
  const type = frontmatterValue(office.record, "type");
  if (type !== "office") {
    die(`${rel(office.record)} declares 'type: ${type ?? "(nothing)"}' — refusing to install from a non-office.`);
  }
  return office;
}

// --- the node --------------------------------------------------------------------

function resolveNode(arg) {
  const dir = arg ? (isAbsolute(arg) ? arg : resolve(process.cwd(), arg)) : REPO_ROOT;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    die(`node '${arg}' is not a directory. The node is where the agent gets installed; it must already exist.`);
  }
  return dir;
}

// --- discovery: the office's duties and skills ------------------------------------

// A canonical office names its duties in `bears-duty`, each by full address
// (`emsenn/duty/<id>`); an older frontmatter office names them bare in
// `duties:`. Same assignment mechanism, two spellings.
function resolveDuties(office) {
  const ids = office.canonical
    ? (Array.isArray(office.spec["bears-duty"]) ? office.spec["bears-duty"] : []).map((a) =>
        a.replace(/^emsenn\/duty\//, ""),
      )
    : frontmatterList(office.record, "duties");
  const all = pools("duties");
  return ids.map((id) => {
    const seats = all
      .flatMap((pool) => [join(pool, `${id}.json`), join(pool, `${id}.schema.json`), join(pool, `${id}.md`), join(pool, id, `${id}.md`)])
      .filter((p) => existsSync(p));
    if (seats.length === 0) {
      die(
        `office '${office.id}' records duty '${id}', which seats in no duties pool. Pools searched:\n  ` +
          (all.length ? all.map(rel).join("\n  ") : "(none)"),
      );
    }
    const record = nearest("duty", id, seats, office.dir);
    if (record.endsWith(".json")) {
      let spec;
      try {
        spec = JSON.parse(readFileSync(record, "utf8"));
      } catch (e) {
        die(`${rel(record)} is unreadable: ${e.message}`);
      }
      const claimedDuty = spec.id ?? (typeof spec.$id === "string" ? spec.$id.split("/").pop() : undefined);
      if (claimedDuty !== id) die(`${rel(record)} carries id '${claimedDuty}' — that is not duty '${id}'.`);
      return { id, record, skills: Array.isArray(spec.skills) ? spec.skills : [], spec };
    }
    const type = frontmatterValue(record, "type");
    if (type !== "duty") die(`${rel(record)} declares 'type: ${type ?? "(nothing)"}' — that is not a duty.`);
    return { id, record, skills: frontmatterList(record, "realized-by-skills") };
  });
}

function resolveSkill(name, namedBy) {
  const all = pools("skills");
  const seats = all.map((pool) => join(pool, name)).filter((d) => existsSync(join(d, "SKILL.md")));
  // Explicit shared custody wins when it supplies the named skill. Otherwise
  // retain the skill at the owner of the office or duty that declares it.
  if (seats.length === 0) {
    let directory = dirname(namedBy);
    while (directory !== dirname(directory)) {
      if (["offices", "duties"].includes(basename(directory))) {
        const local = join(dirname(directory), "skills", name);
        if (existsSync(join(local, "SKILL.md"))) seats.push(local);
        break;
      }
      directory = dirname(directory);
    }
  }
  // An office's duty remains meaningful when a named procedure has not been
  // installed for this harness.  The office record is the authority for the
  // duty; a harness-specific procedure is optional implementation evidence.
  // Returning undefined lets the renderer state the duty without fabricating
  // a placeholder skill or coupling this consumer to another harness's tree.
  if (seats.length === 0) return undefined;
  return { name, dir: nearest("skill", name, seats, dirname(namedBy)) };
}

// Skills seated under the office itself — only when the office is a directory of
// its own.
function walkForSkills(office) {
  if (!office.seated) return [];
  const skills = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const child = join(dir, entry.name);
      if (existsSync(join(child, "SKILL.md"))) skills.push({ name: entry.name, dir: child });
      else walk(child);
    }
  })(office.dir);
  return skills;
}

function findSkills(office, duties) {
  const found = new Map();
  const add = (skill) => {
    const prior = found.get(skill.name);
    if (prior && resolve(prior.dir) !== resolve(skill.dir)) {
      die(
        `office '${office.id}' holds skill '${skill.name}' from two places — one name cannot resolve to two skills:\n` +
          `  ${rel(prior.dir)}\n  ${rel(skill.dir)}`,
      );
    }
    found.set(skill.name, skill);
  };

  for (const skill of walkForSkills(office)) add(skill);
  if (office.canonical) {
    for (const name of Array.isArray(office.spec["provides-skill"]) ? office.spec["provides-skill"] : []) {
      const skill = resolveSkill(name, office.record);
      if (skill) add(skill);
    }
  }
  for (const duty of duties) {
    for (const name of duty.skills) {
      const skill = resolveSkill(name, duty.record);
      if (skill) add(skill);
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function checkSkills(skills, office) {
  if (skills.length === 0) {
    if (office.canonical && Array.isArray(office.spec["bears-duty"]) && office.spec["bears-duty"].length > 0) return;
    die(
      `office '${office.id}' (${rel(office.record)}) has no skills — it records no duties realized by any skill, and holds none of its own. An agent holding nothing can discharge nothing.`,
    );
  }
  for (const skill of skills) {
    const source = join(skill.dir, "SKILL.md");
    const declared = frontmatterValue(source, "name");
    if (!declared) die(`${rel(source)} has no 'name:' in its frontmatter.`);
    if (declared !== skill.name) {
      die(
        `${rel(source)} declares name '${declared}' but sits in directory '${skill.name}'. ` +
          `The directory name is the skill's name; make them agree.`,
      );
    }
  }
}

// --- the projection ------------------------------------------------------------

// A list field of the canonical record, rendered for prose; absent is absent.
function listed(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : undefined;
  return value || undefined;
}

// The agent's description tells the delegating session when to hand work here:
// the record's own first sentence, then the duty side of the deontic profile.
function describeCanonical(spec) {
  const first = String(spec["normative-structure"] ?? "").split(/(?<=\.)\s/)[0];
  const dutyKeys = Object.entries(spec["deontic-profile"] ?? {})
    .filter(([, v]) => v === "duty")
    .map(([k]) => k.replaceAll("-", " "));
  const duties = dutyKeys.length ? ` Duties: ${dutyKeys.join("; ")}.` : "";
  return `The ${spec.name} office. ${first}${duties}`;
}

function renderAgent(office, duties, skills) {
  const spec = office.spec;
  let description;
  let body;

  if (office.canonical) {
    description = describeCanonical(spec);
    const position = [
      ["part of", listed(spec["part-of"])],
      ["reports to", listed(spec["reports-to"])],
      ["peer offices", listed(spec["peer-offices"])],
      ["jurisdiction", listed(spec.jurisdiction)],
      ["distinguished from", listed(spec["distinguished-from"])],
    ].filter(([, v]) => v);
    const deontic = Object.entries(spec["deontic-profile"] ?? {});
    body =
      `# ${spec.name}\n\n` +
      `You hold the office of **${spec.name}** (\`emsenn/office/${office.id}\`). This file is output, ` +
      `projected from the office's record — \`${rel(office.record)}\` — by ` +
      `installing-codex-as-an-agent. The record is the office; edits here are ` +
      `discarded on the next install.\n\n` +
      `## The office\n\n${spec["normative-structure"]}\n\n` +
      (position.length
        ? `## Position\n\n${position.map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n\n`
        : "") +
      (deontic.length
        ? `## Deontic profile\n\n${deontic.map(([k, v]) => `- ${k.replaceAll("-", " ")} — **${v}**`).join("\n")}\n\n`
        : "") +
      (duties.length
        ? `## Duties and their skills\n\n${duties
            .map(
              (d) =>
                `- **${d.id}**` +
                (d.spec?.authority ? ` (authority: ${d.spec.authority}` + (d.spec.claim ? `; claim: ${d.spec.claim}` : "") + `)` : "") +
                (d.skills.length
                  ? ` — declared procedures: ${d.skills.join(", ")}; installed here: ${d.skills.filter((name) => skills.some((skill) => skill.name === name)).join(", ") || "none"}`
                  : " — no procedure is declared"),
            )
            .join("\n")}\n\n`
        : "") +
      (Array.isArray(spec.unrealized) && spec.unrealized.length
        ? `## Unrealized\n\n${spec.unrealized.map((u) => `- ${u}`).join("\n")}\n\n`
        : "");
  } else {
    description = frontmatterText(office.record, "description");
    if (!description) {
      die(`${rel(office.record)} has no 'description:' in its frontmatter — an agent needs one to be delegated to.`);
    }
    const carried = office.seated ? join(office.dir, "CLAUDE.md") : undefined;
    const spoken = carried && existsSync(carried) ? carried : office.record;
    body = stripFrontmatter(readFileSync(spoken, "utf8")).trim() + "\n\n";
  }

  const skillSection =
    `## Skills\n\n` +
    `The office's skills follow in full — you hold them from session start; there is ` +
    `nothing to invoke. Scripts a skill names seat at their recorded repository paths; ` +
    `run them from the repository root.\n\n` +
    skills
      .map((s) => `### ${s.name}\n\n${stripFrontmatter(readFileSync(join(s.dir, "SKILL.md"), "utf8")).trim()}\n`)
      .join("\n");

  return (
    `name = ${JSON.stringify(office.id)}\n` +
    `description = ${JSON.stringify(description)}\n` +
    `model = ${JSON.stringify(CODEX_MODEL)}\n` +
    `model_reasoning_effort = ${JSON.stringify(CODEX_REASONING_EFFORT)}\n` +
    `developer_instructions = ${JSON.stringify(`${body}${skillSection}\n`)}\n`
  );
}

// --- manifest: which offices installed agents here, so clean is exact -------------

function manifestPath(node) {
  return join(node, ".codex/.codex-agent-manifest");
}

function readManifest(node) {
  const file = manifestPath(node);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function writeManifest(node, entries) {
  mkdirSync(dirname(manifestPath(node)), { recursive: true });
  writeFileSync(manifestPath(node), [...entries].sort().map((e) => `${e}\n`).join(""));
}

// A manifest holding no entries is a file that answers no question a
// manifest exists to answer — removed rather than left behind as an empty
// witness, so clean's residue is nothing, not a zero-byte file.
function writeOrRemoveManifest(node, entries) {
  if (entries.length) writeManifest(node, entries);
  else rmSync(manifestPath(node), { force: true });
}

// A directory this mechanism created and then emptied by its own removals
// is removed too — an empty `agents/` left behind is as much residue as a
// stray file; a directory this mechanism did not empty (something else's
// entry still in it) is left untouched.
function removeIfEmptyDir(dir) {
  if (!existsSync(dir)) return;
  if (readdirSync(dir, { withFileTypes: true }).length === 0) rmSync(dir, { recursive: true, force: true });
}

// --- the motions -------------------------------------------------------------------

function agentTarget(node, office) {
  return join(node, ".codex/agents", `${office.id}.toml`);
}

function doList(office, node, duties, skills) {
  console.log(`agent\t${rel(office.record)}\t->\t${rel(agentTarget(node, office))}`);
  for (const skill of skills) {
    console.log(`${skill.name}\t${rel(skill.dir)}\t->\t(projected into agent body)`);
  }
}

function doClean(office, node) {
  const manifest = readManifest(node);
  if (!manifest.includes(office.id)) {
    console.log(`install-codex-as-an-agent: office '${office.id}' has no agent installed at ${rel(node)}.`);
    return;
  }
  if (DRY_RUN) {
    console.log(
      `install-codex-as-an-agent: dry run — would remove agent '${office.id}' from ${rel(node)}; nothing was removed.`,
    );
    return;
  }
  rmSync(agentTarget(node, office), { force: true });
  writeOrRemoveManifest(node, manifest.filter((e) => e !== office.id));
  removeIfEmptyDir(join(node, ".codex/agents"));
  console.log(`install-codex-as-an-agent: removed agent '${office.id}' from ${rel(node)}.`);
}

function doInstall(office, node, rendered) {
  const target = agentTarget(node, office);
  const manifest = readManifest(node);
  const unmanagedExactProjection =
    existsSync(target) &&
    !manifest.includes(office.id) &&
    readFileSync(target, "utf8") === rendered;

  // An unmanaged file can be adopted only when it is already this exact
  // deterministic projection. Any divergent unmanaged agent has an unknown
  // author and is never overwritten or merged.
  if (existsSync(target) && !manifest.includes(office.id) && !unmanagedExactProjection) {
    die(
      `${rel(target)} already exists and was not installed from office '${office.id}' — ` +
        `refusing to overwrite an agent this mechanism does not answer for. Remove it, or move it aside.`,
    );
  }

  if (DRY_RUN) {
    console.log(`install-codex-as-an-agent: dry run — would install agent '${office.id}' into ${rel(node)}.`);
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  if (unmanagedExactProjection) {
    console.log(`  adopted    agents/${office.id}.toml  (${rel(office.record)})`);
  } else {
    writeFileSync(target, rendered);
    console.log(`  installed  agents/${office.id}.toml  (${rel(office.record)})`);
  }

  writeManifest(node, [...manifest.filter((e) => e !== office.id), office.id]);

  // Postcondition, checked rather than assumed: the file at the target is
  // byte-identical to the projection of the record.
  if (readFileSync(target, "utf8") !== rendered) {
    die(`postcondition failed: ${rel(target)} differs from the projection of ${rel(office.record)}.`);
  }

  console.log(`install-codex-as-an-agent: installed agent '${office.id}' into ${rel(node)}.`);
}

// --- main ----------------------------------------------------------------------------

const FLAGS_TAKING_VALUE = new Set(["--root", "--from", "--skill-root"]);
const positionals = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    if (FLAGS_TAKING_VALUE.has(arg)) i++;
    continue;
  }
  positionals.push(arg);
}

const office = resolveOffice(positionals[0]);
const node = resolveNode(positionals[1]);

if (process.argv.includes("--clean")) {
  doClean(office, node);
} else {
  const duties = resolveDuties(office);
  const skills = findSkills(office, duties);
  checkSkills(skills, office);
  if (process.argv.includes("--list")) {
    doList(office, node, duties, skills);
  } else {
    if (process.argv.includes("--reinstall")) doClean(office, node);
    doInstall(office, node, renderAgent(office, duties, skills));
  }
}
