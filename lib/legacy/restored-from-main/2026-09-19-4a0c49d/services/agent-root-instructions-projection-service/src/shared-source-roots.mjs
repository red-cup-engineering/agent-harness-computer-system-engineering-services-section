import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { splitMarkdownFrontmatterFence } from "@red-cup-engineering/markdown-engineering-services-section/split-markdown-frontmatter-fence";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Returns the installed package directory holding an authored shared source family.
 * Both harnesses consume these bytes through their exact registry dependency.
 */
export function sharedSourceRoot(family) {
  if (!new Set(["skills", "rules"]).has(family)) throw new TypeError(`unknown shared source family: ${family}`);
  return join(PACKAGE_ROOT, "content", family);
}

function relativeDirectory(value) {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\\") || value.split("/").includes("..") || normalize(value) !== value || value === ".") {
    throw new TypeError("instruction destination must be an explicit relative directory");
  }
  return value;
}

function sourceFiles(root, prefix = "") {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`shared instruction source must not be a symlink: ${path}`);
    return entry.isDirectory() ? sourceFiles(root, path) : [path];
  });
}

/** Compile the package's shared resources for one runtime, without writing.
 * @param {{skillsPath: string, rulesPath: string}} options
 * @returns {Array<{path: string, bytes: Buffer, mode: number}>}
 */
function instructionProjection({ skillsPath, rulesPath }) {
  relativeDirectory(skillsPath); relativeDirectory(rulesPath);
  if (skillsPath === rulesPath || skillsPath.startsWith(rulesPath + "/") || rulesPath.startsWith(skillsPath + "/")) {
    throw new TypeError("skill and rule destinations must be distinct directories");
  }
  return [["skills", skillsPath], ["rules", rulesPath]].flatMap(([family, destination]) => {
    const root = sharedSourceRoot(family);
    return sourceFiles(root).map((path) => {
      const source = join(root, path);
      let bytes = readFileSync(source);
      if (/\.(?:md|mjs|cjs|js|json)$/u.test(path)) {
        let text = bytes.toString("utf8")
          .replaceAll(".claude/skills/", skillsPath + "/")
          .replaceAll(".claude/rules/", rulesPath + "/");
        if (path.endsWith(".md")) {
          const marker = `<!-- Generated from @red-cup-engineering/agent-root-instructions-projection-service/content/${family}/${path}. Edit the package source. -->\n`;
          const split = splitMarkdownFrontmatterFence(text);
          const at = split ? text.length - split.body.length : 0;
          text = text.slice(0, at) + marker + text.slice(at);
        }
        bytes = Buffer.from(text);
      }
      return { path: join(destination, path), bytes, mode: statSync(source).mode & 0o777 };
    });
  });
}

/** Materialize shared sources into one runtime's own directories.
 * Unrelated target files are preserved; the runtime owns obsolete-file removal.
 * @param {{target: string, skillsPath: string, rulesPath: string}} options
 * @returns {{files: string[]}}
 */
export function projectSharedInstructionSources({ target, ...paths }) {
  if (typeof target !== "string" || !isAbsolute(target)) throw new TypeError("instruction target must be absolute");
  const projection = instructionProjection(paths);
  for (const file of projection) {
    const path = join(target, file.path);
    mkdirSync(dirname(path), { recursive: true });
    if (!existsSync(path) || !readFileSync(path).equals(file.bytes)) writeFileSync(path, file.bytes, { mode: file.mode });
  }
  return { files: projection.map((file) => file.path) };
}

/** Check the same compiled resources without mutating the target.
 * @param {{target: string, skillsPath: string, rulesPath: string}} options
 * @returns {{files: string[]}}
 */
export function checkSharedInstructionSources({ target, ...paths }) {
  if (typeof target !== "string" || !isAbsolute(target)) throw new TypeError("instruction target must be absolute");
  const projection = instructionProjection(paths);
  for (const file of projection) {
    const path = join(target, file.path);
    if (!existsSync(path) || !readFileSync(path).equals(file.bytes)) throw new Error(`shared instruction projection is stale: ${path}`);
  }
  return { files: projection.map((file) => file.path) };
}
