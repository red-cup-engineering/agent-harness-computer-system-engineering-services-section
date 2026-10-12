import { officeIncumbencyState } from "@red-cup-engineering/principal-office-seating-service";
import { AGENT_HARNESS_POLICY_TYPE, AGENT_HARNESS_SOURCES_TYPE, accept, admitAs, refuse } from "./types.mjs";

/**
 * Pure policy morphisms: admission, the set of repository paths a policy
 * references, and resolution of a policy against observed sources into the
 * records the runtime renderers consume. Nothing here touches the world.
 */

/** Admit one AgentHarnessPolicy. */
export function admitAgentHarnessPolicy(value) {
  return admitAs(AGENT_HARNESS_POLICY_TYPE, value, "policy-not-admitted", "agent harness policy");
}

/** Admit one AgentHarnessSources record. */
export function admitAgentHarnessSources(value) {
  return admitAs(AGENT_HARNESS_SOURCES_TYPE, value, "sources-not-admitted", "agent harness sources");
}

const basename = (path) => path.split("/").filter(Boolean).at(-1);

/**
 * Every repository-relative path a policy references, with the kind the path
 * must have and whether its text (or, for a directory, its tree) is needed.
 * The observing effect walks exactly this list; the resolver checks exactly it.
 */
export function referencedSources(policy, { component } = {}) {
  const sources = new Map();
  const add = (path, kind, need) => {
    const prior = sources.get(path);
    sources.set(path, { path, kind, need: prior?.need === "text" || need === "text" ? "text" : prior?.need === "tree" || need === "tree" ? "tree" : "presence" });
  };
  if (component !== "mcp") {
    add(policy.instructions.source, "file", "text");
    for (const hook of policy.hooks) add(hook.handler, "file", "presence");
  }
  for (const endpoint of Object.values(policy.mcpServers)) {
    if (endpoint.transport !== "stdio") continue;
    add(endpoint.script, "file", "presence");
    if (endpoint.environmentFile !== undefined) add(endpoint.environmentFile, "file", "presence");
    if (endpoint.cwd !== undefined) add(endpoint.cwd, "directory", "presence");
  }
  if (component !== "mcp") for (const skill of policy.skills) add(skill, "directory", "tree");
  if (component !== "mcp") for (const role of [...(policy.rootRole ? [policy.rootRole] : []), ...policy.roles]) {
    add(role.office, "file", "text");
    add(role.character, "file", "text");
    add(role.incumbency, "file", "text");
  }
  return Object.freeze([...sources.values()].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)).map((entry) => Object.freeze(entry)));
}

function parseRecord(sources, path, label) {
  const text = sources.texts[path];
  if (typeof text !== "string") return refuse("source-absent", `${label} text was not observed: ${path}`, { path });
  try {
    const record = JSON.parse(text);
    if (record === null || typeof record !== "object" || Array.isArray(record)) return refuse("record-unreadable", `${label} is not a JSON object: ${path}`, { path });
    return accept(record);
  } catch (error) {
    return refuse("record-unreadable", `${label} is not valid JSON: ${path}: ${error.message}`, { path });
  }
}

function resolveRole(role, sources) {
  const office = parseRecord(sources, role.office, `office record for role '${role.id}'`);
  if (!office.ok) return office;
  const character = parseRecord(sources, role.character, `character record for role '${role.id}'`);
  if (!character.ok) return character;
  const incumbency = parseRecord(sources, role.incumbency, `incumbency record for role '${role.id}'`);
  if (!incumbency.ok) return incumbency;
  const seatingRefusal = (message) => refuse("role-seating-refused", `role '${role.id}': ${message}`, { role: role.id, office: role.office, character: role.character, incumbency: role.incumbency });
  if (office.value.id !== role.id) return seatingRefusal(`office record carries id '${office.value.id}', not '${role.id}'`);
  if (incumbency.value.office !== role.id) return seatingRefusal(`incumbency seats office '${incumbency.value.office}', not '${role.id}'`);
  const settled = officeIncumbencyState({ recognition: incumbency.value.recognition, induction: incumbency.value.induction });
  if (settled !== "dignitas") return seatingRefusal(`incumbency settles to '${settled}' (recognition=${incumbency.value.recognition}, induction=${incumbency.value.induction}), not 'dignitas'`);
  if (character.value.id !== incumbency.value.holder) return seatingRefusal(`character '${character.value.id}' is not the incumbency holder '${incumbency.value.holder}'`);
  if (character.value.kind !== "session") return seatingRefusal(`character '${character.value.id}' is kind '${character.value.kind}', not 'session'`);
  return accept(Object.freeze({ id: role.id, model: role.model, reasoningEffort: role.reasoningEffort, office: office.value, character: character.value, incumbency: incumbency.value }));
}

