// Claude office installer operation; the full @skill documentation sits on
// the exported installClaudeAsAnAgent below. Skills project INTO the agent
// body rather than seating in <node>/.claude/skills/, because the harness
// has one shared skill registry per node — projection is the preload,
// done by generation. Scripts are never copied, only named by repo path.

import * as defaultFilesystem from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { officeReading, resolve as resolveRecord } from "@red-cup-engineering/organizing/agency";
import { readHarnessAgency } from "../../../src/agency-source.mjs";

let REPO_ROOT;
let DRY_RUN;
let STANDPOINT;
let argv;
let cwd;
let existsSync;
let readFileSync;
let readdirSync;
let mkdirSync;
let rmSync;
let statSync;
let writeFileSync;

function configureFilesystem(filesystem = defaultFilesystem) {
  ({ existsSync, readFileSync, readdirSync, mkdirSync, rmSync, statSync, writeFileSync } = filesystem);
}

// Directories that are never part of an office's own record, and never a pool.
// `.claude` is excluded because it is output — output is never evidence about
// the record.
const SKIP_DIRS = new Set([
  "fixtures",
  "node_modules",
  ".git",
  ".claude",
  "dist",
  "build",
  "archive",
  "_archive",
  "triage",
  "preservation",
]);

function argValue(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
}

function die(message) {
  throw new Error(`install-claude-as-an-agent: ${message}`);
}

function rel(p) {
  return relative(REPO_ROOT, p) || ".";
}

// --- the agency registry: every section's offices, duties and skills ---------------

let agency;
let AGENCY_ROOT;

function agencyOf() {
  if (agency === undefined) {
    AGENCY_ROOT = REPO_ROOT;
    agency = readHarnessAgency(AGENCY_ROOT, {
      agencySections: argValue("--agency-sections") === undefined ? undefined : JSON.parse(argValue("--agency-sections")),
    });
  }
  return agency;
}

const sectionPathOf = (dir) => relative(AGENCY_ROOT, dir).split("\\").join("/");
const sourcePath = (record) => join(AGENCY_ROOT, record.source);

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

// An office is the agency registry's: named by id (read from the standpoint's section outward,
// as every record names another) or by the path of its record.
function officeOfRecord(record) {
  const file = sourcePath(record);
  const canonical = file.endsWith(".json");
  const office = { id: record.id, key: record.key, sectionPath: record.sectionPath, record: file, dir: dirname(file), seated: basename(dirname(file)) === record.id, canonical };
  if (canonical) office.spec = canonicalOffice(office);
  return office;
}

// The office as the registry reads it: a formed office (`formed-from` a form, with `parameters`)
// is its form applied, so its normative structure, duties and skills are the effective record's.
function canonicalOffice(office) {
  const spec = officeReading(agencyOf(), office.key).effective;
  if (spec.kind !== "office") {
    die(`${rel(office.record)} declares 'kind: ${spec.kind ?? "(nothing)"}' — refusing to install from a non-office.`);
  }
  return spec;
}

function resolveOffice(arg) {
  if (!arg) {
    die(
      "no office given. usage: install-claude-as-an-agent.js <office> <node> [--dry-run|--list|--clean|--reinstall|--check]",
    );
  }
  const registry = agencyOf();
  let record;
  if (arg.includes("/") || isAbsolute(arg)) {
    const path = resolve(REPO_ROOT, arg);
    record = [...registry.offices.values()].find((o) => [path, `${path}.json`, `${path}.md`, join(path, `${basename(path)}.md`), join(path, `${basename(path)}.json`)].includes(sourcePath(o)));
    if (!record) die(`office path '${arg}' is no office record in the agency registry.`);
  } else {
    record = resolveRecord(registry, "offices", arg, sectionPathOf(STANDPOINT));
    if (!record) {
      const seats = registry.byId.offices.get(arg) ?? [];
      die(seats.length > 1
        ? `office '${arg}' is seated in several sections and nothing at ${rel(STANDPOINT)} decides between them:\n  ${seats.map((o) => o.source).join("\n  ")}\nName it by path, or stand in one of those sections.`
        : `office '${arg}' is seated in no section's agency records.`);
    }
  }
  return officeOfRecord(record);
}

// --- the node --------------------------------------------------------------------

