// Reads the house agency records with the organizing in node_modules beside this file.
import { readAgency } from "@red-cup-engineering/organizing/agency";
import path from "node:path";
const root = process.argv[2];
const agency = readAgency(root, { acts: [] });
const out = { problems: agency.problems?.length, nodesc: [], dup: {}, dupOffices: {} };
const seen = new Map();
for (const [key, r] of agency.skills) {
  const a = r.authored ?? {};
  const d = typeof a.description === "string" ? a.description.trim() : "";
  if (!d) out.nodesc.push({ key, source: r.source, fields: Object.keys(a) });
  (seen.get(r.id) ?? seen.set(r.id, []).get(r.id)).push(r.source);
}
for (const [id, s] of seen) if (s.length > 1) out.dup[id] = s;
const o = new Map();
for (const [key, r] of agency.offices) (o.get(r.id) ?? o.set(r.id, []).get(r.id)).push(r.source);
for (const [id, s] of o) if (s.length > 1) out.dupOffices[id] = s;
console.log(JSON.stringify(out, null, 1));
