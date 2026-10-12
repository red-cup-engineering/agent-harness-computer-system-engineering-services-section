import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-frontmatter";
import { sharedSourceRoot } from "./shared-source-roots.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED_LAW_PATH = join(PACKAGE_ROOT, "content/shared-house-law.json");
const ENGINEERING_METHOD_PATH = join(PACKAGE_ROOT, "content/engineering-method.md");
const FOUNDER_CORRECTION_TRIGGER_RULE = "Treat every substantive Founder correction or repeated direction as a verbatim Founder source, not a paraphrase or a new incident process. Recover and preserve its exact source locator before translating it. A language reading, assistant summary, or hand-authored schema is not itself a direction. Carry compatible sources cumulatively to the accepted, source-span structured-work-intent receiver; supersede only contradictory scope, immediately investigate the prior interpretation, and keep the corrective obligation open until its named receiver accepts evidence of changed behavior.";

function sourcePath(repoRoot, path) {
  if (isAbsolute(path)) return path;
  if (path === "package:skills") return sharedSourceRoot("skills");
  if (path === "package:rules") return sharedSourceRoot("rules");
  if (path.startsWith("package:skills/")) return join(sharedSourceRoot("skills"), path.slice("package:skills/".length));
  if (path.startsWith("package:rules/")) return join(sharedSourceRoot("rules"), path.slice("package:rules/".length));
  return join(repoRoot, path);
}

/**
 * Loads the portable engineering method from its one authored carrier.
 * @returns {string}
 */
export function loadEngineeringMethod() {
  const method = readFileSync(ENGINEERING_METHOD_PATH, "utf8").trim();
  if (method.length === 0) throw new Error("engineering method must not be empty");
  return method;
}

/**
 * Renders the one authored engineering method for a startup-instruction
 * surface. Callers own any surrounding managed-file marker.
 * @returns {string}
 */
export function renderEngineeringMethod() {
  return `## Engineering method\n\n${loadEngineeringMethod()}\n`;
}

/**
 * Loads the one shared JSON source of the root-instructions content every
 * runtime-specific harness (Codex's AGENTS.md, Claude's CLAUDE.md) renders
 * identically: conversation style, the base repository posture, semantic-
 * duplication policy, the shared skills root, the executive-receiver
 * bootstrap skill, the standing "there is never any rush" framing, and the
 * house-law pointer list. A harness's own policy supplies everything that
 * genuinely differs per runtime (actor identity, MCP server names inside
 * capability-discovery routes, per-turn duty wording, additional
 * repository-posture items) on top of this.
 * @returns {object} frozen shared law object
 */
export function loadSharedRootInstructionsLaw() {
  const law = JSON.parse(readFileSync(SHARED_LAW_PATH, "utf8"));
  if (typeof law.sharedSkillsRoot !== "string" || law.sharedSkillsRoot.length === 0) throw new Error("shared root-instructions law requires a sharedSkillsRoot");
  if (typeof law.receiverBootstrapSkill !== "string" || law.receiverBootstrapSkill.length === 0) throw new Error("shared root-instructions law requires a receiverBootstrapSkill");
  if (!Array.isArray(law.conversationStyle) || law.conversationStyle.length === 0) throw new Error("shared root-instructions law requires a non-empty conversationStyle");
  if (!law.conversationStyle.includes(FOUNDER_CORRECTION_TRIGGER_RULE)) throw new Error("shared root-instructions law must keep Founder corrections literal, superseded, and open through receiver-accepted changed behavior");
  if (!Array.isArray(law.repositoryMaturity?.operatingPosture) || law.repositoryMaturity.operatingPosture.length === 0) throw new Error("shared root-instructions law requires a non-empty base operatingPosture");
  if (!Array.isArray(law.houseLaw) || law.houseLaw.length === 0) throw new Error("shared root-instructions law requires a non-empty houseLaw");
  return Object.freeze(law);
}

/**
 * Every published `SKILL.md` directly under `sharedSkillsRoot`, sorted by
 * directory name, as repository-relative paths — the one skill-discovery
 * walk both harnesses reuse instead of each re-implementing the readdir.
 * @param {string} repoRoot
 * @param {string} sharedSkillsRoot - repository-relative path, e.g. ".claude/skills"
 * @returns {string[]}
 */