function resolveNode(arg) {
  const dir = arg ? (isAbsolute(arg) ? arg : resolve(cwd, arg)) : REPO_ROOT;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    die(`node '${arg}' is not a directory. The node is where the agent gets installed; it must already exist.`);
  }
  return dir;
}

// --- discovery: the office's duties and skills ------------------------------------

// The office's duties are every duty its record names, in any register the registry reads
// (bears-duty, a duties list, the deontic profile's duties, a Markdown Duties section), each with
// the skills that discharge it. A duty named without a record of its own is still the office's.
function resolveDuties(office) {
  const registry = agencyOf();
  const record = registry.offices.get(office.key);
  return record.bearsDuty.map((id) => {
    const duty = resolveRecord(registry, "duties", id, record.sectionPath);
    return duty === undefined
      ? { id, record: office.record, skills: [], spec: {} }
      : { id, record: sourcePath(duty), skills: duty.skills, spec: { authority: duty.authority, claim: duty.claim } };
  });
}

// The office's skills: those it provides and those its duties need, each the registry's record.
function findSkills(office, duties) {
  const registry = agencyOf();
  const record = registry.offices.get(office.key);
  const found = new Map();
  for (const [name, from] of [...record.providesSkill.map((n) => [n, record.sectionPath]), ...duties.flatMap((d) => d.skills.map((n) => [n, sectionPathOf(dirname(d.record))]))]) {
    const skill = resolveRecord(registry, "skills", name, from);
    if (skill === undefined) die(`office '${office.id}' names skill '${name}', which no section's agency records hold.`);
    found.set(skill.key, { key: skill.key, name: skill.id, file: sourcePath(skill) });
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function checkSkills(skills, office) {
  if (skills.length === 0) {
    die(
      `office '${office.id}' (${rel(office.record)}) has no skills — it records no duties realized by any skill, and holds none of its own. An agent holding nothing can discharge nothing.`,
    );
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

// Exported for callers that need to assay the office's projection without
// installing or checking it. `name` is the agent's name when the office id is
// taken by another section's office. `skillNames` maps a skill's registry key to
// the native Claude Code skill a harness projection installed for it: given it, the
// agent names its skills in `skills:` (Claude Code preloads them into the agent)
// instead of carrying their text, so each skill has one projected source.
export function renderAgent(office, duties, skills, { name = office.id, skillNames } = {}) {
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
      `installing-claude-as-an-agent. The record is the office; edits here are ` +
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
                (d.skills.length ? ` — discharged by: ${d.skills.join(", ")}` : " — realized by no skill"),
            )
            .join("\n")}\n\n`
        : "") +
      (Array.isArray(spec.unrealized) && spec.unrealized.length
        ? `## Unrealized\n\n${spec.unrealized.map((u) => `- ${u}`).join("\n")}\n\n`
        : "");
  } else {
    description = (frontmatterText(office.record, "description") ?? frontmatterText(office.record, "charter"))?.replace(/^"(.*)"$/su, "$1");
    if (!description) {
      die(`${rel(office.record)} has no 'description:' in its frontmatter — an agent needs one to be delegated to.`);
    }
    const carried = office.seated ? join(office.dir, "CLAUDE.md") : undefined;
    const spoken = carried && existsSync(carried) ? carried : office.record;
    body = stripFrontmatter(readFileSync(spoken, "utf8")).trim() + "\n\n";
  }

  const native = skillNames === undefined ? undefined : skills.map((s) => skillNames.get(s.key)).filter(Boolean);
  const skillSection = native !== undefined
    ? `## Skills\n\n` +
      `The office's skills are loaded with this agent: ${native.map((n) => `\`${n}\``).join(", ")}. ` +
      `Scripts a skill names seat at their recorded repository paths; run them from the repository root.\n`
    : `## Skills\n\n` +
    `The office's skills follow in full — you hold them from session start; there is ` +
    `nothing to invoke. Scripts a skill names seat at their recorded repository paths; ` +
    `run them from the repository root.\n\n` +
    skills
      .map((s) => `### ${s.name}\n\n${s.file.endsWith(".json") ? JSON.parse(readFileSync(s.file, "utf8")).description ?? "" : stripFrontmatter(readFileSync(s.file, "utf8")).trim()}\n`)
      .join("\n");

  // A canonical record may carry an x-agent block — harness projection hints
  // (model, effort, maxTurns, tools), extension-prefixed because the harness
  // is not doctrine. Absent keys are absent from the frontmatter, so the
  // agent inherits the session's defaults — except model, which defaults to
  // sonnet so dispatched offices run on sonnet unless the record says otherwise.
  const harness = (office.canonical && office.spec["x-agent"]) || {};
  return (
    `---\n` +
    `name: ${name}\n` +
    `description: ${JSON.stringify(description)}\n` +
    `model: ${harness.model || "sonnet"}\n` +
    (harness.effort ? `effort: ${harness.effort}\n` : "") +
    (harness.maxTurns ? `maxTurns: ${harness.maxTurns}\n` : "") +
    (Array.isArray(harness.tools) && harness.tools.length ? `tools: ${harness.tools.join(", ")}\n` : "") +
    (native?.length ? `skills:\n${native.map((n) => `  - ${n}\n`).join("")}` : "") +
    `---\n\n` +
    body +
    skillSection +
    `\n`
  );
}

