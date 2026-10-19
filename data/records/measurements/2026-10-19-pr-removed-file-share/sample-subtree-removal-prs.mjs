// Second sample: PRs whose title says they move or remove a subtree (the legitimate mass removals).
import { execFileSync } from "node:child_process";
import { writeFileSync, appendFileSync } from "node:fs";
const gh = (args) => { try { return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "pipe"] })); } catch { return null; } };
writeFileSync("rows2.jsonl", "");
const seen = new Set(), trees = new Map();
for (const org of ["red-cup-engineering", "561-group", "lenticule-science", "coesite-operations"]) {
  for (const word of ["extract", "remove", "retire", "submodule", "move"]) {
    const found = gh(["search", "prs", "--merged", "--owner", org, "--match", "title", word, "--limit", "20", "--json", "repository,number,title,closedAt"]) ?? [];
    for (const p of found) {
      const slug = p.repository.nameWithOwner, key = `${slug}#${p.number}`;
      if (seen.has(key) || p.title === "Publish only the package's own files") continue;
      seen.add(key);
      const v = gh(["pr", "view", String(p.number), "-R", slug, "--json", "changedFiles,deletions,baseRefName"]);
      if (!v) continue;
      if (!trees.has(slug)) { const t = gh(["api", `repos/${slug}/git/trees/HEAD?recursive=1`]); trees.set(slug, t ? t.tree.filter((e) => e.type !== "tree").length : null); }
      let removed = 0, seenFiles = 0;
      for (let page = 1; page <= 3 && seenFiles < v.changedFiles; page += 1) {
        const rows = gh(["api", `repos/${slug}/pulls/${p.number}/files?per_page=100&page=${page}`]) ?? [];
        if (!rows.length) break; seenFiles += rows.length; removed += rows.filter((r) => r.status === "removed").length;
      }
      const est = seenFiles >= v.changedFiles ? removed : Math.round((removed / seenFiles) * v.changedFiles);
      appendFileSync("rows2.jsonl", `${JSON.stringify({ key, title: p.title, changed: v.changedFiles, removed: est, baseFiles: trees.get(slug) })}\n`);
    }
  }
}
