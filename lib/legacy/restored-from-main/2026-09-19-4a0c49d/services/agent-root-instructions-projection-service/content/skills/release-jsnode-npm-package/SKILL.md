---
name: release-jsnode-npm-package
description: Publish a house jsnode package to the canonical registry as the routine next step once it exists, check its real consumers before a breaking version, and reduce any existing inline copy to a thin call afterward.
---

# Releasing a jsnode package

For when code becomes its own package, see `seat-reusable-jsnode-package`;
for consuming one by exact pin, see `consume-jsnode-package`. This skill
is the publish step in between.

## Enumerate consumers from the graph, not from a claim

Before treating a 0.x (potentially breaking, per house semver convention)
or major publish as safe, get the dependent list from the jsnode-server
MCP tools, not from a task's or teammate's claim about "the only
consumer" and not from grepping sibling packages in the same section —
grep only sees what's nearby on disk and misses a consumer seated in a
different section entirely. Run `jsnode_search` on the package name (or
`jsnode_package` directly if the exact name is known) and read its
`consumers` / `consumerDeclarations` field — that is the graph's own
dependent list, built from every workspace manifest, not one section's
neighborhood. Treat that list, not the task description, as the set of
consumers the publish gate's "check consumers, proceed only with the
consumer fixed in the same change" step must cover.

## Make it consumable: publish, as the routine default

Once a capability is its own package, "consumable" means published to
`https://registry.561.group` — not merely present on disk. A package that
exists only in the working tree is not yet available to any other
package's `package.json`.

House packages remain below `1.0.0`. A breaking initial-development change
advances the minor version within `0.x`; it does not authorize `1.0.0`.
Tests and registry availability do not establish framework maturity or a
stable public API. Follow the Leader's explicit version-reset instructions
through the shared packaging repair operation when published identities must
be corrected, including their tags, dependency pins, and artifact integrity.

Run `publish-package`'s gate exactly: baseline test count, fresh install
with every `resolved` URL confirmed at `registry.561.group`, tarball diff
against the currently-published version (or explicit note that a new
name/package has no prior tarball), version bump sized to the change,
`npm publish`, then `npm view <name> versions` to verify.

Do this early and often. A capability sitting unpublished while something
else needs it is the default failure mode this skill exists to close —
seen this session as multiple agents freezing at "needs a publish" and
stopping instead of running the gate. Needing a publish is not a blocker
to report and wait on; it is the next step to execute. Publish small,
publish additive, publish before the second consumer is wired — never on
momentum past a breaking change, but never stalled on a routine one
either.

### The existing consumer becomes a thin call, not a second implementation

When a new package generalizes logic an existing package already owns
inline (e.g. a section-local `scripts/build-ebook.mjs` that a new topic
section's package is meant to supersede), publishing the new package is
not the finish line — the old owner's local script is now duplicate
logic sitting beside the thing that should call it. Run `migrate-consumer`
for the actual hand-off (it covers the "old/new semantics assayed, unique
behavior merged first" sequencing); this skill's job is only the
packaging shape that migration lands in:

- The old script's exported function signature (e.g.
  `buildEbook({slug, title, subtitle, author, bookDir, distDir,
  pandocBin})`) is the spec for the new package's equivalent operation —
  read it in full before designing the new package's algebra, so the
  generalization is grounded in the real current parameters and return
  shape (chapter list, output paths, byte counts, sha256 digests) instead
  of an assumed one.
- After migration, the old location keeps only a thin wrapper: import the
  new package by its registry name and exact pin (see
  `consume-jsnode-package`), call it with the section-specific arguments
  (slug, title, author, template choice), and do nothing else. It does not
  keep a parallel copy of the pandoc/build invocation "just in case."
- **Import stratification governs which file in the old section does the
  wiring.** A `scripts/build-ebook.mjs` that itself imports another
  `scripts/` function from the new package (e.g. `produceEbook` from
  `ebook-production-services-section`'s own `scripts/produce-ebook.mjs`)
  is correct — scripts importing scripts is exactly the shape
  `import-stratification.md` sanctions. The old script must not be
  upgraded to import the new package's `apps/*-cli.mjs` — that would
  invert a script into depending on an app.