/** One office's agent file, projected from an already-read registry with no effect: `{ id, text }`.
 *  Refuses (throws) as the installer does: a non-office record, a named skill no section holds,
 *  or an office holding no skill. */
export function projectOfficeAgent({ repoRoot, agency: registry, office: key, name, skillNames }) {
  configureFilesystem();
  REPO_ROOT = resolve(repoRoot);
  AGENCY_ROOT = registry.root;
  agency = registry;
  const record = registry.offices.get(key);
  if (record === undefined) die(`office '${key}' is seated in no section's agency records.`);
  const office = officeOfRecord(record);
  const duties = resolveDuties(office);
  const skills = findSkills(office, duties);
  checkSkills(skills, office);
  const id = name ?? office.id;
  return Object.freeze({ id, text: renderAgent(office, duties, skills, { name: id, skillNames }) });
}

// --- manifest: which offices installed agents here, so clean is exact -------------

function manifestPath(node) {
  return join(node, ".claude/.claude-agent-manifest");
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
  return join(node, ".claude/agents", `${office.id}.md`);
}

function doList(office, node, duties, skills) {
  console.log(`agent\t${rel(office.record)}\t->\t${rel(agentTarget(node, office))}`);
  for (const skill of skills) {
    console.log(`${skill.name}\t${rel(skill.file)}\t->\t(projected into agent body)`);
  }
}

function doClean(office, node) {
  const manifest = readManifest(node);
  if (!manifest.includes(office.id)) {
    console.log(`install-claude-as-an-agent: office '${office.id}' has no agent installed at ${rel(node)}.`);
    return;
  }
  if (DRY_RUN) {
    console.log(
      `install-claude-as-an-agent: dry run — would remove agent '${office.id}' from ${rel(node)}; nothing was removed.`,
    );
    return;
  }
  rmSync(agentTarget(node, office), { force: true });
  writeOrRemoveManifest(node, manifest.filter((e) => e !== office.id));
  removeIfEmptyDir(join(node, ".claude/agents"));
  console.log(`install-claude-as-an-agent: removed agent '${office.id}' from ${rel(node)}.`);
}

function doInstall(office, node, rendered) {
  const target = agentTarget(node, office);
  const manifest = readManifest(node);

  // An agent file this mechanism did not install is someone else's agent: it has
  // an author whose reasoning is not in any office record, and overwriting it
  // would discard that reasoning silently. Refused, not merged.
  if (existsSync(target) && !manifest.includes(office.id)) {
    die(
      `${rel(target)} already exists and was not installed from office '${office.id}' — ` +
        `refusing to overwrite an agent this mechanism does not answer for. Remove it, or move it aside.`,
    );
  }

  if (DRY_RUN) {
    console.log(`install-claude-as-an-agent: dry run — would install agent '${office.id}' into ${rel(node)}.`);
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, rendered);
  console.log(`  installed  agents/${office.id}.md  (${rel(office.record)})`);

  writeManifest(node, [...manifest.filter((e) => e !== office.id), office.id]);

  // Postcondition, checked rather than assumed: the file at the target is
  // byte-identical to the projection of the record.
  if (readFileSync(target, "utf8") !== rendered) {
    die(`postcondition failed: ${rel(target)} differs from the projection of ${rel(office.record)}.`);
  }

  console.log(`install-claude-as-an-agent: installed agent '${office.id}' into ${rel(node)}.`);
}

