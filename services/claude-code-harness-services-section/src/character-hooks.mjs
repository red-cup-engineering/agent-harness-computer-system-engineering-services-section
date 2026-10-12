/**
 * The PreToolUse rules a character store enforces on the session that serves it.
 *
 * Carried from Rom Keldar's blocking-agent-subagents, linting-a-theory and guarding-sources-of-truth
 * hooks (restored from main's history). Each rule reads the hook payload and decides whether the tool
 * call goes ahead. The originals blocked by exiting 1, which a Claude Code PreToolUse hook treats as a
 * non-blocking error, so the subagent and frontmatter rules never stopped anything; here a refusal is
 * a decision the hook command turns into exit status 2, the blocking one.
 */
import { resolve } from "node:path";

const allow = Object.freeze({ block: false });
const refuse = (reason) => Object.freeze({ block: true, reason });
const headerOf = (content) => String(content ?? "").replace(/\r\n/gu, "\n").match(/^---\n([\s\S]*?)\n---/u)?.[1];

/** A subagent must be a named agent type, never general-purpose or untyped. */
export function subagentRule(payload) {
  if (!["Agent", "Task"].includes(payload?.tool_name ?? "Agent")) return allow;
  const type = payload?.tool_input?.subagent_type ?? "";
  return !type || type === "general-purpose" ? refuse("SOUL constraint: general-purpose subagents are prohibited. Use a specific agent type (Explore, Plan, a named agent).") : allow;
}

/** A Markdown file written with frontmatter carries name and description, and no self-declared role or class. */
export function frontmatterRule(payload) {
  const path = payload?.tool_input?.file_path ?? ""; const header = headerOf(payload?.tool_input?.content);
  if (!path.endsWith(".md") || header === undefined) return allow;
  const violations = [];
  if (!/^name:/mu.test(header)) violations.push("missing required key: name");
  if (!/^description:/mu.test(header)) violations.push("missing required key: description");
  if (/^type:\s*surface-file/mu.test(header)) violations.push("forbidden key value: type: surface-file (role expressed by install transformer, not self-declaration)");
  if (/^class:/mu.test(header)) violations.push("forbidden key: class (ungrounded classification tag)");
  return violations.length ? refuse(`Frontmatter lint: ${path}\n${violations.map((violation) => `  - ${violation}`).join("\n")}`) : allow;
}

/** A specification carries type: specification, version, date and authors. */
export function specificationRule(payload) {
  const path = payload?.tool_input?.file_path ?? "";
  if (!/rules[/\\]specifications[/\\][^/\\]+\.md$/u.test(path)) return allow;
  const header = headerOf(payload?.tool_input?.content);
  if (header === undefined) return refuse(`${path} is a specification file and must have YAML frontmatter.`);
  const missing = ["type:", "version:", "date:", "authors:"].filter((field) => !header.includes(field));
  if (missing.length) return refuse(`${path} frontmatter missing: ${missing.join(", ")}`);
  return header.includes("type: specification") ? allow : refuse(`${path} frontmatter must include 'type: specification'.`);
}

/** Inside the store, content is reached through its tools, never read directly. */
export function readGuardRule(payload, store) {
  if (!["Read", "Glob", "Grep"].includes(payload?.tool_name)) return allow;
  const input = payload?.tool_input ?? {}; const raw = input.file_path ?? input.path ?? input.pattern ?? "";
  if (!raw || !store) return allow;
  const target = resolve(raw).split("\\").join("/"); const root = resolve(store).split("\\").join("/");
  if (target !== root && !target.startsWith(`${root}/`)) return allow;
  return refuse(`Blocked: direct read of "${target.slice(root.length + 1) || "."}" — use the store's tools (retrieve_context, read_spec, list_tasks) instead.`);
}

export const CHARACTER_HOOKS = Object.freeze({ "block-agent-subagents": subagentRule, "lint-frontmatter": frontmatterRule, "validate-spec-frontmatter": specificationRule, "guard-reads": readGuardRule });
