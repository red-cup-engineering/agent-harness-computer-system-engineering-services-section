// For every sampled PR that removes at least one file, recount the base tree at the PR's own base commit.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const gh = (args) => { try { return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] })); } catch { return null; } };
const load = (f) => readFileSync(f, "utf8").trim().split("\n").map(JSON.parse);
const a = load("rows.jsonl").map((r) => ({ key: `${r.slug}#${r.number}`, sample: 1, org: r.org, changed: r.changed, removed: r.removed, exact: r.exact }));
const b = load("rows2.jsonl").map((r) => ({ key: r.key, sample: 2, title: r.title, changed: r.changed, removed: r.removed }));
const seen = new Set(); const all = [];
for (const r of [...a, ...b]) if (!seen.has(r.key)) { seen.add(r.key); all.push(r); }
const out = [];
for (const r of all) {
  if (r.removed > 0) {
    const [slug, number] = r.key.split("#");
    const pr = gh(["api", `repos/${slug}/pulls/${number}`]);
    const t = pr && gh(["api", `repos/${slug}/git/trees/${pr.base.sha}?recursive=1`]);
    r.baseFiles = t ? t.tree.filter((e) => e.type !== "tree").length : null;
    r.truncated = t?.truncated ?? null; r.title = r.title ?? pr?.title;
  } else r.baseFiles = null;
  out.push(r);
}
writeFileSync("final.jsonl", out.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(out.length, "PRs;", out.filter((r) => r.removed > 0).length, "remove files");