// --check makes no effect: it refuses unless the office is already recorded
// in the manifest AND the installed file is byte-identical to a fresh
// projection, so a caller can assay drift without risking a write.
function doCheck(office, node, rendered) {
  const target = agentTarget(node, office);
  const manifest = readManifest(node);
  if (!manifest.includes(office.id)) {
    die(`office '${office.id}' is absent from the agent manifest at ${rel(node)}.`);
  }
  if (!existsSync(target)) {
    die(`manifest names office '${office.id}', but ${rel(target)} is absent.`);
  }
  if (readFileSync(target, "utf8") !== rendered) {
    die(`${rel(target)} has drifted from the projection of ${rel(office.record)}.`);
  }
  console.log(`install-claude-as-an-agent: agent '${office.id}' at ${rel(node)} matches its office projection.`);
}

// --- main ----------------------------------------------------------------------------

/**
 * @skill installing-claude-as-an-agent
 * @verb-phrase installing claude as an agent
 * @closure-kind process
 * @description Installs ONE office into ONE node as a SUBAGENT — a single deterministic projection at <node>/.claude/agents/<office-id>.md, generated from the office's record and every skill it holds (by duty, by provides-skill, or seated under it): frontmatter (name, description) from the record, the body the office speaking, every held skill projected IN FULL so the agent starts holding it. <office> is a path to an office record or directory, or a bare office id resolved from the standpoint (--from, default the working directory) by nearest filesystem distance. <node> is the directory whose .claude/agents/ receives the agent, defaulting to the repo root. --check assays the installed file against a fresh projection with no write: it refuses unless the office is already recorded in the node's agent manifest and the file is byte-identical to what a fresh install would produce, so a caller can detect drift without risking one. Called once per office by installing-an-enterprise-in-claude, never copied.
 *
 * @precondition the office argument resolves to exactly one office record — by path, or as a bare id with a unique nearest seat
 * @precondition the office holds at least one skill (by duty, by provides-skill, or seated under it) — an agent holding nothing can discharge nothing
 * @precondition every skill a duty or the office names seats, uniquely, in a skills pool
 * @precondition the node exists and is a directory
 * @precondition --check requires the office already recorded in the node's agent manifest and its installed file present
 * @postcondition the agent file at the target is byte-identical to the projection of the office's record
 * @postcondition the node's agent manifest records the office as installed
 * @witness the installed or checked agent path, and on refusal, the unmet precondition, named
 *
 * installing-an-enterprise-in-claude calls this once per roster office rather than copying its logic — the sibling relation both files describe.
 */
export async function installClaudeAsAnAgent({
  argv: suppliedArgv = process.argv,
  cwd: suppliedCwd = process.cwd(),
  filesystem,
} = {}) {
  configureFilesystem(filesystem);
  argv = suppliedArgv;
  cwd = suppliedCwd;
  agency = undefined;
  REPO_ROOT = resolve(argValue("--root") ?? "/home/emsenn/info");
  DRY_RUN = argv.includes("--dry-run");
  STANDPOINT = resolve(argValue("--from") ?? cwd);

  const FLAGS_TAKING_VALUE = new Set(["--root", "--from", "--agency-sections"]);
  const positionals = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      if (FLAGS_TAKING_VALUE.has(arg)) i++;
      continue;
    }
    positionals.push(arg);
  }

  const office = resolveOffice(positionals[0]);
  const node = resolveNode(positionals[1]);

  if (argv.includes("--clean")) {
    doClean(office, node);
  } else {
    const duties = resolveDuties(office);
    const skills = findSkills(office, duties);
    checkSkills(skills, office);
    if (argv.includes("--list")) {
      doList(office, node, duties, skills);
    } else if (argv.includes("--check")) {
      doCheck(office, node, renderAgent(office, duties, skills));
    } else {
      if (argv.includes("--reinstall")) doClean(office, node);
      doInstall(office, node, renderAgent(office, duties, skills));
    }
  }
}