export function sharedSkillSources(repoRoot, sharedSkillsRoot) {
  const skillsRoot = sourcePath(repoRoot, sharedSkillsRoot);
  const packageOwned = sharedSkillsRoot === "package:skills";
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => packageOwned ? join(skillsRoot, entry.name) : join(sharedSkillsRoot, entry.name))
    .sort();
}

function readSkillDescription(skillPath) {
  const { frontmatter } = readMarkdownFrontmatter(readFileSync(skillPath, "utf8"));
  if (typeof frontmatter?.description !== "string" || frontmatter.description.length === 0) throw new Error(`skill is missing a frontmatter description: ${skillPath}`);
  return frontmatter.description;
}

/**
 * `- \`<path>\` — <description>` lines for every shared skill, read live off
 * each `SKILL.md`'s own frontmatter (never a copied list) so the section
 * cannot drift from what is actually installed.
 * @param {string} repoRoot
 * @param {string} sharedSkillsRoot
 * @returns {string[]}
 */
export function renderSkillLines(repoRoot, sharedSkillsRoot, runtimeSkillsRoot = sharedSkillsRoot) {
  return sharedSkillSources(repoRoot, sharedSkillsRoot).map(
    (path) => `- \`${join(runtimeSkillsRoot, path.split("/").at(-1), "SKILL.md")}\` — ${readSkillDescription(join(sourcePath(repoRoot, path), "SKILL.md"))}`,
  );
}

/**
 * Validates the fields of the shared root-instructions law that a runtime
 * policy is required to carry unmodified (semantic-deduplication policy
 * shape, receiver-bootstrap skill existence) plus the runtime's own
 * capability-discovery routes, house law, and skills root. Runtime-specific
 * boundaries (MCP reachability, actor identity, colleague roster) stay each
 * harness driver's own concern; this only guards the content this module
 * renders.
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.sharedSkillsRoot
 * @param {Array<{path: string, description: string}>} params.houseLaw
 * @param {{demand: string, server: string, tools: string[]}[]} params.capabilityDiscoveryRoutes
 * @param {string} params.perTurnDutyDefault
 * @returns {void}
 * @throws {Error} when a required section input is missing or does not resolve on disk
 */
export function assertRootInstructionsInputs({ repoRoot, sharedSkillsRoot, houseLaw, capabilityDiscoveryRoutes, perTurnDutyDefault }) {
  if (typeof perTurnDutyDefault !== "string" || perTurnDutyDefault.trim().length === 0) throw new Error("root instructions require a default per-turn duty");
  if (!Array.isArray(capabilityDiscoveryRoutes) || capabilityDiscoveryRoutes.length === 0) throw new Error("root instructions require at least one capability-discovery route");
  for (const route of capabilityDiscoveryRoutes) {
    if (typeof route?.demand !== "string" || typeof route?.server !== "string" || !Array.isArray(route?.tools) || route.tools.length === 0) throw new Error("each capability-discovery route requires a demand, a server, and at least one tool");
  }
  if (!Array.isArray(houseLaw) || houseLaw.length === 0) throw new Error("root instructions require a non-empty house-law list");
  for (const entry of houseLaw) {
    if (typeof entry?.path !== "string" || entry.path.length === 0 || typeof entry?.description !== "string" || entry.description.length === 0) throw new Error("each house-law entry requires a path and a description");
    const full = sourcePath(repoRoot, entry.path);
    if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`house-law entry is missing on disk: ${entry.path}`);
  }
  const skillsRoot = sourcePath(repoRoot, sharedSkillsRoot);
  if (!existsSync(skillsRoot) || !statSync(skillsRoot).isDirectory()) throw new Error(`shared skills root is missing: ${sharedSkillsRoot}`);
}

