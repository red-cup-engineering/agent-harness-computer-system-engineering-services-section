#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const DATA_ROOT = resolve(process.env.CODEX_ENTERPRISE_DATA_ROOT ?? process.cwd()); // section data repo checkout (agents/, data/)

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const MANIFEST = join(DATA_ROOT, "agents/harness/codex-hooks.manifest.json");
const BOUNDED_CONTEXT_EVENTS = new Set(["SubagentStart"]);

function parseArguments(argv) {
  let root, check = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--check") check = true;
    else if (argv[index] === "--root") {
      if (!argv[index + 1]) throw new TypeError("--root requires one project directory");
      root = resolve(argv[index += 1]);
    } else throw new TypeError(`unknown argument ${argv[index]}`);
  }
  if (root === undefined) throw new TypeError("--root requires one destination path");
  return { root, check };
}

function readManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (manifest.version !== 1 || !manifest.handlers || !manifest.events || !manifest.projections) throw new TypeError("invalid Codex hooks manifest");
  return manifest;
}

function existingHookConfig(root) {
  const path = join(root, ".codex/hooks.json");
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" && value.hooks && typeof value.hooks === "object" ? value : null;
  } catch { throw new TypeError(`installed Codex hooks configuration is not valid JSON: ${path}`); }
}

function mergedHookConfig(root, projected) {
  const existing = existingHookConfig(root);
  if (!existing) return projected;
  // This projector owns only manifest-declared events.  Keep every other
  // installed lifecycle hook and its local description intact.
  return { ...existing, hooks: { ...existing.hooks, ...projected.hooks } };
}

export function projectHooks(options = {}) {
  const sourceRoot = resolve(options.sourceRoot ?? PACKAGE_ROOT);
  const manifest = options.manifest ?? readManifest();
  const handlers = Object.fromEntries(Object.entries(manifest.handlers).map(([name, relative]) => {
    const requestedSource = resolve(sourceRoot, relative);
    const projectedSource = manifest.projections?.[relative];
    const packageSource = projectedSource ? resolve(PACKAGE_ROOT, projectedSource) : null;
    const source = existsSync(requestedSource) ? requestedSource
      : packageSource && existsSync(packageSource) ? packageSource : null;
    if (source === null) throw new TypeError(`missing hook handler ${name}: ${requestedSource}`);
    return [name, source];
  }));
  const hooks = Object.fromEntries(Object.entries(manifest.events).map(([event, entries]) => [event, entries.map((entry) => {
    const source = handlers[entry.handler];
    if (!source) throw new TypeError(`event ${event} names unknown handler ${entry.handler}`);
    const group = {
      hooks: [{
        type: "command",
        command: `${process.execPath} ${source}`,
        timeout: event === "SessionEnd" ? 3 : event === "PostToolUse" ? 30 : 10,
        statusMessage: entry.statusMessage,
        ...(event === "PostToolUse" ? { additionalContextLimit: 4000 } : BOUNDED_CONTEXT_EVENTS.has(event) ? { additionalContextLimit: 512 } : {}),
      }],
    };
    if (entry.matcher !== undefined) group.matcher = entry.matcher;
    return group;
  })]));
  return Object.freeze({ description: manifest.description, hooks });
}

export function installHooks(options = {}) {
  if (typeof options.root !== "string" || options.root.length === 0) throw new TypeError("root path is required");
  const root = resolve(options.root);
  const manifest = options.manifest ?? readManifest();
  const projected = projectHooks({ ...options, manifest });
  const installed = mergedHookConfig(root, projected);
  const projections = new Map([
    [join(root, ".codex/hooks.json"), `${JSON.stringify(installed, null, 2)}\n`],
    ...Object.entries(manifest.projections).map(([target, source]) => [
      join(root, target),
      readFileSync(join(PACKAGE_ROOT, source), "utf8"),
    ]),
  ]);
  if (options.check) {
    const hooksPath = join(root, ".codex/hooks.json");
    const stale = [...projections].filter(([target, expected]) => {
      if (!existsSync(target)) return true;
      if (target !== hooksPath) return readFileSync(target, "utf8") !== expected;
      const actual = existingHookConfig(root);
      return !actual || Object.entries(projected.hooks).some(([event, value]) => JSON.stringify(actual.hooks[event]) !== JSON.stringify(value));
    }).map(([target]) => target);
    if (stale.length) throw new Error(`Codex hooks projection is stale or missing: ${stale.join(", ")}`);
    return Object.freeze({ target: join(root, ".codex/hooks.json"), targets: Object.freeze([...projections.keys()]), changed: false, checked: true });
  }
  let changed = false;
  for (const [target, expected] of projections) {
    mkdirSync(dirname(target), { recursive: true });
    if (existsSync(target) && readFileSync(target, "utf8") === expected) continue;
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, expected, { mode: 0o600 });
    renameSync(temporary, target);
    changed = true;
  }
  return Object.freeze({ target: join(root, ".codex/hooks.json"), targets: Object.freeze([...projections.keys()]), changed, checked: false });
}

function main(argv) {
  const result = installHooks(parseArguments(argv));
  process.stdout.write(`${result.checked ? "checked" : result.changed ? "projected" : "unchanged"} ${result.target}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`project-codex-hooks: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
