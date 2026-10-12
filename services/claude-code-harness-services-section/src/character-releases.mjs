/**
 * Cut a release of a character store.
 *
 * Carried from Rom Keldar's releasing-a-theory skill (restored from main's history). A release names
 * a meaningful state: version YYYY.MM.DD+noun, the commit it bounds (HEAD, read before anything is
 * written), and the authors whose commits touched the store since the prior release's commit. The
 * record is one JSON line under governance/records/releases/, and the store's _index.md carries the
 * version. Git runs with argument lists, never through a shell.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Git reads the store's own repository, even where a caller (a git hook, say) has pointed GIT_DIR elsewhere.
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...environment } = process.env;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: environment }).trim();
const governanceOf = (root) => [join(root, "governance"), join(root, "work", "governance")].find((dir) => existsSync(dir)) ?? join(root, "governance");

export function releaseStore(store, noun, { annotation, on = new Date().toISOString().slice(0, 10) } = {}) {
  if (typeof noun !== "string" || !noun.trim() || /[\s/\\:*?"<>|]/u.test(noun)) throw new TypeError(`a release noun is one filesystem-safe word: ${noun}`);
  if (annotation !== undefined && (typeof annotation !== "string" || annotation.includes("\n"))) throw new TypeError("an annotation is one line");
  const root = resolve(store);
  const top = git(root, "rev-parse", "--show-toplevel"); const scope = relative(top, root) || ".";
  const version = `${on.replaceAll("-", ".")}+${noun}`;
  const releases = join(governanceOf(root), "records", "releases"); const record = join(releases, `${version}.jsonl`);
  if (existsSync(record)) throw new Error(`release ${version} already exists: ${record}`);
  // The boundary commit is HEAD before anything is written.
  const commit = git(top, "rev-parse", "HEAD");
  let prior = null;
  if (existsSync(releases)) {
    const last = readdirSync(releases).filter((file) => file.endsWith(".jsonl")).sort().at(-1);
    if (last) prior = JSON.parse(readFileSync(join(releases, last), "utf8").trim().split("\n").at(-1)).commit ?? null;
  }
  const log = git(top, "log", prior ? `${prior}..${commit}` : commit, "--format=%an", "--", scope);
  const authors = [...new Set(log.split("\n").filter(Boolean))].sort();
  const entry = { version, date: on, commit, authors, ...(annotation ? { annotations: annotation } : {}) };
  mkdirSync(releases, { recursive: true });
  writeFileSync(record, `${JSON.stringify(entry)}\n`, "utf8");
  const index = join(root, "_index.md");
  if (existsSync(index)) {
    const text = readFileSync(index, "utf8");
    writeFileSync(index, /^version:/mu.test(text) ? text.replace(/^version:.*$/mu, `version: ${version}`) : text.replace(/^---\n/u, `---\nversion: ${version}\n`), "utf8");
  }
  return { ...entry, prior, record, index: existsSync(index) ? index : null };
}