/**
 * Renders one runtime's complete root-instructions body: the generated-file
 * marker, the caller-supplied header (office/character identity — the
 * office and character records already live once, org-owned, per each
 * harness's own seating; this module only lays out the sections around
 * them), the optional standing framing, conversation style, the "who am I
 * here" identity block, the executive-receiver bootstrap, per-turn duty and
 * capability discovery, repository posture, semantic-duplication
 * instructions, house law, and the live skills list. This is the ONE place
 * either the Codex or the Claude harness driver's `renderRootInstructions`
 * composes this content — a harness driver supplies only what genuinely
 * differs per runtime (its own identity lines, capability-discovery routes,
 * per-turn duty wording, and any additional repository-posture items) and
 * calls this function rather than re-authoring the layout.
 * @param {object} params
 * @param {string} params.repoRoot
 * @param {string} params.marker - the harness's own generated-file HTML comment
 * @param {string[]} params.headerLines - pre-rendered "# office name" / normative-structure / session-character lines
 * @param {string[]} params.identityLines - pre-rendered "## Who am I here?" section, harness-specific
 * @param {string} params.receiverBootstrapSkill
 * @param {string} params.perTurnDutyDefault
 * @param {{demand: string, server: string, tools: string[]}[]} params.capabilityDiscoveryRoutes
 * @param {string[]} params.conversationStyle
 * @param {{heading: string, body: string}} [params.standingFraming] - optional; omitted harnesses skip the section
 * @param {string} [params.engineeringMethodReference] - optional rendered method section; defaults to the inline authored method
 * @param {string[]} params.operatingPosture - base + any harness-specific additions, already concatenated by the caller
 * @param {Array<{path: string, description: string}>} params.houseLaw
 * @param {string} params.sharedSkillsRoot
 * @returns {string}
 * @throws {Error} via assertRootInstructionsInputs when a required input is missing or unresolvable
 */
