import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { releaseStore } from "../services/claude-code-harness-services-section/src/character-releases.mjs";

const cli = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-release.mjs", import.meta.url));
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...environment } = process.env;
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...environment, GIT_CONFIG_NOSYSTEM: "1", HOME: cwd } }).trim();
async function repository() {
  const top = await mkdtemp("/var/tmp/character-release-"); const store = path.join(top, "characters", "rom-keldar");
  git(top, "init", "-q"); git(top, "config", "user.email", "a@example.org"); git(top, "config", "commit.gpgsign", "false");
  const commit = async (author, file, text) => { await mkdir(path.dirname(path.join(top, file)), { recursive: true }); await writeFile(path.join(top, file), text); git(top, "add", "."); git(top, "-c", `user.name=${author}`, "commit", "-q", "-m", file); };
  return { top, store, commit };
}

test("a release records its version, boundary commit and the store's authors since the prior release", async () => {
  const { top, store, commit } = await repository();
  await commit("Ada", "characters/rom-keldar/_index.md", "---\nname: rom-keldar\n---\n");
  await commit("Grace", "characters/rom-keldar/SOUL.md", "# Soul\n");
  await commit("Edsger", "elsewhere.md", "not the store\n");
  const first = releaseStore(store, "lantern", { on: "2026-10-10", annotation: "First cut." });
  assert.equal(first.version, "2026.10.10+lantern"); assert.equal(first.commit, git(top, "rev-parse", "HEAD"));
  assert.deepEqual(first.authors, ["Ada", "Grace"]); assert.equal(first.prior, null);
  assert.deepEqual(JSON.parse(await readFile(path.join(store, "governance/records/releases/2026.10.10+lantern.jsonl"), "utf8")), { version: "2026.10.10+lantern", date: "2026-10-10", commit: first.commit, authors: ["Ada", "Grace"], annotations: "First cut." });
  assert.match(await readFile(path.join(store, "_index.md"), "utf8"), /^---\nversion: 2026\.10\.10\+lantern\nname: rom-keldar\n/u);
  git(top, "add", "."); git(top, "-c", "user.name=Ada", "commit", "-q", "-m", "release: 2026.10.10+lantern");
  await commit("Barbara", "characters/rom-keldar/MEMORY.md", "# Memory\n");
  const second = releaseStore(store, "harbor", { on: "2026-10-12" });
  assert.equal(second.prior, first.commit); assert.deepEqual(second.authors, ["Ada", "Barbara"]);
  assert.match(await readFile(path.join(store, "_index.md"), "utf8"), /^version: 2026\.10\.12\+harbor$/mu);
});

test("an unsafe noun, a multi-line annotation and a repeated version are refused", async () => {
  const { store, commit } = await repository();
  await commit("Ada", "characters/rom-keldar/_index.md", "---\nname: rom-keldar\n---\n");
  assert.throws(() => releaseStore(store, "a/b"), /filesystem-safe/u);
  assert.throws(() => releaseStore(store, "ok", { annotation: "two\nlines" }), /one line/u);
  releaseStore(store, "once", { on: "2026-10-10" });
  assert.throws(() => releaseStore(store, "once", { on: "2026-10-10" }), /already exists/u);
});

test("the command prepares a release in a work/governance store and says what to stage", async () => {
  const { store, commit } = await repository();
  await commit("Ada", "characters/rom-keldar/work/governance/skills/x/x.md", "---\nname: x\n---\n");
  const run = spawnSync(process.execPath, [cli, store, "beacon"], { encoding: "utf8", env: environment });
  assert.equal(run.status, 0, run.stderr); assert.match(run.stdout, /authors : Ada/u); assert.match(run.stdout, /work\/governance\/records\/releases\/\d{4}\.\d{2}\.\d{2}\+beacon\.jsonl/u);
  assert.equal(spawnSync(process.execPath, [cli, store], { encoding: "utf8" }).status, 1);
});

test("a release reads the store's own repository even when GIT_DIR points elsewhere", async () => {
  const elsewhere = await repository(); await elsewhere.commit("Mallory", "noise.md", "x\n");
  const { store, commit } = await repository();
  await commit("Ada", "characters/rom-keldar/_index.md", "---\nname: rom-keldar\n---\n");
  const run = spawnSync(process.execPath, [cli, store, "anchor"], { encoding: "utf8", env: { ...environment, GIT_DIR: path.join(elsewhere.top, ".git") } });
  assert.equal(run.status, 0, run.stderr); assert.match(run.stdout, /authors : Ada\n/u);
});
