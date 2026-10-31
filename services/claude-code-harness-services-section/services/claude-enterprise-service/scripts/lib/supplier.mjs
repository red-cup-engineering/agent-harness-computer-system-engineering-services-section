// One resolver for every supplier this enterprise hires. Supplier addresses
// are parameters in content/harness/claude-suppliers.json — this module holds
// no paths of its own.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Data root: a checkout of 561-group/561-group-bare-cedar-fog-claude-services-section (env CLAUDE_SERVICES_ROOT, default cwd).
const PACKAGE_ROOT = resolve(process.env.CLAUDE_SERVICES_ROOT ?? process.cwd());
const SUPPLIERS_PATH = join(PACKAGE_ROOT, "content/harness/claude-suppliers.json");

export function repoRoot() {
  let dir = PACKAGE_ROOT;
  for (;;) {
    if (existsSync(join(dir, "lib/emsenn/services/561-group")) && existsSync(join(dir, "Makefile"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("supplier: cannot locate repository root");
    dir = parent;
  }
}

export function supplierRecord(role) {
  const { suppliers } = JSON.parse(readFileSync(SUPPLIERS_PATH, "utf8"));
  const record = suppliers?.[role];
  if (!record) throw new Error(`supplier: no "${role}" entry in ${SUPPLIERS_PATH}`);
  return record;
}

export async function hireSupplier(role, moduleKey, { root = repoRoot() } = {}) {
  const record = supplierRecord(role);
  const relative = record.modules?.[moduleKey];
  if (!relative) throw new Error(`supplier: "${role}" declares no module "${moduleKey}"`);
  const path = join(root, record.root, relative);
  if (!existsSync(path)) {
    throw new Error(`supplier: "${role}/${moduleKey}" not found at ${path} — update content/harness/claude-suppliers.json if the provider moved`);
  }
  return { module: await import(pathToFileURL(path).href), repoRoot: root };
}

export function cliArg(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}
