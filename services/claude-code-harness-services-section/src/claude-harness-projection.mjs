/**
 * The Claude Code harness of a node, projected from the corpus by the node's MetroPlat. Nothing
 * here is authored by hand, and nothing projected is an authority (MetroPlat architecture §8.7):
 *
 * - every agency skill is a native Claude Code skill, `.claude/skills/<name>/SKILL.md`: Claude Code
 *   lists a skill by its description and loads its body only when it is used, so the whole corpus is
 *   at hand without being carried (unlike the 2026-10-06 registry that put every skill's text in every
 *   session's context);
 * - every office that holds skills is a named agent, `.claude/agents/<name>.md`, seated or vacant,
 *   naming its skills in `skills:` so Claude Code loads them into the agent from their one projection;
 *   a record whose id another section's record holds is named by its id and a digest of its key, never dropped;
 * - no hook is projected (the Leader removed every hook and context injection, 2026-10-26), and the
 *   resource guard an earlier projection registered is retracted;
 * - `.claude/CLAUDE.md` imports the house's own overview (`@services/README.md`) and carries the offices
 *   the session's harness character holds;
 * - the MetroPlat faces the node reaches are its MCP servers, and they are its only ones: a
 *   session's whole toolkit is MetroPlat, and the apps MetroPlat hosts (L-Space among them) are
 *   reached as its verbs, never as servers of their own beside it.
 *
 * The projection owns `.claude/agents/` and `.claude/skills/` whole, so a file there it does not yield is one
 * an earlier projection wrote: projecting again removes it and a check reports it, read from the directories
 * themselves rather than from a list the projection keeps of its own writes. Of `.claude/settings.local.json` the
 * projection owns its local resource-hook registration, the `env` keys of its session budget, `permissions.deny` and
 * `enabledMcpjsonServers` (the approval of exactly the servers it writes, so a session connects without a prompt), and of
 * `.mcp.json` the whole server list; any server it does not name is removed on write and reported
 * as drift on check.
 */
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import {harnessBindings}from"@red-cup-engineering/organizing/agency/organs";
import { incumbenciesOf, officeReading } from "@red-cup-engineering/organizing/agency";
import { harnessAgencyAt } from "../../../src/agency-source.mjs";
import { projectOfficeAgent } from "./install-claude-as-an-agent.mjs";
import { mergeHostResourceHooks } from "../../../src/host-resource-hook.mjs";

const SETTINGS = ".claude/settings.local.json";
const MCP = ".mcp.json";
/** The corpus's own account of the house, imported into `.claude/CLAUDE.md` by reference so it has one source. */
const HOUSE_OVERVIEW = "services/README.md";

/**
 * What a session may hold in context. A session keeps the model's full window: study that spans
 * the corpus loses its thread when it is compacted at 167k, and on 2026-10-02 the founder lifted the
 * 200k cap of 2026-09-28. Spend still grows with context, since every call re-reads all of it, so
 * tool output is cut before it lands, and the token-usage fold's `byContext` bands report the cost.
 */
export const SESSION_BUDGET = Object.freeze({
  BASH_MAX_OUTPUT_LENGTH: "20000",
  MAX_MCP_OUTPUT_TOKENS: "8000",
});

/**
 * The commands a session at the node may never run: none. Routine git is never blocked by the harness (the
 * agent-harness specification, 4.3). The Leader, 2026-10-10: "I DIDNT WRITE OR APPROVE OF THIS SHIT BLCOKING YOU
 * FROM DONIG THE WORK." Another session's uncommitted work is protected by how a session lands its own files
 * (commit-paths), never by a ban on git verbs.
 */
export const SHARED_CHECKOUT_DENY = Object.freeze([]);

const withoutFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, "").trim();
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {});

/** Claude Code names a skill or agent with at most 64 lowercase letters, digits and hyphens. */
const NATIVE_NAME_MAX = 64;
const nativeId = (id) => String(id).toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");

/**
 * One native name per record. A record keeps its own id; a record whose id another section's record
 * already holds is named by its id and a digest of its registry key, so no record of the corpus is
 * dropped for sharing an id and every name is the same on every projection.
 */
function nativeNamer() {
  const taken = new Set();
  return (id, key) => {
    let name = nativeId(id).slice(0, NATIVE_NAME_MAX);
    if (taken.has(name)) {
      const digest = createHash("sha256").update(key).digest("hex").slice(0, 6);
      name = `${nativeId(id).slice(0, NATIVE_NAME_MAX - 7)}-${digest}`;
    }
    taken.add(name);
    return name;
  };
}

