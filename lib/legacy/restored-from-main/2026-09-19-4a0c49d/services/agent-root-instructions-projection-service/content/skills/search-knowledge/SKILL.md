---
name: search-knowledge
description: How to find what the tree already holds — a term, concept, capability, spec, or prior decision — before writing anything new or asking the founder. Load before grepping the filesystem by hand for anything conceptual.
---

# Search knowledge

Use current loaded context before another search. A bounded lookup is ordinary
session work; delegate independent substantial reading only when authorized.

## Order of instruments

1. **A term or glossary entry**: `mcp__jsnode-server__jsnode_term` (name,
   frontmatter name, or alias, across every glossary in the tree). This is
   the fastest way to learn whether a word is already ruled, and where.
2. **A capability or which package owns it**: `mcp__jsnode-server__jsnode_search`,
   `jsnode_section` (finds the `*-services-section` that owns a
   capability), `jsnode_atlas` for a whole-workspace overview.
3. **Prose across the corpus** (notes, logs, specs, triage): `mcp__markdown-vault__search_markdown_vaults`
   for exact evidence (pass `generation: "all"` to include legacy/triage —
   default `"current"` misses drift copies); `search_markdown_lightcone`
   when path semantics should narrow it. Once a path is named, read it with
   `read_markdown_carrier` rather than `cat`/`sed` on the same file.
4. **Declared relations / formal concepts**: `mcp__l-space__search_l_space`,
   `query_l_space_concept`.
5. **Prior session history**: use native task history and memories for continuity.
   When exact earlier words are needed, use
   [mine-transcripts](../mine-transcripts/SKILL.md) to select the correct
   provider's root transcript. A child transcript is a different conversation.
6. **Raw grep/find** (`Bash`, `Grep`): last resort, for filenames or exact
   strings the above don't cover — not the first move.

## Before treating a result as settled

- For a claimed user requirement or prior decision, recover its original
  transcript or carrier before creating a knowledge record or relying on an
  agent summary. Keep the source and a derived view distinct. A category,
  brand, filename, or package name does not establish meaning or ownership;
  inspect the actual owner and consumers.
- A term search returning zero or many hits is data, not noise: many hits
  across `current`/`legacy`/`triage` generations means drift, not that the
  first hit is authoritative. Prefer `current`-generation carriers; read at
  most one representative `legacy` snapshot when several are near-duplicate
  archive copies of the same old file.
- Cite the source needed to support the answer. Quote exact user rulings or
  definitions when their wording matters; do not turn a short answer into a
  transcript or repository dump.
