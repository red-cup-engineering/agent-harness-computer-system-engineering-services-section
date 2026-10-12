// recognizing : memory rows -> recognition-weighted rows   [per spotcomp/RECOGNITION.md]
//
// Trust is receiver-relative and derived from PROVENANCE (the recognition-fiber, read from `evidence`),
// never smuggled into {e,a,v,t}. Tiers: SENSE (direct observation -- your prompts, tool/world results)
// > REMEMBERED-SENSE > LEARNING (dream/inference). Learning decays with age; sense does not -- so over
// time the world-truths dominate my own guesses without needing repetition. On conflict, sense wins.

const TIER = { sense: 3, "remembered-sense": 2, learning: 1 };

export function provenanceOf(row) {
  const ev = (Array.isArray(row?.evidence) ? row.evidence.join(" ") : String(row?.evidence ?? "")).toLowerCase();
  if (/userpromptsubmit|transcript|posttooluse|tool:|\bstop\b|observed|uttered/.test(ev)) return "sense";
  if (/remember|recall|referenc/.test(ev)) return "remembered-sense";
  if (/dream|infer|consolidat|studied|salience/.test(ev)) return "learning";
  return "remembered-sense"; // unknown provenance -> mid trust
}

const ageDays = (t, now) => {
  const a = Date.parse(t), b = now ? Date.parse(now) : Date.now();
  return Number.isFinite(a) ? Math.max(0, (b - a) / 86400000) : 0;
};

export function weightOf(row, now) {
  const prov = provenanceOf(row);
  const base = TIER[prov] ?? 1;
  // learning decays (half-life ~7 days); sense / remembered-sense persist, so sense dominates over time
  return prov === "learning" ? base * Math.pow(0.5, ageDays(row?.t, now) / 7) : base;
}

// annotate rows with provenance + weight and sort by weight desc (stable for ties)
export default function recognizing(rows, { now } = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ ...r, provenance: provenanceOf(r), weight: weightOf(r, now) }))
    .sort((a, b) => b.weight - a.weight);
}