/** A skill record's description, at most Claude Code's 1024 characters: the record's own, else its body's first paragraph. */
function skillDescription(record, body) {
  const own = String(record.description ?? "").trim();
  const text = own || body.split(/\n\s*\n/u).find((paragraph) => paragraph.trim() && !paragraph.startsWith("#"))?.trim() || String(record.name ?? record.id);
  return text.replace(/\s+/gu, " ").slice(0, 1024);
}

/**
 * Every skill of the agency as a native Claude Code skill, `.claude/skills/<name>/SKILL.md`. Claude Code
 * lists each by its description and loads its body only when a session or agent uses it, so the whole
 * corpus is available without any of it being carried until it is called on. The body is the record's
 * own method; the files a skill names stay at its recorded directory, named in the skill.
 */
function projectSkills(agency, files, obstructions) {
  const name = nativeNamer();
  const names = new Map();
  for (const record of [...agency.skills.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const source = String(record.source ?? "");
    let body;
    try {
      body = typeof record.body === "string" && record.body.trim() ? withoutFrontmatter(record.body)
        : source.endsWith(".md") ? withoutFrontmatter(readFileSync(path.join(agency.root, source), "utf8"))
        : [record.description, record.method].filter((part) => typeof part === "string" && part.trim()).join("\n\n");
    } catch (error) {
      obstructions.push({ skill: record.key, reason: `its record does not read: ${error.message}` });
      continue;
    }
    const native = name(record.id, record.key);
    names.set(record.key, native);
    const directory = path.posix.dirname(source);
    files.set(`.claude/skills/${native}/SKILL.md`,
      `---\nname: ${native}\ndescription: ${JSON.stringify(skillDescription(record, body))}\n---\n\n` +
      `<!-- Projected by claude-harness-project from ${source}. Never edit it: change the record, and project again. -->\n\n` +
      `${body}\n\n` +
      `This skill's record is \`${source}\`; files it names are relative to \`${directory}\`.\n`);
  }
  return names;
}


/**
 * The offices a session at the node holds, read from the records: the session is its harness
 * character's mask, so it holds every office that character is seated in at dignitas, each in full
 * with the skills realizing its duties (the projection installing-claude-as-an-agent renders).
 * Priming happens here, once, at projection time. The rules it acts under are not projected: the
 * rule store is settled at runtime (agency rules with rule-admit's beside them), so the session's
 * entry reads them live.
 */
function heldOffices(agency, readings, harness, skillNames, obstructions) {
  const characters = new Set(harnessBindings(agency,{harness}).map(binding=>binding.character.key));
  const offices = [];
  for (const reading of readings) {
    if (!reading.seats.some((seat) => seat.state === "dignitas" && characters.has(seat.holder))) continue;
    try {
      const text = withoutFrontmatter(projectOfficeAgent({ repoRoot: agency.root, agency, office: reading.office, skillNames }).text);
      offices.push(text.trim());
    } catch (error) {
      obstructions.push({ office: reading.office, reason: `the session's own office does not project: ${error.message}` });
    }
  }
  return offices.length ? ["# The offices this session holds", ...offices].join("\n\n") : "";
}

/**
 * The harness a node's sessions open into, read from the agency records under `agencyRoot`,
 * with no effect. `settlementRoot` is retained for the host interface; resource admission
 * uses this harness's local owning source, not a network lifecycle command. `mcpServers` are the MetroPlat faces
 * the node reaches, by server name. `standing`, when the host has it, is the always-loaded context
 * every session at the node opens with (the host's settled knowledge of what it has been told),
 * written as `.claude/CLAUDE.md`, which the harness loads without any hook. `budget` is the
 * session environment the node's sessions run under, `SESSION_BUDGET` unless the host holds another;
 * `deny` the commands they may never run, `SHARED_CHECKOUT_DENY` unless the host holds another.
 */
export function projectClaudeHarness({ node, agencyRoot, agencySections, environment, settlementRoot, hookCommand, harness = "claude", mcpServers = {}, standing, budget = SESSION_BUDGET, deny = [] }) {
  node = path.resolve(node);
  const agency = harnessAgencyAt(path.resolve(agencyRoot), { agencySections, environment });
  const obstructions = [];
  const files = new Map();

  const skillNames = projectSkills(agency, files, obstructions);

  // Every office that holds skills is an agent a session can delegate to, seated or not: an office is
  // the work it is charged with, and a vacant one is work no one else is carrying. Seated offices come
  // first, so where two sections' offices share an id the seated one keeps it.
  const readings = [...agency.offices.keys()].map((key) => officeReading(agency, key));
  const seated = (reading) => incumbenciesOf(agency, reading.office).some((seat) => seat.state === "dignitas");
  const agentName = nativeNamer();
  const agents = new Set();
  for (const reading of [...readings].sort((a, b) => Number(seated(b)) - Number(seated(a)) || a.office.localeCompare(b.office))) {
    if (reading.skills.length === 0) continue;
    try {
      const agent = projectOfficeAgent({ repoRoot: agency.root, agency, office: reading.office, name: agentName(reading.id, reading.office), skillNames });
      agents.add(agent.id);
      files.set(`.claude/agents/${agent.id}.md`, agent.text);
    } catch (error) {
      obstructions.push({ office: reading.office, reason: error.message });
    }
  }

  const held = heldOffices(agency, readings, harness, skillNames, obstructions);
  if (existsSync(path.join(node, HOUSE_OVERVIEW))) standing = [`@${HOUSE_OVERVIEW}`, String(standing ?? "").trim()].filter(Boolean).join("\n\n");
  else obstructions.push({ standing: HOUSE_OVERVIEW, reason: "the house overview is absent at the node" });
  if ((typeof standing === "string" && standing.trim() !== "") || held !== "") {
    files.set(".claude/CLAUDE.md", `<!-- Projected by claude-harness-project from this MetroPlat's standing instructions and the agency records. Never edit it: change what it is projected from, and project again. -->\n\n${[String(standing ?? "").trim(), held].filter(Boolean).join("\n\n")}\n`);
  }

  // No hook: the Leader removed every Claude Code hook and context injection on 2026-10-26. Writing an
  // empty set retracts the resource guard an earlier projection registered and leaves foreign hooks alone.
  const hooks = {};

  return Object.freeze({
    kind: "claude-harness.projection",
    node,
    settlementRoot: path.resolve(settlementRoot),
    files,
    hooks,
    env: Object.freeze({ ...budget }),
    deny: Object.freeze([...deny]),
    mcpServers,
    counts: { skills: skillNames.size, agents: agents.size, events: Object.keys(hooks).length, mcpServers: Object.keys(mcpServers).length, standing: files.has(".claude/CLAUDE.md"), budget: Object.keys(budget).length, deny: deny.length },
    obstructions: Object.freeze(obstructions),
  });
}

/** The directories the projection owns whole. */
const OWNED_DIRECTORIES = Object.freeze([".claude/agents", ".claude/skills"]);

/** Budget keys an earlier projection set and this one retracts: a key leaves `SESSION_BUDGET` by moving here. */
export const RETIRED_SESSION_BUDGET_KEYS = Object.freeze([]);

/** Every file in the directories the projection owns at a node, relative to it. */
function ownedFilesAt(node) {
  const found = [];
  const walk = (relative) => {
    let entries;
    try { entries = readdirSync(path.join(node, relative), { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(child);
      else found.push(child);
    }
  };
  for (const directory of OWNED_DIRECTORIES) walk(directory);
  return found.sort();
}

/** Write a projection at its node: its files, `hooks`, its budget's `env` and `permissions.deny` in the settings, its servers in `.mcp.json`;
 *  files an earlier projection wrote that this one does not yield are removed. */
export function writeClaudeHarness(projection) {
  const { node } = projection;
  const written = [];
  for (const [relative, text] of projection.files) {
    const file = path.join(node, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    written.push(relative);
  }
  const removed = ownedFilesAt(node).filter((relative) => !projection.files.has(relative));
  for (const relative of removed) {
    rmSync(path.join(node, relative), { force: true });
    const dir = path.dirname(path.join(node, relative));
    try { rmSync(dir, { recursive: false }); } catch { /* a directory still holding something stays */ }
  }
  const settingsFile = path.join(node, SETTINGS);
  mkdirSync(path.dirname(settingsFile), { recursive: true });
  const settings = readJson(settingsFile);
  // A budget key the projection retracted leaves the settings, so a lifted limit leaves the node with
  // the projection that lifted it.
  const retired = RETIRED_SESSION_BUDGET_KEYS.filter((key) => !(key in projection.env) && key in (settings.env ?? {}));
  const env = Object.fromEntries(Object.entries({ ...settings.env, ...projection.env }).filter(([key]) => !retired.includes(key)));
  writeFileSync(settingsFile, `${JSON.stringify({ ...settings, env, hooks: mergeHostResourceHooks(settings.hooks, projection.hooks, node), permissions: { ...settings.permissions, deny: projection.deny }, enabledMcpjsonServers: Object.keys(projection.mcpServers) }, null, 2)}\n`);
  const mcpFile = path.join(node, MCP);
  const mcp = readJson(mcpFile);
  const foreign = Object.keys(mcp.mcpServers ?? {}).filter((name) => !(name in projection.mcpServers));
  writeFileSync(mcpFile, `${JSON.stringify({ ...mcp, mcpServers: projection.mcpServers }, null, 2)}\n`);
  // A face's environment carries the credentials MetroPlat presents to the apps it hosts.
  chmodSync(mcpFile, 0o600);
  removed.push(...foreign.map((name) => `mcp:${name}`), ...retired.map((key) => `env:${key}`));
  return Object.freeze({ kind: "claude-harness.written", node, counts: projection.counts, written: written.length, removed, obstructions: projection.obstructions });
}

/** What differs between a projection and its node, with no effect. */
export function checkClaudeHarness(projection) {
  const { node } = projection;
  const drift = [];
  for (const [relative, text] of projection.files) {
    const file = path.join(node, relative);
    if (!existsSync(file)) drift.push({ path: relative, reason: "absent" });
    else if (readFileSync(file, "utf8") !== text) drift.push({ path: relative, reason: "differs" });
  }
  for (const relative of ownedFilesAt(node)) {
    if (!projection.files.has(relative)) drift.push({ path: relative, reason: "no longer projected" });
  }
  const settings = readJson(path.join(node, SETTINGS));
  if (JSON.stringify(settings.hooks) !== JSON.stringify(mergeHostResourceHooks(settings.hooks, projection.hooks, node))) drift.push({ path: SETTINGS, reason: "hooks differ" });
  for (const [key, value] of Object.entries(projection.env)) {
    if (settings.env?.[key] !== value) drift.push({ path: SETTINGS, reason: `env ${key} is not ${value}` });
  }
  if (JSON.stringify(settings.permissions?.deny ?? []) !== JSON.stringify(projection.deny)) drift.push({ path: SETTINGS, reason: "permissions.deny differs" });
  if (JSON.stringify(settings.enabledMcpjsonServers ?? []) !== JSON.stringify(Object.keys(projection.mcpServers))) drift.push({ path: SETTINGS, reason: "enabledMcpjsonServers differs" });
  const servers = readJson(path.join(node, MCP)).mcpServers ?? {};
  for (const [name, server] of Object.entries(projection.mcpServers)) {
    if (JSON.stringify(servers[name]) !== JSON.stringify(server)) drift.push({ path: MCP, reason: `server '${name}' differs` });
  }
  for (const name of Object.keys(servers).filter((name) => !(name in projection.mcpServers))) drift.push({ path: MCP, reason: `server '${name}' is not a MetroPlat face` });
  return Object.freeze({ kind: "claude-harness.check", node, current: drift.length === 0, drift: Object.freeze(drift), obstructions: projection.obstructions });
}

const nodeInput = (id) => schemaFrom({ $id: `claude-harness/${id}`, type: "object", properties: { node: { type: "string", description: "The directory whose sessions open into the harness; the repository by default." } }, additionalProperties: false });

/** The harness projection as a MetroPlat operation family. `host` is what the MetroPlat hosting
 *  it knows: `repoRoot`, `agencyRoot`, its settlement `dataRoot`, its `hookCommand` if any, and
 *  `mcpServers()`, the faces a node reaches it through, and `standing()` if it holds settled knowledge. */
export function claudeHarnessOperations(host) {
  const project = ({ node } = {}) => projectClaudeHarness({
    node: node ?? host.repoRoot,
    agencyRoot: host.agencyRoot,
    agencySections: host.agencySections,
    environment: host.environment,
    settlementRoot: host.dataRoot,
    hookCommand: host.hookCommand,
    harness: host.harness,
    mcpServers: host.mcpServers(),
    standing: host.standing?.(),
  });
  return Object.freeze([
    operation({
      verb: "claude-harness-project",
      summary: "Project a node's Claude Code harness from the corpus: every agency skill as a native skill, every office holding skills as an agent, the house overview and held offices as CLAUDE.md, its session token budget, the commands it denies, and this MetroPlat's faces as MCP servers.",
      description: "Rewrites .claude/CLAUDE.md (the host's standing knowledge), .claude/skills, .claude/agents, the hooks, budget env and permissions.deny of .claude/settings.local.json and this MetroPlat's servers in .mcp.json at the node, removing what an earlier projection wrote and the records no longer yield.",
      domain: nodeInput("project"),
      reads: ["agency/skills", "agency/offices", "agency/incumbencies"],
      writes: ["node/.claude", "node/.mcp.json"],
      effects: { class: "local", replay: "safe", coordination: "coordination-free", deterministic: "unmeasured", totality: "unmeasured" },
      run: (input) => writeClaudeHarness(project(input)),
    }),
    operation({
      verb: "claude-harness-check",
      summary: "Read how a node's Claude Code harness differs from its projection from the corpus.",
      domain: nodeInput("check"),
      reads: ["agency/skills", "agency/offices", "agency/incumbencies", "node/.claude", "node/.mcp.json"],
      run: (input) => checkClaudeHarness(project(input)),
    }),
  ]);
}
