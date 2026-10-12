// Claude enterprise installer operation; the executable adapter lives in scripts/.
// The standing-block projection (renderBlock), its splice/unsplice mechanics,
// and the enterprise manifest live in ./enterprise-standing-block.mjs — this
// file orchestrates roster resolution, sibling-office installation, and the
// mesh-authority admission around them.

import { spawnSync as fsSpawnSync } from "node:child_process";
import * as defaultFilesystem from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createEnterpriseStandingBlock } from "./enterprise-standing-block.mjs";
import { readAgency } from "@red-cup-engineering/organizing/agency";

let HERE;
let REPO_ROOT;
let DRY_RUN;
let REINSTALL;
let argv;
let cwd;
let processApi;
let existsSync;
let readFileSync;
let readdirSync;
let fsMkdirSync;
let fsRmSync;
let statSync;
let fsWriteFileSync;
let standingBlock;

function configureFilesystem(filesystem = defaultFilesystem) {
  ({ existsSync, readFileSync, readdirSync, mkdirSync: fsMkdirSync, rmSync: fsRmSync, statSync, writeFileSync: fsWriteFileSync } = filesystem);
}

function argValue(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : undefined;
}

function die(message) {
  throw new Error(`install-an-enterprise-in-claude: ${message}`);
}

let revalidateMeshAuthority = () => {};

function meshRefusal(error) {
  const facts = error?.facts && Object.keys(error.facts).length ? `\n${JSON.stringify(error.facts)}` : "";
  die(`${error?.message ?? error}${facts}`);
}

function assertMeshAuthority() {
  try {
    revalidateMeshAuthority();
  } catch (error) {
    meshRefusal(error);
  }
}

// Every effect crosses this wrapper. The admission is installed before any
// wrapper can mutate the target, and is re-derived immediately beforehand.
// enterprise-standing-block.mjs's manifest writer is handed these same
// gated functions (never the raw filesystem) so its one mutating call stays
// under the same admission.
function spawnSync(...args) { assertMeshAuthority(); return fsSpawnSync(...args); }
function mkdirSync(...args) { assertMeshAuthority(); return fsMkdirSync(...args); }
function rmSync(...args) { assertMeshAuthority(); return fsRmSync(...args); }
function writeFileSync(...args) { assertMeshAuthority(); return fsWriteFileSync(...args); }

function rel(p) {
  return relative(REPO_ROOT, p) || ".";
}

function gatedFilesystem() {
  return { existsSync, readFileSync, mkdirSync, writeFileSync };
}

// Walk from the asking point UP, testing <D>/<shape> at each D — the same
// resolution as list-open-obligations.js's, because this script runs both
// flat in the pool and projected into a scripts/ directory two levels down.
function findUp(from, shape) {
  let d = from;
  for (;;) {
    const at = join(d, shape);
    if (existsSync(at)) return at;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

// The firm's one mesh-scope gate is the agent harness section's shared module.
function resolveAuthorityGate() {
  const gate = resolve(HERE, "../../../src/mesh-scope.mjs");
  if (existsSync(gate)) return gate;
  die("cannot find the shared mesh-scope authority gate — no enterprise install proceeds without the one firm-wide boundary rule");
}

async function admitMeshAuthority(enterprise, node, operation) {
  const authorityRoot = argValue("--authority-root");
  if (!authorityRoot || authorityRoot.startsWith("--")) {
    die("--authority-root is required; omission is not consent and no --force or free-text claim can replace target-local authority");
  }
  const gate = await import(pathToFileURL(resolveAuthorityGate()).href);
  try {
    const admission = gate.admitEnterpriseInstall({
      authorityRoot,
      sourceEnterprise: enterprise,
      targetNode: node,
      installer: "claude",
      operation,
      mode: DRY_RUN ? "dry-run" : "apply",
    });
    revalidateMeshAuthority = () => gate.revalidateEnterpriseInstall(admission);
    assertMeshAuthority();
    return admission.request;
  } catch (error) {
    meshRefusal(error);
  }
}

// --- the node and the enterprise --------------------------------------------------

function resolveNode(arg) {
  const dir = arg ? (isAbsolute(arg) ? arg : resolve(cwd, arg)) : cwd;
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    die(`node '${arg}' is not a directory. The node is where the enterprise gets installed; it must already exist.`);
  }
  return dir;
}

// An enterprise is a section whose agency records seat offices; it defaults to the node itself.
function resolveEnterprise(arg, node) {
  const dir = arg ? (isAbsolute(arg) ? arg : resolve(REPO_ROOT, arg)) : node;
  const inside = relative(REPO_ROOT, dir);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    die(
      `the root ${REPO_ROOT} does not contain the enterprise at ${dir} — the standing block cites paths ` +
        `relative to the root, and a root that does not hold the enterprise would bake lies into it. ` +
        `Pass --root as the repository root the enterprise seats under.`,
    );
  }
  if (roster(dir).length === 0) {
    die(`${rel(dir)} seats no offices in its agency records — that is an absence, not an empty enterprise.`);
  }
  return dir;
}

