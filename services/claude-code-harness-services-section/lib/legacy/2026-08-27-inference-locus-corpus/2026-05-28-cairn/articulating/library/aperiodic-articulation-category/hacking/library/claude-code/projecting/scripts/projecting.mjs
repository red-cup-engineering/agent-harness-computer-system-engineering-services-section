// projecting : claims/cell <-> packet   [SHP per spotcomp/SHP.md; SHP IS a TRC/TDP over the wire]
//
// General projection from a settled frontier to a packet (the SHP HTML kind). `class` names the
// producing morphism; `data-*` carry EAVT carrier coordinates; content carries the value (SHP.md §1).
//
// TWO INHABITANTS -- because TRC and TDP are one object read two ways (RESEARCH-LEDGER):
//   - FINITE (data-regime="finite"): settled data spans only -- the TRC/memory reading. No scripts.
//   - SCOTT-CONTINUOUS (data-regime="scott-continuous"): ALSO embeds each morphism's schema (the type)
//     and script (the closure rule) -- the TDP/program reading, i.e. a TRC/TDP packaged over the wire.
//     Embeds use NON-EXECUTABLE script types (application/schema+json,
//     application/spotcomp-morphism+javascript): inert to a browser (inspection-safe, SHP.md §6) but
//     extractable and runnable by a CAPABLE recipient -- "Scott-continuous if the recipient can run it."
// HTML is the inter-LLM wire (validatable grammar). The inverse parse (finite) / extract (TDP) is the
// admission side; an incapable recipient still reads the data (graceful degradation).

const GLYPH = { true: "t", false: "f", top: "⊤", bottom: "⊥" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const classToken = (a) => String(a).trim().replace(/[^A-Za-z0-9_-]+/g, "-");
const coord = (c) => ({ e: c.e ?? c.subject, a: c.a ?? c.predicate, v: c.v ?? c.value, t: c.t, belnap: c.belnap });
// only "</" matters to the HTML tokenizer inside <script>; guard it so embedded source cannot break out
const guard = (s) => String(s).replace(/<\//g, "<\\/");
const unguard = (s) => String(s).replace(/<\\\//g, "</");

export function project(claims, opts = {}) {
  const rows = (Array.isArray(claims) ? claims : [claims]).map(coord)
    .filter((c) => c.e != null && c.a != null && c.v != null);
  const operational = !!opts.operational;
  const spans = rows.map((c) => {
    const dt = c.t ? ` data-t="${esc(c.t)}"` : "";
    const db = c.belnap ? ` data-belnap="${esc(c.belnap)}"` : "";
    return `  <span class="${classToken(c.a)}" data-e="${esc(c.e)}" data-a="${esc(c.a)}" data-v="${esc(c.v)}"${dt}${db}>${esc(GLYPH[c.v] ?? c.v)}</span>`;
  });
  const embeds = [];
  if (operational) {
    for (const [slug, schema] of Object.entries(opts.schemas || {}))
      embeds.push(`  <script type="application/schema+json" class="schema" data-slug="${esc(slug)}">${guard(JSON.stringify(schema))}</script>`);
    for (const [slug, source] of Object.entries(opts.morphisms || {}))
      embeds.push(`  <script type="application/spotcomp-morphism+javascript" class="closure-rule" data-slug="${esc(slug)}">\n${guard(source)}\n  </script>`);
  }
  // An SHP IS an <article> -- it starts with <article> and contains nothing outside it.
  return [
    `<article class="shp-packet" data-projection="projecting" data-frontier="settled" data-regime="${operational ? "scott-continuous" : "finite"}">`,
    spans.join("\n"),
    ...(embeds.length ? ["", ...embeds] : []),
    "</article>",
    ""
  ].join("\n");
}

// finite reading: claims only (the TRC/memory view; an incapable recipient stops here)
export function parse(html) {
  const claims = [];
  const re = /<span\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const get = (k) => { const mm = new RegExp(`data-${k}="([^"]*)"`).exec(attrs); return mm ? unesc(mm[1]) : null; };
    const e = get("e"), a = get("a"), v = get("v");
    if (e != null && a != null && v != null) {
      const c = { e, a, v };
      const t = get("t"); if (t) c.t = t;
      const b = get("belnap"); if (b) c.belnap = b;
      claims.push(c);
    }
  }
  return claims;
}

// TDP reading: claims + schemas + scripts -- a TRC/TDP lifted off the wire (the capable recipient)
export function extract(html) {
  const claims = parse(html);
  const schemas = {};
  const scripts = {};
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const body = unguard(m[2]).trim();
    const slug = (/data-slug="([^"]*)"/.exec(attrs) || [])[1];
    if (!slug) continue;
    if (/application\/schema\+json/.test(attrs)) { try { schemas[slug] = JSON.parse(body); } catch { /* skip */ } }
    else if (/application\/spotcomp-morphism\+javascript/.test(attrs)) { scripts[slug] = body; }
  }
  const regime = (/data-regime="([^"]*)"/.exec(html) || [])[1] || "finite";
  return { claims, schemas, scripts, regime };
}

export default function projecting(input, opts) {
  return typeof input === "string" ? parse(input) : project(input, opts);
}
