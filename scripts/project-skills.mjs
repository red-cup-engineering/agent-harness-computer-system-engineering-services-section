#!/usr/bin/env node
// Project house skills into a harness's skill directory (Claude Code reads <root>/.claude/skills), so a session
// loads each method on demand instead of having rules injected into its context. The projection record names the
// skills; each becomes a link to its one home, and a link the record no longer names is removed.
//
//   project-skills --projection <record> --root <directory its paths resolve from> --write <skill directory>...
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";

/** `--projection` and `--root` once each, `--write` one or more times; anything else is refused. */
function parseArguments(argv) {
  const options = { projection: undefined, root: undefined, write: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (value === undefined || !["--projection", "--root", "--write"].includes(flag)) throw new TypeError(`project-skills: expected --projection, --root or --write with a value at ${flag}`);
    if (flag === "--write") options.write.push(value);
    else options[flag.slice(2)] = value;
  }
  const missing = ["projection", "root"].filter((name) => options[name] === undefined).concat(options.write.length === 0 ? ["write"] : []);
  if (missing.length > 0) throw new TypeError(`project-skills: name ${missing.map((name) => `--${name}`).join(", ")}`);
  return Object.freeze(options);
}

/** The named skills as { name, home }: each a root-relative directory holding SKILL.md, names unique. */
export function readSkillProjection({ record, root }) {
  const projection = JSON.parse(readFileSync(record, "utf8"));
  if (!Array.isArray(projection.skills)) throw new TypeError("project-skills: the record names no skills list");
  const seen = new Map();
  return projection.skills.map((relative) => {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split("/").includes("..")) throw new TypeError(`project-skills: ${JSON.stringify(relative)} is not a root-relative path`);
    const home = path.resolve(root, relative);
    if (!existsSync(path.join(home, "SKILL.md"))) throw new Error(`project-skills: ${relative} holds no SKILL.md`);
    const name = path.basename(home);
    if (seen.has(name)) throw new Error(`project-skills: ${relative} and ${seen.get(name)} share the name ${name}`);
    seen.set(name, relative);
    return Object.freeze({ name, home });
  });
}

/** Link each skill into `directory` and remove links it no longer names; real files are never touched. */
export function projectSkills(skills, directory) {
  mkdirSync(directory, { recursive: true });
  const named = new Set(skills.map((skill) => skill.name));
  for (const entry of readdirSync(directory)) {
    const at = path.join(directory, entry);
    if (lstatSync(at).isSymbolicLink() && !named.has(entry)) unlinkSync(at);
  }
  for (const { name, home } of skills) {
    const at = path.join(directory, name);
    if (existsSync(at) || lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) {
      if (!lstatSync(at).isSymbolicLink()) throw new Error(`project-skills: ${at} is a real file or directory, not a projected link`);
      unlinkSync(at);
    }
    symlinkSync(home, at);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const options = parseArguments(process.argv.slice(2));
  const skills = readSkillProjection({ record: options.projection, root: options.root });
  for (const target of options.write) projectSkills(skills, target);
}
