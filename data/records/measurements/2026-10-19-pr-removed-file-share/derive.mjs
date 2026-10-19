// Run from this directory after count-base-trees.mjs: node derive.mjs. Prints the distribution the requirement cites.
import { readFileSync } from "node:fs";
const rows = readFileSync("pull-requests.jsonl","utf8").trim().split("\n").map(JSON.parse);
const incident = (r) => r.title === "Publish only the package's own files";
const rm = rows.filter((r) => r.removed > 0 && r.baseFiles);
rm.forEach((r) => { r.share = r.removed / r.baseFiles; });
console.log("PRs", rows.length, "| incident controls", rows.filter(incident).length, "| removing>=1 file", rows.filter(r=>r.removed>0).length, "| zero removal", rows.filter(r=>r.removed===0).length);
console.log("sample1 PRs", rows.filter(r=>r.sample===1).length, "sample2", rows.filter(r=>r.sample===2).length);
const legit = rm.filter((r) => !incident(r)).sort((a,b)=>b.share-a.share);
console.log("--- legitimate (not incident) PRs by share, top 20");
for (const r of legit.slice(0,20)) console.log((r.share).toFixed(4), r.removed, "/", r.baseFiles, r.key, "|", (r.title||"").slice(0,60));
console.log("--- incident controls");
for (const r of rm.filter(incident).sort((a,b)=>a.share-b.share)) console.log(r.share.toFixed(4), r.removed, "/", r.baseFiles, r.key);
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
const nonInc = rows.filter(r=>!incident(r));
const shares = nonInc.map(r=> r.removed>0&&r.baseFiles ? r.removed/r.baseFiles : 0);
for (const p of [0.5,0.9,0.95,0.97,0.99]) console.log("legit p"+p*100, "share", q(shares,p).toFixed(4), "removed files", q(nonInc.map(r=>r.removed),p));
console.log("legit n", nonInc.length);