export function renderRootInstructionsBody({
  repoRoot,
  marker,
  headerLines,
  identityLines,
  receiverBootstrapSkill,
  perTurnDutyDefault,
  capabilityDiscoveryRoutes,
  conversationStyle,
  standingFraming,
  engineeringMethodReference,
  operatingPosture,
  houseLaw,
  sharedSkillsRoot,
  runtimeSkillsRoot = sharedSkillsRoot,
  runtimeRulesRoot = "",
  renderSkillCatalog = true,
}) {
  assertRootInstructionsInputs({ repoRoot, sharedSkillsRoot, houseLaw, capabilityDiscoveryRoutes, perTurnDutyDefault });
  if (typeof receiverBootstrapSkill !== "string" || !existsSync(sourcePath(repoRoot, receiverBootstrapSkill))) throw new Error(`receiver-bootstrap skill is missing: ${receiverBootstrapSkill}`);
  if (engineeringMethodReference !== undefined && (typeof engineeringMethodReference !== "string" || engineeringMethodReference.trim().length === 0)) throw new Error("engineering-method reference must be a non-empty string when supplied");
  return `${[
    marker,
    ...headerLines,
    ...(standingFraming ? ["", `## ${standingFraming.heading}`, "", standingFraming.body] : []),
    "",
    "## How I talk",
    "",
    ...conversationStyle.map((instruction) => `- ${instruction}`),
    "",
    ...identityLines,
    "",
    "## Start the work",
    "",
    `Load \`${join(runtimeSkillsRoot, "improve-skills-before-work", "SKILL.md")}\` when beginning substantive work, and reuse it while it remains current. Select only skills needed for the request. A short answer does not require a bootstrap cycle, work-queue read, duty selection, or skill repair. Change instructions only for an explicit request or a demonstrated procedural defect. Delegated agents load the relevant skills without commissioning another improver.`,
    "",
    "## End every turn",
    "",
    "Before every final response, perform the bounded retrospective required by `improve-skills-before-work`, even when no other skill was needed. Keep it active until the Founder disables it.",
    "",
    "## Available capability routes",
    "",
    perTurnDutyDefault,
    "",
    ...capabilityDiscoveryRoutes.map((route) => "- " + route.demand + ": `" + route.server + "` — " + route.tools.map((tool) => "`" + tool + "`").join(", ") + "."),
    "",
    "## Repository posture",
    "",
    ...operatingPosture.map((instruction) => `- ${instruction}`),
    "",
    (engineeringMethodReference ?? renderEngineeringMethod()).trimEnd(),
    "",
    "## Law",
    "",
    ...houseLaw.map((entry) => `- \`${runtimeRulesRoot ? join(runtimeRulesRoot, entry.path.split("/").at(-1)) : entry.path}\` — ${entry.description}`),
    ...(renderSkillCatalog ? ["", "## Skills", "", ...renderSkillLines(repoRoot, sharedSkillsRoot, runtimeSkillsRoot)] : []),
  ].join("\n")}\n`;
}

export const MANAGED_METHOD_BEGIN = "<!-- BEGIN Bare Cedar Fog managed engineering method -->";
export const MANAGED_METHOD_END = "<!-- END Bare Cedar Fog managed engineering method -->";
export const MANAGED_POSTURE_BEGIN = "<!-- BEGIN Bare Cedar Fog managed operating posture -->";
export const MANAGED_POSTURE_END = "<!-- END Bare Cedar Fog managed operating posture -->";

/**
 * Replaces the block between one marker pair inside an existing file body,
 * or appends the block when the file carries neither marker; refuses a torn
 * pair. The one splice mechanism every managed global block (engineering
 * method, operating posture) reuses instead of each re-implementing it.
 * @param {string} existing
 * @param {string} begin
 * @param {string} end
 * @param {string} block - the fully rendered block, including its own begin/end markers
 * @param {string} label - names the block kind in the torn-marker error
 * @returns {string}
 */
function spliceMarkedBlock(existing, begin, end, block, label) {
  const start = existing.indexOf(begin), stop = existing.indexOf(end);
  if ((start === -1) !== (stop === -1) || (stop !== -1 && stop < start)) throw new Error(`root-instructions file has an incomplete managed ${label} block`);
  if (start !== -1) return `${existing.slice(0, start)}${block}${existing.slice(stop + end.length).replace(/^\n?/, "")}`;
  if (existing.length === 0) return block;
  return `${existing.replace(/\s*$/, "")}\n\n${block}`;
}

/**
 * Installs a rendered managed block into one global root-instructions file,
 * creating the file when absent and leaving every byte outside the markers
 * untouched. The one install mechanism every managed global block reuses.
 * @param {{filePath: string, begin: string, end: string, render: () => string, label: string}} params
 * @returns {{path: string, disposition: string}}
 */
function installManagedBlock({ filePath, begin, end, render, label }) {
  if (typeof filePath !== "string" || filePath.length === 0) throw new TypeError("filePath must name the global root-instructions file");
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const next = spliceMarkedBlock(existing, begin, end, render(), label);
  if (next === existing) return Object.freeze({ path: filePath, disposition: `managed-${label}-current` });
  writeFileSync(filePath, next);
  return Object.freeze({ path: filePath, disposition: `managed-${label}-installed` });
}

/**
 * Reports whether a global root-instructions file carries one managed
 * block's current rendering; never writes.
 * @param {{filePath: string, begin: string, end: string, render: () => string, label: string}} params
 * @returns {{path: string, current: boolean, present: boolean}}
 */
function checkManagedBlock({ filePath, begin, end, render, label }) {
  if (typeof filePath !== "string" || filePath.length === 0) throw new TypeError("filePath must name the global root-instructions file");
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const present = existing.includes(begin) && existing.includes(end);
  const current = present && spliceMarkedBlock(existing, begin, end, render(), label) === existing;
  return Object.freeze({ path: filePath, present, current });
}

/**
 * The managed block every harness splices into its global root-instructions
 * file (Codex's `CODEX_HOME/AGENTS.md`, Claude's `~/.claude/CLAUDE.md`):
 * markers around the one rendered engineering method.
 * @returns {string}
 */
export function renderManagedEngineeringMethod() {
  return `${MANAGED_METHOD_BEGIN}\n${renderEngineeringMethod()}${MANAGED_METHOD_END}\n`;
}

/**
 * Replaces the managed block inside an existing file body, or appends it when
 * the file carries none; refuses a torn marker pair.
 * @param {string} existing
 * @returns {string}
 */
export function spliceManagedEngineeringMethod(existing) {
  return spliceMarkedBlock(existing, MANAGED_METHOD_BEGIN, MANAGED_METHOD_END, renderManagedEngineeringMethod(), "engineering-method");
}

/**
 * Installs the managed engineering-method block into one global
 * root-instructions file, creating the file when absent and leaving every
 * byte outside the markers untouched. The caller owns the harness-specific
 * path and any masking check (for example Codex's `AGENTS.override.md`).
 * @param {{filePath: string}} params
 * @returns {{path: string, disposition: "managed-engineering-method-installed" | "managed-engineering-method-current"}}
 */
export function installManagedEngineeringMethod({ filePath }) {
  return installManagedBlock({ filePath, begin: MANAGED_METHOD_BEGIN, end: MANAGED_METHOD_END, render: renderManagedEngineeringMethod, label: "engineering-method" });
}

/**
 * Reports whether a global root-instructions file carries the current
 * managed block; never writes.
 * @param {{filePath: string}} params
 * @returns {{path: string, current: boolean, present: boolean}}
 */
export function checkManagedEngineeringMethod({ filePath }) {
  return checkManagedBlock({ filePath, begin: MANAGED_METHOD_BEGIN, end: MANAGED_METHOD_END, render: renderManagedEngineeringMethod, label: "engineering-method" });
}

/**
 * The managed block carrying the shared root-instructions law's operating
 * posture — conversation style, the standing "no rush" framing, the
 * repository-maturity operating posture (architecture-first, primitive-layer-
 * outward, never leaf-first), and the house-law pointer list — into a global
 * root-instructions file. Codex's project-level `AGENTS.md` renders this same
 * shared law today via `renderRootInstructionsBody`; Claude's harness had no
 * counterpart at all, so this content never reached a Claude session except
 * by the Founder retyping it every time. `houseLaw` paths are rendered as
 * `.claude/rules/<name>.md`, matching where Claude Code itself reads them in
 * any given repository.
 * @returns {string}
 */
export function renderManagedOperatingPosture() {
  const law = loadSharedRootInstructionsLaw();
  return [
    MANAGED_POSTURE_BEGIN,
    "## How I talk",
    "",
    ...law.conversationStyle.map((instruction) => `- ${instruction}`),
    "",
    `## ${law.standingFraming.heading}`,
    "",
    law.standingFraming.body,
    "",
    "## Repository posture",
    "",
    ...law.repositoryMaturity.operatingPosture.map((instruction) => `- ${instruction}`),
    "",
    "## House law",
    "",
    ...law.houseLaw.map((entry) => `- \`.claude/rules/${entry.path.split("/").at(-1)}\` — ${entry.description}`),
    MANAGED_POSTURE_END,
  ].join("\n") + "\n";
}

