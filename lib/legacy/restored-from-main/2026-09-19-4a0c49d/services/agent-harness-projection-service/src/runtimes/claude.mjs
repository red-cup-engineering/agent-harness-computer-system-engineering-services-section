import { bindMcpClientEndpoint } from "@red-cup-engineering/computer-platform/mcp-endpoint";
import { accept, refuse } from "../types.mjs";
import { bindRoot, groupHooks, jsonText, manifestFile, roleBody, roleDescription, skillFiles } from "./shared.mjs";

/**
 * The Claude Code parameterization of the agent-harness projection. Claude
 * reads a project's .claude/settings.json (hooks, permissions, model),
 * .mcp.json, .claude/agents/*.md, .claude/skills/*, and CLAUDE.md.
 */
export const CLAUDE_SURFACE = Object.freeze({
  runtime: "claude",
  instructionsFile: "CLAUDE.md",
  settingsFile: ".claude/settings.json",
  mcpFile: ".mcp.json",
  agentsDirectory: ".claude/agents",
  skillsDirectory: ".claude/skills",
  manifestFile: ".claude/agent-harness-manifest.json",
  ownedDirectories: Object.freeze([".claude/agents", ".claude/skills"]),
  settings: Object.freeze(["model", "effortLevel", "cleanupPeriodDays", "includeCoAuthoredBy"]),
  roleModel: "sonnet",
});

export function mcpServer(root, endpoint) {
  return { type: endpoint.transport, ...bindMcpClientEndpoint(root, endpoint) };
}

function hookCommand() {
  return (hook) => ({ type: "command", command: `node "$CLAUDE_PROJECT_DIR"/${hook.handler} --expected-event ${hook.event}`, timeout: hook.timeout });
}

function settings(resolved) {
  const { policy, root } = resolved;
  const value = {};
  for (const key of Object.keys(policy.settings ?? {}).sort()) value[key] = policy.settings[key];
  if (policy.permissions !== undefined) {
    const permissions = {};
    if (policy.permissions.defaultMode !== undefined) permissions.defaultMode = policy.permissions.defaultMode;
    if (policy.permissions.allow !== undefined) permissions.allow = [...policy.permissions.allow];
    if (policy.permissions.deny !== undefined) permissions.deny = [...policy.permissions.deny];
    value.permissions = permissions;
  }
  if (policy.environment !== undefined && Object.keys(policy.environment).length > 0) value.env = bindRoot(root, policy.environment);
  value.hooks = groupHooks(policy.hooks, hookCommand(root));
  return value;
}

function roleFile(role, skills) {
  const frontmatter = [`name: ${role.id}`, `description: ${JSON.stringify(roleDescription(role))}`, `model: ${role.model ?? CLAUDE_SURFACE.roleModel}`];
  return { path: `${CLAUDE_SURFACE.agentsDirectory}/${role.id}.md`, text: `---\n${frontmatter.join("\n")}\n---\n\n${roleBody(role, skills)}` };
}

/** Render a resolved policy into Claude Code's file surface. */
export function renderClaude(resolved) {
  const { policy, root } = resolved;
  const unsupported = Object.keys(policy.settings ?? {}).filter((key) => !CLAUDE_SURFACE.settings.includes(key));
  if (unsupported.length > 0) return refuse("setting-unsupported", `Claude Code does not read settings: ${unsupported.join(", ")}`, { runtime: "claude", settings: unsupported });
  const servers = Object.keys(policy.mcpServers).sort();
  const files = [
    { path: CLAUDE_SURFACE.instructionsFile, text: resolved.instructions },
    { path: CLAUDE_SURFACE.settingsFile, text: jsonText(settings(resolved)) },
    { path: CLAUDE_SURFACE.mcpFile, text: jsonText({ mcpServers: Object.fromEntries(servers.map((name) => [name, mcpServer(root, policy.mcpServers[name])])) }) },
    ...resolved.roles.map((role) => roleFile(role, resolved.skills)),
    ...skillFiles(resolved.skills, CLAUDE_SURFACE.skillsDirectory),
  ];
  files.push(manifestFile(CLAUDE_SURFACE.manifestFile, { actor: policy.actor, runtime: "claude", files }));
  return accept(files);
}