function resolveSkill(path, sources) {
  const files = sources.trees[path];
  if (!Array.isArray(files)) return refuse("source-absent", `skill tree was not observed: ${path}`, { path });
  const name = basename(path);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) return refuse("skill-source-invalid", `skill directory name is not a kebab-case identifier: ${path}`, { path });
  if (!files.includes("SKILL.md")) return refuse("skill-source-invalid", `skill has no SKILL.md: ${path}`, { path });
  const texts = {};
  for (const file of files) {
    const text = sources.texts[`${path}/${file}`];
    if (typeof text !== "string") return refuse("source-absent", `skill file text was not observed: ${path}/${file}`, { path: `${path}/${file}` });
    texts[file] = text;
  }
  return accept(Object.freeze({ name, path, files: Object.freeze([...files].sort()), texts: Object.freeze(texts) }));
}

/**
 * Resolve an admitted policy against admitted sources: every referenced path
 * exists with the right kind, every record parses, every role is seated
 * (dignitas, holder matches, character is a session), every skill has a
 * SKILL.md, and skill names are unique. The result is what renderers consume.
 */
export function resolveAgentHarnessPolicy({ policy, sources }) {
  const admittedPolicy = admitAgentHarnessPolicy(policy);
  if (!admittedPolicy.ok) return admittedPolicy;
  const admittedSources = admitAgentHarnessSources(sources);
  if (!admittedSources.ok) return admittedSources;
  const observed = new Map(sources.observations.map((entry) => [entry.path, entry]));
  for (const reference of referencedSources(policy)) {
    const entry = observed.get(reference.path);
    if (!entry || !entry.exists) return refuse("source-absent", `referenced ${reference.kind} is absent: ${reference.path}`, { path: reference.path, kind: reference.kind });
    if (entry.kind !== reference.kind) return refuse("source-kind-mismatch", `${reference.path} is a ${entry.kind}, not a ${reference.kind}`, { path: reference.path, expected: reference.kind, observed: entry.kind });
    if (reference.need === "text" && typeof sources.texts[reference.path] !== "string") return refuse("source-absent", `text was not observed: ${reference.path}`, { path: reference.path });
  }
  let rootRole;
  if (policy.rootRole !== undefined) {
    const resolved = resolveRole(policy.rootRole, sources);
    if (!resolved.ok) return resolved;
    rootRole = resolved.value;
  }
  const roles = [];
  for (const role of policy.roles) {
    const resolved = resolveRole(role, sources);
    if (!resolved.ok) return resolved;
    roles.push(resolved.value);
  }
  const skills = [];
  const names = new Set();
  for (const path of policy.skills) {
    const resolved = resolveSkill(path, sources);
    if (!resolved.ok) return resolved;
    if (names.has(resolved.value.name)) return refuse("skill-source-invalid", `two skill sources share the name '${resolved.value.name}'`, { name: resolved.value.name });
    names.add(resolved.value.name);
    skills.push(resolved.value);
  }
  return accept(Object.freeze({
    policy,
    root: sources.root,
    instructions: sources.texts[policy.instructions.source],
    rootRole,
    roles: Object.freeze(roles),
    skills: Object.freeze(skills),
  }));
}
