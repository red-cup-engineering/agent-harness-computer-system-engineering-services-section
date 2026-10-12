import { bindMcpClientEndpoint } from "@red-cup-engineering/computer-platform/mcp-endpoint";
import { encodeToml } from "@red-cup-engineering/toml-codec-service";
import { accept, refuse } from "../types.mjs";
import { bindRoot, groupHooks, jsonText, manifestFile, roleBody, roleDescription, skillFiles } from "./shared.mjs";

/**
 * The Codex parameterization of the agent-harness projection. Codex reads a
 * trusted project's .codex/config.toml, .codex/hooks.json, .codex/agents/*.toml,
 * .agents/skills/*, and AGENTS.md; nothing else is written for it.
 */
export const CODEX_SURFACE = Object.freeze({
  runtime: "codex",
  instructionsFile: "AGENTS.md",
  configFile: ".codex/config.toml",
  hooksFile: ".codex/hooks.json",
  agentsDirectory: ".codex/agents",
  skillsDirectory: ".agents/skills",
  manifestFile: ".codex/agent-harness-manifest.json",
  ownedDirectories: Object.freeze([".codex", ".agents/skills"]),
  settings: Object.freeze(["model", "model_reasoning_effort", "model_reasoning_summary", "approval_policy", "sandbox_mode", "web_search", "approvals_reviewer", "personality", "model_auto_compact_token_limit"]),
  roleModel: "gpt-5.6-terra",
  roleReasoningEffort: "medium",
});

export function mcpServerTable(root, endpoint) {
  const table = bindMcpClientEndpoint(root, endpoint);
  if (endpoint.enabled !== undefined) table.enabled = endpoint.enabled;
  if (endpoint.enabledTools !== undefined) table.enabled_tools = [...endpoint.enabledTools];
  if (endpoint.startupTimeoutSeconds !== undefined) table.startup_timeout_sec = endpoint.startupTimeoutSeconds;
  if (endpoint.toolTimeoutSeconds !== undefined) table.tool_timeout_sec = endpoint.toolTimeoutSeconds;
  return table;
}

function configTable(resolved) {
  const { policy, root } = resolved;
  const table = {};
  for (const key of Object.keys(policy.settings ?? {}).sort()) table[key] = policy.settings[key];
  if (policy.features !== undefined && Object.keys(policy.features).length > 0) table.features = Object.fromEntries(Object.keys(policy.features).sort().map((key) => [key, policy.features[key]]));
  if (policy.agents?.maxThreads !== undefined) table.agents = { max_threads: policy.agents.maxThreads };
  if (policy.environment !== undefined && Object.keys(policy.environment).length > 0) table.shell_environment_policy = { set: bindRoot(root, policy.environment) };
  const servers = Object.keys(policy.mcpServers).sort();
  if (servers.length > 0) table.mcp_servers = Object.fromEntries(servers.map((name) => [name, mcpServerTable(root, policy.mcpServers[name])]));
  return table;
}

function hookCommand(root) {
  return (hook) => {
    const command = { type: "command", command: `node ${root}/${hook.handler} --expected-event ${hook.event}`, timeout: hook.timeout };
    if (hook.statusMessage !== undefined) command.statusMessage = hook.statusMessage;
    if (hook.additionalContextLimit !== undefined) command.additionalContextLimit = hook.additionalContextLimit;
    return command;
  };
}

function roleFile(role, skills) {
  const text = [
    `name = ${JSON.stringify(role.id)}`,
    `description = ${JSON.stringify(roleDescription(role))}`,
    `model = ${JSON.stringify(role.model ?? CODEX_SURFACE.roleModel)}`,
    `model_reasoning_effort = ${JSON.stringify(role.reasoningEffort ?? CODEX_SURFACE.roleReasoningEffort)}`,
    `developer_instructions = ${JSON.stringify(roleBody(role, skills))}`,
    "",
  ].join("\n");
  return { path: `${CODEX_SURFACE.agentsDirectory}/${role.id}.toml`, text };
}

/** Render a resolved policy into Codex's file surface. */
export function renderCodex(resolved) {
  const { policy, root } = resolved;
  const unsupported = Object.keys(policy.settings ?? {}).filter((key) => !CODEX_SURFACE.settings.includes(key));
  if (unsupported.length > 0) return refuse("setting-unsupported", `Codex does not read settings: ${unsupported.join(", ")}`, { runtime: "codex", settings: unsupported });
  const files = [
    { path: CODEX_SURFACE.instructionsFile, text: resolved.instructions },
    { path: CODEX_SURFACE.configFile, text: encodeToml(configTable(resolved)) },
    { path: CODEX_SURFACE.hooksFile, text: jsonText({ hooks: groupHooks(policy.hooks, hookCommand(root)) }) },
    ...resolved.roles.map((role) => roleFile(role, resolved.skills)),
    ...skillFiles(resolved.skills, CODEX_SURFACE.skillsDirectory),
  ];
  files.push(manifestFile(CODEX_SURFACE.manifestFile, { actor: policy.actor, runtime: "codex", files }));
  return accept(files);
}
