// Measures removed-file share of merged PRs. Reads only. Output: rows.jsonl
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
const gh = (args, max = 256) => { try { return execFileSync("gh", args, { encoding: "utf8", maxBuffer: max * 1048576, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { return null; } };
const json = (args) => { const o = gh(args); return o === null ? null : JSON.parse(o); };
const ORGS = ["red-cup-engineering", "561-group", "lenticule-science", "coesite-operations"];
const PER_ORG = 50, SAMPLE_PAGES = 3;
writeFileSync("rows.jsonl", "");
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const treeCount = new Map();
function baseFiles(slug) {
  if (treeCount.has(slug)) return treeCount.get(slug);
  const t = json(["api", `repos/${slug}/git/trees/HEAD?recursive=1`]);
  const v = t === null ? null : { files: t.tree.filter((e) => e.type !== "tree").length, truncated: !!t.truncated };
  treeCount.set(slug, v); return v;
}
function removedSample(slug, number, changed) {
  let removed = 0, seen = 0;
  for (let page = 1; page <= SAMPLE_PAGES && seen < changed; page += 1) {
    const rows = json(["api", `repos/${slug}/pulls/${number}/files?per_page=100&page=${page}`]);
    if (rows === null || rows.length === 0) break;
    seen += rows.length; removed += rows.filter((r) => r.status === "removed").length;
  }
  const exact = seen >= changed;
  return { removed: exact ? removed : Math.round((removed / seen) * changed), seen, exact };
}
for (const org of ORGS) {
  const repos = (json(["repo", "list", org, "--limit", "200", "--no-archived", "--json", "name,pushedAt"]) ?? []).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
  const recent = repos.slice(0, 12), rest = repos.slice(12).sort(() => rnd() - 0.5).slice(0, 6);
  const prs = [];
  for (const r of [...recent, ...rest]) {
    const slug = `${org}/${r.name}`;
    const list = json(["pr", "list", "-R", slug, "--state", "merged", "--limit", "15", "--json", "number,mergedAt,changedFiles,additions,deletions,baseRefName"]) ?? [];
    for (const p of list) prs.push({ slug, ...p });
  }
  prs.sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
  for (const p of prs.slice(0, PER_ORG)) {
    const base = baseFiles(p.slug);
    const rs = p.changedFiles === 0 ? { removed: 0, seen: 0, exact: true } : removedSample(p.slug, p.number, p.changedFiles);
    appendFileSync("rows.jsonl", `${JSON.stringify({ org, slug: p.slug, number: p.number, mergedAt: p.mergedAt, changed: p.changedFiles, lineDeletions: p.deletions, removed: rs.removed, exact: rs.exact, baseFiles: base?.files ?? null, truncated: base?.truncated ?? null })}\n`);
  }
  console.error(org, "done", prs.length, "candidate PRs");
}
