---
name: write-markdown
description: Create, revise, move, or normalize Markdown carriers at their lawful content owner using the repository's Markdown operations and carrier conventions.
---

# Write Markdown carriers

Markdown is a carrier format, not the owner of every kind of prose. Identify
the subject owner and carrier class first. Keep domain-specific admission,
publication, legal, glossary, research, and harness behavior with those
capabilities; this skill supplies only the generic Markdown-writing path.

A commissioned Markdown or subject-science provider uses this procedure to
produce the carrier. When the executive receiver loads it, the purpose is to
bound the commission and assay the returned artifact; loading it does not
authorize the receiver to become the writer.

Read the repository's Markdown carrier guide before writing:

`lib/emsenn/services/561-group/services/561-group-services-section/content/text/documents/articles/teaching-articles/guides/writing-markdown-carriers.md`

Use the owning section's current Markdown operation where one exists. Reusable
Markdown parsing, rendering, normalization, and checking belong to the Markdown
engineering capability. Do not reproduce those mechanics in a domain service
or in this skill.

## Place the carrier

Choose the most-fit existing subject owner, then use that owner's established
content seat and sibling shape. Nearby files are evidence, not authority to
copy a malformed convention. Read only the named family and the links needed
to place it correctly.

If a request is specifically to locate or reorganize a family, finish the
bounded normalization rather than returning paths: correct names and nesting,
move carriers to their lawful content seats, update links and generator inputs,
distinguish authored sources from generated projections, and remove superseded
copies once their unique information has reached the receiver. Do not widen
this into a repository census.

For a simple edit whose owner and seat are already clear, the provider edits it
directly within its bounded lot; no broad census or organization campaign is
needed.

## Write from evidence

- Read the carrier, its immediate owner instructions, and the sources needed
  for the requested claims.
- Preserve supported meaning and uncertainty. Do not invent facts,
  provenance, dates, authority, or frontmatter fields.
- Revise current prose in place. Delete obsolete early-alpha residue rather
  than memorializing it in compatibility notes or disposition prose.
- Edit authored sources, then run their generator. Never treat a generated
  copy as an independent source.
- Keep links relative where the carrier convention requires it, and verify
  every changed relative link resolves on disk: check with
  `resolveSetOfMarkdownLinkTargets`/`walkMarkdownLinkTargets`
  (`@red-cup-engineering/resolve-markdown-link-target-service`'s
  `scripts/resolve-set-of-markdown-link-targets.mjs`, runnable directly as a
  CLI over explicit carrier paths or piped stdin); get a `../` chain right the
  first time with `projectMarkdownRelativeLink`
  (`@red-cup-engineering/relocate-markdown-tree-service`'s
  `scripts/project-markdown-relative-link.mjs <carrierPath> <targetPath>`)
  rather than hand-counting segments.

Glossary terms, legal text, publications, research dossiers, and generated
agent instructions must use their own service operations and acceptance rules.
Load those procedures from their actual owners; do not add their recipes here.
The owners a research or science carrier reaches (paths from repository root,
each with its own contract file to read first):

- Science section shape, citation model (depth-1 `references:` keyed map,
  depth-2 bibliography carriers, depth-3 sources), and what "done" means:
  `lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-science-services-section/content/text/documents/articles/specifications/2026-08-30-science-topic-section-model.md`.
- Glossary terms — `scripts/write-term.md` and `scripts/write-term.mjs` in
  `lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-knowledge-systems-services-section/services/computer-glossary-systems-engineering-services-section/services/term-engineering-services-section/`
  (`recognize-term.mjs` to check an existing one).
- Bibliography carriers, `references:` maps, CSL-JSON, and free-text
  citations — `apps/bibliography-cli.mjs` (`write`, `reconcile`, `parse`,
  `import-csl`, `project-csl`) in
  `lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-knowledge-systems-services-section/services/bibliography-engineering-services-section/`;
  `record-set-of-references-health.mjs` there is the receipt for a citation pass.
- Fetching published works (OpenAlex, PubMed, CrossRef DOI) as CSL-JSON —
  `apps/bibliography-cli.mjs` (`resolve-doi`, `search-openalex`,
  `fetch-openalex`, `search-pubmed`, `fetch-pubmed-summaries`) in the same
  bibliography section above; the CSL-JSON format itself is
  `@red-cup-engineering/csl-json-services-section` in computer-data.
- Biographies of theorists — one file per person under
  `lib/emsenn/services/561-group/services/science-services-section/content/text/documents/articles/biographies/`, shaped like `lauren-berlant.md` there.

## Finish

Run the narrow owning Markdown check or operation, reopen the written bytes,
and inspect the actual diff. Confirm the carrier is at its lawful seat, its
frontmatter matches the owner's admitted shape, changed links resolve, and no
superseded copy remains within the bounded family.

## Forward tests

- A named agent-science family with scattered Markdown is normalized at its
  lawful owners; reporting its paths alone is incomplete.
- A typo or move in an evidently owned note is commissioned to the Markdown or
  subject-science provider and corrected without a broad search; the executive
  receiver integrates and assays it.
- Domain-specific publication, legal, and glossary recipes remain in their
  own capabilities and are absent here.
