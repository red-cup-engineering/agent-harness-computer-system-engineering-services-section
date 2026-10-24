#!/usr/bin/env node
/**
 * section-custody-hook — refuse executable source written into a Science, Operations, Public or Group section.
 *
 * The 561 Group's rule `science-engineering-operations-parameterize-in-order` (561-group-services-section
 * lib/agency/rules/): Science holds knowledge, Engineering holds executable implementations, Operations holds the
 * data that parameterizes Engineering, and Group/Public sections hold the data that parameterizes Operations. Every
 * implementation lives in a red-cup-engineering repository. Agents kept writing code into the other orgs anyway;
 * this hook stops a harness session before the file exists.
 *
 * Contract (shared with ./host-resource-hook.mjs): the PreToolUse event arrives as JSON on stdin; a refusal
 * leaves as `hookSpecificOutput` with `permissionDecision: "deny"` on stdout and exit 0; anything else prints
 * nothing. Claude Code: Write, Edit, MultiEdit and NotebookEdit carry `tool_input.file_path` (or
 * `notebook_path`). Codex: file edits arrive as an `apply_patch` envelope in `tool_input.command`; every
 * `*** Add File:` / `*** Update File:` / `*** Move to:` path is judged.
 *
 * A path with an executable-source extension is refused when the nearest enclosing git repository's `origin`
 * belongs to one of the custody orgs (lenticule-science, coesite-operations, causeway-services, 561-group), or
 * when one of its directories is named `*-operations-services-section`. The owner, not the directory name,
 * decides: a Red Cup checkout keeps working under whatever directory it was cloned into. `node_modules` and
 * generated `pagefind` bundles are exempt, as is a repository's own harness state (`.claude/`, `.codex/` at its root,
 * where sessions keep release scripts); repositories checked out beneath them are judged by their own owner.
 * `legacy/` trees are not exempt.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CUSTODY_ORGS = new Set(["lenticule-science", "coesite-operations", "causeway-services", "561-group"]);
const OPERATIONS = /(^|-)operations-services-section$/u;
const CODE = /\.(?:mjs|cjs|js|jsx|mts|cts|ts|tsx|py|sh|bash|rb|go|rs|scm|el|lua|php|pl|rkt|fnl)$/iu;
const EXEMPT = new Set(["node_modules", "pagefind"]);
const HARNESS_STATE = new Set([".claude", ".codex"]);
const EDIT_TOOLS = /^(?:Write|Edit|MultiEdit|NotebookEdit)$/u;
const PATCH_PATH = /^\*\*\* (?:Add File|Update File|Move to): (.+)$/gmu;
const RULE = "https://github.com/561-group/561-group-services-section/blob/main/lib/agency/rules/science-engineering-operations-parameterize-in-order.json";

/** The working-tree root and git config file of the repository holding `dir`, following `.git` files (submodules, worktrees). */
function repositoryOf(dir) {
  for (let at = dir; ; at = path.dirname(at)) {
    const dotGit = path.join(at, ".git");
    if (existsSync(dotGit)) {
      let gitDir = dotGit;
      if (statSync(dotGit).isFile()) {
        const target = /^gitdir:\s*(.+)$/mu.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
        if (!target) return undefined;
        gitDir = path.resolve(at, target);
      }
      const common = path.join(gitDir, "commondir");
      if (existsSync(common)) gitDir = path.resolve(gitDir, readFileSync(common, "utf8").trim());
      return { root: at, config: path.join(gitDir, "config") };
    }
    if (path.dirname(at) === at) return undefined;
  }
}

/** The GitHub owner of the repository whose working tree holds `dir`, from its `origin` remote. */
export function ownerOf(dir) {
  const config = repositoryOf(dir)?.config;
  if (!config || !existsSync(config)) return undefined;
  const origin = /\[remote "origin"\][^[]*?\burl\s*=\s*(\S+)/u.exec(readFileSync(config, "utf8"))?.[1];
  return origin && /github\.com[:/]([^/]+)\//u.exec(origin)?.[1];
}

/** Whether writing `file` (absolute, or relative to `cwd`) puts executable source into a custody section. */
export function isSectionCode(file, cwd = process.cwd()) {
  if (typeof file !== "string" || file === "" || !CODE.test(file)) return false;
  const absolute = path.resolve(cwd, file);
  const directories = absolute.split(path.sep).slice(0, -1);
  if (directories.some((part) => EXEMPT.has(part))) return false;
  if (directories.some((part) => OPERATIONS.test(part))) return true;
  try {
    const root = repositoryOf(path.dirname(absolute))?.root;
    if (root && HARNESS_STATE.has(path.relative(root, absolute).split(path.sep)[0])) return false;
    return CUSTODY_ORGS.has(ownerOf(path.dirname(absolute)));
  } catch {
    return false;
  }
}

/** The paths one PreToolUse event would write. */
export function writtenPaths(input) {
  const tool = String(input?.tool_name ?? "");
  const toolInput = input?.tool_input ?? {};
  if (EDIT_TOOLS.test(tool)) return [toolInput.file_path ?? toolInput.notebook_path].filter((p) => typeof p === "string");
  const command = Array.isArray(toolInput.command) ? toolInput.command.join("\n") : String(toolInput.command ?? "");
  if (!command.includes("*** Begin Patch")) return [];
  return [...command.matchAll(PATCH_PATH)].map((match) => match[1].trim());
}

/** The hook's answer to one event: the `hookSpecificOutput` refusal, or undefined to let the call run. */
export function decide(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const refused = writtenPaths(input).filter((file) => isSectionCode(file, cwd));
  if (refused.length === 0) return undefined;
  return {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `section custody: ${refused.join(", ")} would put executable source into a Science, Operations, Public or Group section. `
      + "Those sections hold knowledge and the data (lib/agency, content, data) that Engineering software reads; build or repair the capability "
      + `in its red-cup-engineering *-engineering-services-section and reference it from the section's data instead. Rule: ${RULE}`,
  };
}

/** The `hooks` object registering this hook (Claude Code settings or Codex hooks.json). */
export function custodyHookEntries(hookPath = fileURLToPath(import.meta.url), { provider = "claude", node = process.execPath, timeout = 10 } = {}) {
  const command = `'${node}' '${hookPath}'`;
  return { PreToolUse: [{ matcher: provider === "codex" ? "Bash" : "Write|Edit|MultiEdit|NotebookEdit", hooks: [{ type: "command", command, timeout }] }] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = decide(JSON.parse(readFileSync(0, "utf8")));
    if (output !== undefined) process.stdout.write(JSON.stringify({ hookSpecificOutput: output }));
  } catch {
    // An unreadable event is not this hook's to refuse.
  }
}
