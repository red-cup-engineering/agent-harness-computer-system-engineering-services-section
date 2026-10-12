// The one machine-specific record this service reads.
//
// Every actor URN, customer URN, object-kind namespace, office id, workspace
// territory, session store, runtime root, agent-record root, and state root
// that the enterprise stamps into its observations comes from here, never from
// a literal in this package and never from this package's own location on
// disk. The record is a SovereignCustomerEnterprise document that lives with
// the machine it describes, beside that machine's own agent records, and is
// named to this package by the CODEX_ENTERPRISE_CONFIGURATION environment
// variable, by the `--configuration <path>` argument of every script face, or
// by an explicit `options.configurationPath`.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const CONFIGURATION_ENVIRONMENT_VARIABLE = "CODEX_ENTERPRISE_CONFIGURATION";
export const CONFIGURATION_RECORD_TYPE = "SovereignCustomerEnterprise";

const REQUIRED_TEXT = Object.freeze([
  "actor", "actorSlug", "objectKindNamespace", "enterpriseLabel", "name", "machine",
  "character", "surface", "territory", "customer", "office", "sessionsRoot",
  "runtimeRoot", "agentsRoot", "stateRoot", "harnessPolicy", "harnessParityBaseline",
  "notebookExchangeRoot", "resultSchemaNamespace",
]);

const cache = new Map();

function text(record, key, path) {
  const value = record?.[key];
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${path} is missing a nonempty ${key}`);
  return value.trim();
}

/**
 * Read one Codex enterprise configuration record from an explicit path.
 *
 * Relative paths inside the record (`territory`, `sessionsRoot`,
 * `runtimeRoot`, `agentsRoot`, `stateRoot`) resolve against the directory
 * holding the record, so a machine section can name its own subdirectories
 * without repeating an absolute prefix.
 */
export function loadCodexEnterpriseConfiguration(path) {
  if (typeof path !== "string" || path.trim() === "") {
    throw new TypeError(`a Codex enterprise configuration path is required: pass options.configurationPath, --configuration <path>, or set ${CONFIGURATION_ENVIRONMENT_VARIABLE}`);
  }
  const resolved = resolve(path);
  const record = JSON.parse(readFileSync(resolved, "utf8"));
  if (record?.type !== CONFIGURATION_RECORD_TYPE) throw new TypeError(`${resolved} is not a ${CONFIGURATION_RECORD_TYPE} record`);
  const base = dirname(resolved);
  const against = (value) => (isAbsolute(value) ? value : resolve(base, value));
  const selected = {};
  for (const key of REQUIRED_TEXT) selected[key] = text(record, key, resolved);
  return Object.freeze({
    ...record,
    ...selected,
    configurationPath: resolved,
    territory: against(selected.territory),
    sessionsRoot: against(selected.sessionsRoot),
    runtimeRoot: against(selected.runtimeRoot),
    agentsRoot: against(selected.agentsRoot),
    stateRoot: against(selected.stateRoot),
  });
}

/**
 * The configuration this process runs under, read once per path.
 *
 * @param {{configurationPath?: string}} [options]
 */
export function codexEnterpriseConfiguration(options = {}) {
  const path = options.configurationPath ?? process.env[CONFIGURATION_ENVIRONMENT_VARIABLE];
  if (typeof path !== "string" || path.trim() === "") {
    throw new TypeError(`a Codex enterprise configuration is required: set ${CONFIGURATION_ENVIRONMENT_VARIABLE} or pass options.configurationPath`);
  }
  const key = resolve(path);
  if (!cache.has(key)) cache.set(key, loadCodexEnterpriseConfiguration(key));
  return cache.get(key);
}

/** The `--configuration <path>` argument a script face accepts, if present. */
export function configurationArgument(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--configuration");
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (typeof value !== "string" || value.startsWith("--")) throw new TypeError("--configuration requires one configuration record path");
  return value;
}

/**
 * Adopt a `--configuration <path>` argument as this process's configuration so
 * that modules reading it at import time see it. Returns the remaining argv.
 */
export function adoptConfigurationArgument(argv = process.argv.slice(2)) {
  const index = argv.indexOf("--configuration");
  if (index === -1) return argv;
  const value = configurationArgument(argv);
  process.env[CONFIGURATION_ENVIRONMENT_VARIABLE] = resolve(value);
  return [...argv.slice(0, index), ...argv.slice(index + 2)];
}