// --- the roster --------------------------------------------------------------------

// The roster is every office the agency registry seats in the enterprise's own section.
function roster(enterprise) {
  const agencyRoot = existsSync(join(REPO_ROOT, "lib")) ? join(REPO_ROOT, "lib") : REPO_ROOT;
  const sectionPath = relative(agencyRoot, enterprise).split("\\").join("/");
  return [...readAgency(agencyRoot).offices.values()]
    .filter((office) => office.sectionPath === sectionPath)
    .map((office) => ({ id: office.id, record: join(agencyRoot, office.source), duties: office.bearsDuty }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// --- the sibling installer: called, never copied ------------------------------------

// The sibling installer is called, never copied: the script beside this module's scripts.
function resolveSibling() {
  const sibling = resolve(HERE, "../scripts/install-claude-as-an-agent.mjs");
  if (!existsSync(sibling)) die(`cannot find the sibling installer at ${rel(sibling)} — this installs each office by calling it.`);
  return sibling;
}

function spawnSibling(sibling, officeArg, node, flags, doing, motion) {
  const args = [sibling, officeArg, node, "--root", REPO_ROOT, ...flags];
  const r = spawnSync(processApi.execPath, args, { stdio: "inherit" });
  if (r.status !== 0) {
    // The sweep sentence cites the manifest, and under a dry run nothing was
    // recorded — a witness must not cite a manifest that is not there.
    const sweep =
      motion === "install" && !DRY_RUN
        ? " Offices already installed are recorded in the enterprise manifest, so --clean can sweep them."
        : "";
    die(
      `the sibling installer exited ${r.status ?? `without a status (${r.error?.message ?? "spawn failed"})`} ${doing} — ` +
        `the ${motion} stops here; no partial success is reported as success.${sweep}`,
    );
  }
}

// --- the motions ---------------------------------------------------------------------

function agentTarget(node, id) {
  return join(node, ".claude/agents", `${id}.md`);
}

function doList(enterprise, node, offices) {
  for (const office of offices) {
    console.log(`agent\t${rel(office.record)}\t->\t${rel(agentTarget(node, office.id))}`);
  }
  console.log(`block\t${rel(enterprise)}\t->\t${rel(join(node, "CLAUDE.md"))}`);
}

function doInstall(enterprise, node, offices, sibling) {
  // Every local refusal fires before the first sibling spawn: a refused
  // install leaves the node untouched. A mid-roster sibling failure is the
  // one interruption after side effects begin, and the manifest — written
  // office by office below — is what keeps that sweepable.
  const block = standingBlock.renderBlock(enterprise, offices);
  const claudeMd = join(node, "CLAUDE.md");
  const { next, mode } = standingBlock.spliceBlock(claudeMd, block);

  const flags = [...(REINSTALL ? ["--reinstall"] : []), ...(DRY_RUN ? ["--dry-run"] : [])];
  for (const office of offices) {
    spawnSibling(sibling, office.record, node, flags, `installing office '${office.id}' into ${rel(node)}`, "install");
    if (!DRY_RUN) standingBlock.recordInManifest(node, office.id);
  }

  if (DRY_RUN) {
    console.log(
      `install-an-enterprise-in-claude: dry run — would splice the standing block into ${rel(claudeMd)} ` +
        `and record ${offices.length} offices in ${rel(standingBlock.manifestPath(node))}.`,
    );
    return;
  }

  writeFileSync(claudeMd, next);
  // A re-splice between markers a PRIOR install placed must keep the prior
  // splice's recorded mode: the separator fact belongs to the first splice,
  // and clean undoes the first splice, not the latest.
  const prior = standingBlock.readManifest(node).find(standingBlock.isBlockEntry);
  const recordedMode = mode === "in-place" && prior ? (prior.split(":")[1] ?? "in-place") : mode;
  standingBlock.recordInManifest(node, `CLAUDE.md:${recordedMode}`);
  console.log(`  spliced  ${rel(claudeMd)}  (${rel(enterprise)}, mode ${recordedMode})`);

  // Postcondition, checked rather than assumed: the block between the
  // markers is byte-identical to the projection, and every agent file exists.
  const readBack = readFileSync(claudeMd, "utf8");
  if (readBack.indexOf(block) === -1 || readBack.indexOf(block) !== readBack.lastIndexOf(block)) {
    die(`postcondition failed: the block in ${rel(claudeMd)} is not byte-identical to the projection of ${rel(enterprise)}.`);
  }
  for (const office of offices) {
    if (!existsSync(agentTarget(node, office.id))) {
      die(`postcondition failed: ${rel(agentTarget(node, office.id))} does not exist after install.`);
    }
  }

  console.log(
    `install-an-enterprise-in-claude: installed enterprise ${rel(enterprise)} into ${rel(node)} — ` +
      `${offices.length} offices, one standing block.`,
  );
}

// A directory this mechanism (or its sibling) created and then emptied by
// its own removals is removed too — an empty `agents/` or `.claude/` left
// behind is residue exactly like a stray file; a directory still holding
// something this mechanism did not put there is left untouched.
function removeIfEmptyDir(dir) {
  if (!existsSync(dir)) return;
  if (readdirSync(dir, { withFileTypes: true }).length === 0) rmSync(dir, { recursive: true, force: true });
}

// The sibling refuses to clean an office whose record seats nowhere — its
// resolver runs before its clean, and there is nothing left to resolve. Its
// install is exactly two facts at the node: the agent file, and the office's
// line in the sibling's manifest. The inverse is done here, and said so.
function cleanRetired(node, id, would) {
  const siblingManifest = join(node, ".claude/.claude-agent-manifest");
  if (!DRY_RUN) {
    rmSync(agentTarget(node, id), { force: true });
    if (existsSync(siblingManifest)) {
      const rest = readFileSync(siblingManifest, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((e) => e !== id);
      // A manifest holding no entries is removed rather than left behind as
      // a zero-byte witness — the same rule the sibling applies itself.
      if (rest.length) writeFileSync(siblingManifest, rest.sort().map((e) => `${e}\n`).join(""));
      else rmSync(siblingManifest, { force: true });
    }
    removeIfEmptyDir(join(node, ".claude/agents"));
  }
  console.log(
    `  ${would}  agents/${id}.md — office '${id}' seats nowhere in the roster any more, ` +
      `so the sibling's install is inverted here rather than through it.`,
  );
}

function doClean(enterprise, node, sibling) {
  if (!existsSync(standingBlock.manifestPath(node))) {
    console.log(`install-an-enterprise-in-claude: no enterprise manifest at ${rel(node)} — nothing to clean.`);
    return;
  }
  const entries = standingBlock.readManifest(node);
  const seated = new Map(roster(enterprise).map((o) => [o.id, o.record]));
  const would = DRY_RUN ? "dry run — would remove" : "removed";

  const blockEntry = entries.find(standingBlock.isBlockEntry);
  const claudeMd = join(node, "CLAUDE.md");
  if (blockEntry && existsSync(claudeMd)) {
    const mode = blockEntry.split(":")[1] ?? "in-place";
    const remaining = standingBlock.removeBlock(readFileSync(claudeMd, "utf8"), claudeMd, mode);
    if (remaining === null) {
      console.log(`  the block is already absent from ${rel(claudeMd)} — nothing to remove there.`);
    } else {
      if (!DRY_RUN) {
        if (mode === "created" && remaining === "") rmSync(claudeMd);
        else writeFileSync(claudeMd, remaining);
      }
      console.log(`  ${would}  block from ${rel(claudeMd)}  (mode ${mode})`);
    }
  }

  const flags = ["--clean", ...(DRY_RUN ? ["--dry-run"] : [])];
  for (const id of entries.filter((e) => !standingBlock.isBlockEntry(e))) {
    if (seated.has(id)) {
      spawnSibling(sibling, seated.get(id), node, flags, `cleaning office '${id}' from ${rel(node)}`, "clean");
    } else {
      cleanRetired(node, id, would);
    }
  }

  if (!DRY_RUN) {
    rmSync(standingBlock.manifestPath(node), { force: true });
    // Residue check, not a fresh removal: every file this mechanism and its
    // sibling wrote is already gone by this point, so this only fires when
    // that leaves `.claude/agents` and `.claude` holding nothing of anyone
    // else's — a directory still holding a foreign entry is left alone.
    removeIfEmptyDir(join(node, ".claude/agents"));
    removeIfEmptyDir(join(node, ".claude"));
  }
  console.log(
    DRY_RUN
      ? `install-an-enterprise-in-claude: dry run — would clean enterprise ${rel(enterprise)} from ${rel(node)}.`
      : `install-an-enterprise-in-claude: cleaned enterprise ${rel(enterprise)} from ${rel(node)}.`,
  );
}

// The deterministic portion is public for callers that need to assay a
// projection without admitting an install or spawning sibling installers.
export function renderEnterpriseStandingBlock({ enterprise, offices, repoRoot = process.cwd(), filesystem } = {}) {
  configureFilesystem(filesystem);
  REPO_ROOT = resolve(repoRoot);
  standingBlock = createEnterpriseStandingBlock({ repoRoot: REPO_ROOT, filesystem: gatedFilesystem() });
  return standingBlock.renderBlock(enterprise, offices);
}

// --- main ------------------------------------------------------------------------------

/**
 * @skill installing-an-enterprise-in-claude
 * @verb-phrase installing an enterprise in claude
 * @closure-kind process
 * @description Installs a whole enterprise into a node: every office seated in the enterprise's offices/ roster is installed as a subagent by calling installing-claude-as-an-agent once per office, and a generated standing block is spliced into <node>/CLAUDE.md between its markers so a fresh session at that node knows, with no other context, to delegate work to those offices and to run the obligation loop. Refuses an enterprise path holding no offices/ directory, an empty roster, a root that does not contain the enterprise, a torn marker pair, a roster record that yields no description, and a cited instrument that seats nowhere; a sibling installer's failure kills the install with its stderr shown and the offices already installed recorded in the manifest, so no partial success is reported as success and --clean can sweep the residue. Use to stand a node up as an enterprise's dispatcher; use the two sibling installers to seat one office; never edit the block by hand — CLAUDE.md between the markers is output, regenerated on the next install.
 *
 * @precondition the enterprise section seats offices in its agency records — their absence is an absence, not an empty enterprise
 * @precondition the repo root (--root, defaulting to the working directory) contains the enterprise, so every path the block cites renders true
 * @precondition --authority-root explicitly names the git worktree whose operated scope contains both the source enterprise and target node without crossing a checked-out submodule boundary
 * @precondition the roster seats at least one office, each id in exactly one of the three record shapes
 * @precondition the node exists and is a directory
 * @precondition the sibling installer seats in this section's scripts
 * @precondition every roster record yields a first sentence for its roster line
 * @precondition the node's CLAUDE.md, when present, holds both markers or neither — a torn pair is refused
 * @postcondition every roster office is installed as an agent at the node by the sibling installer, under its manifest discipline
 * @postcondition the node's CLAUDE.md holds the generated block between the markers, byte-identical to the projection, read back and checked
 * @postcondition the rest of the node's CLAUDE.md outside the markers is byte-identical to what was there before, and clean restores it byte-identically, guided by the splice mode the manifest records
 * @postcondition the node's enterprise manifest records each office as it installs, and the block's splice mode, so clean is exact even after a mid-roster failure
 * @witness each office installed, in the sibling installer's own witness lines, uncensored
 * @witness the block spliced and the file it landed in, and on dry run, what would be done rather than a claim that it was
 * @witness on refusal, the unmet precondition, named, and on a mid-roster failure, that the manifest holds what installed so clean can sweep it
 *
 * An enterprise install is the third relation between an office and a node.
 * installing-claude-as-an-office seats one office as the identity a node's
 * sessions step into; installing-claude-as-an-agent seats one office as a
 * colleague a session hands work to. This skill seats the WHOLE ROSTER as
 * colleagues, and teaches the node's own sessions what to do with them: the
 * session at an enterprise node holds no office itself — it is the
 * dispatcher, and the standing block in its CLAUDE.md is the whole of its
 * standing instruction.
 *
 * The block is a deterministic projection of the enterprise's pools — same
 * enterprise, same root, same block, from any working directory, because
 * every path it cites renders relative to a root that is checked to contain
 * the enterprise. It fabricates no roster fact: the office that attestation
 * belongs to is read from the roster (the bearer of attesting-a-work-product),
 * and an enterprise that seats no such office is told exactly that — the
 * operator is the witness. The instruments it cites are cited with the
 * enterprise's own pools passed explicitly, so the commands are true for a
 * non-default enterprise, not only for the one this repository grew first.
 *
 * The agents are not installed here; they are installed by the sibling,
 * called once per office and never copied — found beside this script in the
 * flat pool, or by walking up to the lib/management/skills pool of the unit
 * a projected copy seats under. Its refusals are this skill's refusals,
 * propagated uncensored, and a mid-roster failure stops the install with
 * everything already installed recorded in the enterprise manifest, so
 * --clean sweeps the residue rather than stranding it.
 *
 * ## One block, both markers
 *
 * The block lands in <node>/CLAUDE.md between
 * `<!-- installing-an-enterprise-in-claude: begin -->` and its end marker.
 * A file that does not exist is created holding only the block; a file
 * holding both markers has the block replaced in place, byte-exact, the
 * rest untouched; a file holding neither gets the block appended after one
 * separator newline. Which of the three happened is recorded in the
 * manifest as the block's splice mode, and clean undoes exactly that —
 * the separator is removed only when the splice added it, a created file
 * left holding nothing is removed, and a block spliced between pre-existing
 * markers is excised without touching a byte on either side. A file holding
 * ONE marker is a torn block — a contradiction to name, not a thing to
 * repair silently — and is refused.
 *
 * ## Run it
 *
 * ```sh
 * node .../install-an-enterprise-in-claude.js [<enterprise>] [<node>] --root <repo-root> --authority-root <git-worktree-root>
 * node .../install-an-enterprise-in-claude.js <enterprise> <node> --list --root <repo-root> --authority-root <git-worktree-root>
 * node .../install-an-enterprise-in-claude.js <enterprise> <node> --dry-run --root <repo-root> --authority-root <git-worktree-root>
 * node .../install-an-enterprise-in-claude.js <enterprise> <node> --clean --root <repo-root> --authority-root <git-worktree-root>
 * node .../install-an-enterprise-in-claude.js <enterprise> <node> --reinstall --root <repo-root> --authority-root <git-worktree-root>
 * ```
 * Every form also requires `--authority-root <git-worktree-root>`; it is
 * deliberately not defaulted from `--root`, because omission is not consent.
 *
 * <enterprise> is the section whose agency records (lib/agency) seat the
 * offices to install, defaulting to <node>. <node> is the directory whose
 * sessions receive the enterprise, defaulting to the working directory.
 * Installs are recorded in <node>/.claude/.claude-enterprise-manifest, each
 * office as it installs, so that --clean is exact: it removes the block by
 * the recorded splice mode (the rest of the file byte-identical), delegates
 * --clean per manifest office to the sibling — or, for an office whose
 * record no longer seats in the roster, performs the sibling's exact
 * inverse here and says so, since the sibling refuses to resolve a record
 * that is gone — and removes the manifest. A manifest-less clean reports
 * that there is nothing to clean, which is a report, not an error; a dry
 * run of clean says what it would do, never that it did.
 *
 * Known limit, stated rather than hidden: a manifest written before the
 * splice mode was recorded carries a bare `CLAUDE.md` line, and clean
 * degrades it to in-place — the non-destructive default, which touches no
 * byte outside the markers. An old separator-mode install cleaned through
 * such a manifest therefore leaves its one separator newline behind rather
 * than risk eating a byte that was never this mechanism's.
 *
 * ## What it refuses, and why that is the skill
 *
 * - **No offices/ at the enterprise path** — refused. That is an absence,
 *   not an empty enterprise; installing from it would invent a roster.
 * - **A root that does not contain the enterprise** — refused. The block's
 *   cited paths render relative to the root, and a root that does not hold
 *   the enterprise would bake lies into the node's standing instruction.
 * - **An empty roster** — refused. An enterprise with no offices installs
 *   nothing, and an install that does nothing must say so rather than
 *   succeed.
 * - **A torn marker pair** — refused. One marker without the other is a
 *   contradiction in the node's own record of itself.
 * - **A sibling installer failure** — fatal, stderr shown, the offices
 *   already installed left recorded so clean can sweep them. No partial
 *   success is reported as success.
 * - **A roster record yielding no sentence; a cited instrument seating
 *   nowhere** — refused. The block is a projection, and a projection that
 *   fabricates or cites what does not exist is a lie in the node's
 *   standing instruction.
 *
 * The question is always asked of the enterprise's pools, never of the
 * seated files: CLAUDE.md between the markers and .claude/agents/ are
 * output. Hand-editing them cannot provoke a refusal — reinstalling over
 * the edit is the correction, which is why the edit belongs in the record.
 *
 * ## When NOT to use
 *
 * - Not for seating one office — that is installing-claude-as-an-office
 *   (the identity a session steps into) or installing-claude-as-an-agent
 *   (one colleague a session delegates to).
 * - Not for authoring offices, duties, or skills — this installs what
 *   already exists.
 * - Not for editing the standing block. It is output: change the
 *   enterprise's records and reinstall.
 */
export async function installEnterpriseInClaude({
  argv: suppliedArgv = process.argv,
  cwd: suppliedCwd = process.cwd(),
  process: suppliedProcess = process,
  filesystem,
} = {}) {
  configureFilesystem(filesystem);
  argv = suppliedArgv;
  cwd = suppliedCwd;
  processApi = suppliedProcess;
  HERE = dirname(fileURLToPath(import.meta.url));
  REPO_ROOT = resolve(argValue("--root") ?? cwd);
  DRY_RUN = argv.includes("--dry-run");
  REINSTALL = argv.includes("--reinstall");
  standingBlock = createEnterpriseStandingBlock({ repoRoot: REPO_ROOT, filesystem: gatedFilesystem() });

const FLAGS_TAKING_VALUE = new Set(["--root", "--authority-root"]);
const BOOLEAN_FLAGS = new Set(["--list", "--dry-run", "--clean", "--reinstall"]);
const positionals = [];
for (let i = 2; i < argv.length; i++) {
  const arg = argv[i];
  if (arg.startsWith("--")) {
    if (FLAGS_TAKING_VALUE.has(arg)) {
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) die(`${arg} requires a value`);
      i++;
    } else if (!BOOLEAN_FLAGS.has(arg)) {
      die(`unknown option '${arg}' — authority cannot be widened by an unruled flag`);
    }
    continue;
  }
  positionals.push(arg);
}

if (argv.filter((arg) => arg === "--authority-root").length !== 1) {
  die("--authority-root must be supplied exactly once");
}
for (const flag of FLAGS_TAKING_VALUE) {
  if (argv.filter((arg) => arg === flag).length > 1) die(`${flag} must not be supplied more than once`);
}
if (positionals.length > 2) die(`unexpected positional argument '${positionals[2]}' — free text is not an authority claim`);
if (argv.includes("--reinstall") && (argv.includes("--clean") || argv.includes("--list"))) {
  die("--reinstall cannot be combined with --clean or --list; one admission binds one exact operation");
}

let node = resolveNode(positionals[1]);
let enterprise = resolveEnterprise(positionals[0], node);
const operation = argv.includes("--clean")
  ? "clean"
  : argv.includes("--list")
    ? "list"
    : REINSTALL
      ? "reinstall"
      : "install";
const admittedRequest = await admitMeshAuthority(enterprise, node, operation);
enterprise = admittedRequest.sourceEnterprise;
node = admittedRequest.targetNode;
const sibling = resolveSibling();

if (argv.includes("--clean")) {
  doClean(enterprise, node, sibling);
} else {
  const offices = roster(enterprise);
  if (offices.length === 0) {
    die(
      `the roster of ${rel(enterprise)} is empty — an enterprise with no offices installs nothing, ` +
        `and an install that does nothing must say so rather than succeed.`,
    );
  }
  if (argv.includes("--list")) {
    doList(enterprise, node, offices);
  } else {
    doInstall(enterprise, node, offices, sibling);
  }
}
assertMeshAuthority();
}
