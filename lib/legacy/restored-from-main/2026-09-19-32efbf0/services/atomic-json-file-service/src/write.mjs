import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes text to a path atomically (mkdir, temp file, rename), skipping the
 * write entirely when the existing file's bytes already match.
 *
 * @param {string} path Destination file path.
 * @param {string} content Exact file content to write.
 * @param {object} [options] Write options.
 * @param {number} [options.mode] File mode for the written file (default 0o644).
 * @returns {{path: string, changed: boolean}} Whether the file's bytes changed.
 */
export function writeFileAtomically(path, content, { mode = 0o644 } = {}) {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return Object.freeze({ path, changed: false });
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode });
  renameSync(temporary, path);
  return Object.freeze({ path, changed: true });
}

/**
 * Writes a JSON-serializable value to a path atomically, two-space indented
 * with a trailing newline, skipping the write when unchanged.
 *
 * @param {string} path Destination file path.
 * @param {*} value JSON-serializable value to write.
 * @param {object} [options] Write options.
 * @param {number} [options.mode] File mode for the written file (default 0o644).
 * @returns {{path: string, changed: boolean}} Whether the file's bytes changed.
 */
export function writeJsonAtomically(path, value, options = {}) {
  return writeFileAtomically(path, `${JSON.stringify(value, null, 2)}\n`, options);
}
