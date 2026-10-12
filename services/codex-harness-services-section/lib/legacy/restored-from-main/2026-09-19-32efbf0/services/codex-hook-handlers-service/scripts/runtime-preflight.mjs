// Static preflight of one machine's installed Codex runtime: that the runtime
// files the harness projection wrote exist, that every absolute path they name
// resolves, that global and project skill names do not collide, that the
// runtime's own thread index and transcript tree agree, and that the machine's
// harness parity baseline is internally valid. Every machine-specific fact --
// the runtime root, the territory, the parity baseline -- is read from the
// enterprise configuration record. Projection currency is not checked here;
// the agent-harness projection owns that through its own --check.
//
// This module reaches the world, so it lives beside the script faces and
// reaches it only through the registry's effect owners: paths through
// filepath-services-section, existence and kind through stat-path-service,
// directory levels through directory-services-section, file text through
// file-services, and the one external program through
// execute-javascript-node-command-service.
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { listDirectoryEntries } from "@red-cup-engineering/directory-services-section/list-directory-entries";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { statPath } from "@red-cup-engineering/stat-path-service";
import { evaluateHarnessParity, loadHarnessParityBaseline } from "@red-cup-engineering/harness-routing-service/harness-parity";
import { codexEnterpriseConfiguration } from "@red-cup-engineering/codex-agent-enterprise-service/configuration";

const configuration = codexEnterpriseConfiguration();
const REPO = configuration.territory;
const RUNTIME = configuration.runtimeRoot;
const PARITY_BASELINE = confinePath({ root: configuration.agentsRoot, path: configuration.harnessParityBaseline }).path;
const under = (root, path) => confinePath({ root, path }).path;

async function exists(path) {
  return (await statPath({ path })).exists;
}

async function isFile(path) {
  return (await statPath({ path })).kind === "file";
}

/** The visible subdirectory names one level below a path, or none when it is absent. */
async function directories(root) {
  if (!(await exists(root))) return [];
  const listed = await listDirectoryEntries({ root });
  return listed.entries.filter((entry) => entry.kind === "directory" && !entry.name.startsWith(".")).map((entry) => entry.name).sort();
}

/** Every file below a path, depth-first, or none when it is absent. */
async function filesBelow(root, path = "") {
  const address = under(root, path);
  if (!(await exists(address))) return [];
  const listed = await listDirectoryEntries({ root: address });
  const found = [];
  for (const entry of listed.entries) {
    if (entry.kind === "directory") found.push(...(await filesBelow(address, entry.name)));
    else if (entry.kind === "file") found.push(under(address, entry.name));
  }
  return found;
}

async function configPaths(path) {
  const source = await readFileText(path), values = [];
  for (const match of source.matchAll(/^(?:args\s*=\s*\["([^"]+)"\]|cwd\s*=\s*"([^"]+)")/gmu)) values.push(match[1] ?? match[2]);
  return values.filter((value) => value.startsWith("/"));
}

async function hookCommands(path) {
  const source = JSON.parse(await readFileText(path));
  return Object.values(source.hooks ?? {}).flatMap((groups) => groups.flatMap((group) => group.hooks ?? [])).map(({ command }) => command).filter(Boolean);
}

function executablePaths(command) { return command.split(/\s+/u).slice(0, 2).filter((value) => value.startsWith("/")); }

async function checkCodexStateStore() {
  const database = under(RUNTIME, "state_5.sqlite"), sessions = under(RUNTIME, "sessions");
  if (!(await exists(database))) throw new Error(`Codex state database is missing: ${database}`);
  const query = "PRAGMA integrity_check; SELECT id || char(9) || rollout_path FROM threads ORDER BY id;";
  const receipt = executeJavascriptNodeCommand({
    type: "JavascriptNodeCommandExecutionRequest", version: 1,
    command: "sqlite3", arguments: ["-readonly", database, query],
    directory: RUNTIME, environment: null, input: null,
  });
  if (receipt.result.status !== 0) throw new Error(`Codex state database assay failed: ${receipt.result.stderr || receipt.result.stdout || receipt.result.error}`);
  const [integrity, ...rows] = receipt.result.stdout.trim().split("\n");
  if (integrity !== "ok") throw new Error(`Codex state database integrity failed: ${integrity}`);
  const indexed = new Map(rows.map((line) => { const at = line.indexOf("\t"); return [line.slice(0, at), line.slice(at + 1)]; }));
  const transcripts = (await filesBelow(sessions)).filter((path) => path.endsWith(".jsonl"));
  const transcriptIds = new Map(transcripts.map((path) => [path.match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/u)?.[1], path]).filter(([id]) => id));
  const missingFiles = [];
  for (const [id, path] of indexed) if (!(await exists(path))) missingFiles.push({ id, path });
  const unindexedFiles = [...transcriptIds].filter(([id]) => !indexed.has(id)).map(([id, path]) => ({ id, path }));
  if (missingFiles.length || unindexedFiles.length || indexed.size !== transcriptIds.size) throw new Error(`Codex state index and transcript tree disagree: ${JSON.stringify({ indexed: indexed.size, transcripts: transcriptIds.size, missingFiles, unindexedFiles })}`);
  return Object.freeze({ integrity, indexedThreads: indexed.size, transcriptFiles: transcriptIds.size, disposition: "bijective-and-healthy" });
}

export async function checkCodexRuntime() {
  const runtimeConfig = under(RUNTIME, "config.toml"), runtimeHooks = under(RUNTIME, "hooks.json");
  for (const path of [runtimeConfig, runtimeHooks]) if (!(await isFile(path))) throw new Error(`required Codex runtime file is missing: ${path}`);
  const referenced = [...(await configPaths(runtimeConfig)), ...(await hookCommands(runtimeHooks)).flatMap(executablePaths)];
  const missing = [];
  for (const path of new Set(referenced)) if (!(await exists(path))) missing.push(path);
  if (missing.length) throw new Error(`Codex runtime references missing paths: ${missing.join(", ")}`);
  const globalSkills = await directories(under(RUNTIME, "skills")), projectSkills = await directories(under(REPO, ".codex/skills"));
  const duplicates = globalSkills.filter((name) => projectSkills.includes(name));
  if (duplicates.length) throw new Error(`global and project skill names collide: ${duplicates.join(", ")}`);
  const preservedSources = [];
  const activeText = `${await readFileText(runtimeConfig)}\n${await readFileText(runtimeHooks)}`;
  if (/\.codex\.bk(?:\.newer|\.runtime-skills-20260727)?/u.test(activeText)) throw new Error("active harness references a preserved backup tree");
  const parity = evaluateHarnessParity(loadHarnessParityBaseline(PARITY_BASELINE), { repositoryRoot: REPO });
  if (parity.sourceDrift.length || parity.uncoveredSources.length || parity.invalidActuators.length) throw new Error(`harness parity baseline is invalid: ${JSON.stringify(parity)}`);
  return Object.freeze({
    type: "CodexRuntimePreflight", disposition: "static-runtime-current", runtimeRoot: RUNTIME,
    referencedPaths: [...new Set(referenced)].sort(),
    globalSkills, projectSkills, preservedSources, stateStore: await checkCodexStateStore(), harnessParity: { demand: parity.baselineDemand, disposition: parity.disposition, capabilityCount: parity.capabilityCount },
  });
}