/**
 * Replaces the managed operating-posture block inside an existing file body,
 * or appends it when the file carries none; refuses a torn marker pair.
 * @param {string} existing
 * @returns {string}
 */
export function spliceManagedOperatingPosture(existing) {
  return spliceMarkedBlock(existing, MANAGED_POSTURE_BEGIN, MANAGED_POSTURE_END, renderManagedOperatingPosture(), "operating-posture");
}

/**
 * Installs the managed operating-posture block into one global
 * root-instructions file, creating the file when absent and leaving every
 * byte outside the markers untouched.
 * @param {{filePath: string}} params
 * @returns {{path: string, disposition: "managed-operating-posture-installed" | "managed-operating-posture-current"}}
 */
export function installManagedOperatingPosture({ filePath }) {
  return installManagedBlock({ filePath, begin: MANAGED_POSTURE_BEGIN, end: MANAGED_POSTURE_END, render: renderManagedOperatingPosture, label: "operating-posture" });
}

/**
 * Reports whether a global root-instructions file carries the current
 * managed operating-posture block; never writes.
 * @param {{filePath: string}} params
 * @returns {{path: string, current: boolean, present: boolean}}
 */
export function checkManagedOperatingPosture({ filePath }) {
  return checkManagedBlock({ filePath, begin: MANAGED_POSTURE_BEGIN, end: MANAGED_POSTURE_END, render: renderManagedOperatingPosture, label: "operating-posture" });
}
