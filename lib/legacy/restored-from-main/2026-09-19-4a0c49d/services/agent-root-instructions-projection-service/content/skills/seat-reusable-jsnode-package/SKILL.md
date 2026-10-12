---
name: seat-reusable-jsnode-package
description: Create a new house jsnode package when reusable code needs its own custody — where it seats by section, its scope, the generic-to-specialization dependency chain, and what a tarball must include or exclude.
---

# Seating a reusable jsnode package

Routes the thing an agent needs and is not otherwise told plainly: when
reusable code becomes its own package and where it seats. For publishing
it once it exists, see `release-jsnode-npm-package`; for consuming
another package by exact pin, see `consume-jsnode-package`.

This skill is pointers and procedure, not a second copy of the law.
Custody/namespace conformance lives in `review-561-group-javascript-package`;
the registry's own shape lives in the house npm-registry guide
(`561-group-javascript-computer-code-engineering-services-section/content/text/documents/articles/teaching-articles/guides/house-npm-registry.md`,
reachable from the operator handbook index). Read those for the actual
rules; this skill says which one to reach for and walks the ordinary path
through them.

## Institutional fabrication bridge

Do not package an office, agent persona, or runtime projection. Enterprise and
operations carriers own office identity, authority, provider selection, allowed
effects, and receiver acceptance. An engineering package owns the reusable
artifact format, admission, projection, or effect mechanism. A Codex/Claude
runtime-agent TOML is a downstream installed consumer and cannot establish
either ownership or a second consumer.

Before creating a package for an agency skill or work lot, name one active
consumer and inspect the existing fabrication chain: artifact-specification
admission, JSNode package-specification/projection admission,
`create-jsnode-operation-package-service`, and any composing service. Reuse
their public operations; do not package another Markdown/TOML projector,
package writer, staging path, or assay merely because the output will be used
by agents.

Forward-test the decision in this order:

1. The enterprise carrier names the office duty, provider boundary, allowed
   effects, and receiver acceptance.
2. A named active consumer needs a reusable engineering artifact; otherwise no
   package is created.
3. The new package's only added responsibility is the missing agency/work-lot
   admission or projection, with a public composition row to the existing
   fabrication family.
4. A generated skill/operation reaches one harness or control-plane consumer;
   a runtime-agent TOML is rejected as an owner and as proof of execution.

If any row fails, retain the existing carrier and repair the missing handoff;
do not solve it by adding a persona package.

## Reusable code becomes its own package, seated by custody

If a second consumer (a different package, a different section) needs a
capability, it does not import it by relative path across a section
boundary — it becomes its own package. Section shape is already law
(`org-layering.md`): a topic section carries `src/` (domain semantics),
`scripts/` (one operation per effect), and — for a composed face —
`apps/`. Seat the new package under the section that owns the concept, not
wherever the code happened to get written first.

**Check for the sibling-fragmentation disease before creating a new
single-function package.** If the section that already owns this noun/topic
holds one or more sibling `<verb>-<noun>-service` packages beside a bare
namespace folder (no `package.json` of its own), a new single-function
package is the wrong answer — see `org-layering.md`'s "A services-section
IS the package" section. The answer is consolidation: give that section
its own `package.json` and fold the existing siblings' `scripts/`+`test/`
into it, adding the new capability as one more
`scripts/<verb>-<noun>.mjs` there, never as another sibling package.

Name and scope come from custody, not preference. The six house scopes
are `@561-group`, `@causeway-services`, `@coesite-operations`, `@emsenn`,
`@lenticule-science`, `@red-cup-engineering` (`~/.npmrc`, and the house
npm-registry guide). Grep sibling packages already published from the same
section for the scope they use — a new package in an existing section
takes that section's established scope, it does not introduce a new one.

**Matching a section's siblings means reading their manifests whole, not
just their scope.** Before writing a new package.json, open at least two
of the section's existing sibling `package.json` files in full and match
their concrete conventions: `type`, `engines`, the `scripts.test`
invocation style (an explicit file list vs. a glob — sections differ and
pick one silently), the `dependencies`/`devDependencies` shape, and
whether they declare a `bin` map. Do the same for file layout — walk each
sibling's actual `src/`/`scripts/`/`apps/`/`test/` contents, not just
their directory names. When the section's direct siblings don't exemplify
a piece the new package needs (e.g. every sibling in
`computer-inference-system-services-section` is a headless RMN/A2A agent
package with no `apps/` dir at all, but the new package wants a composed
CLI face), do not invent that piece's shape from nothing — pull it from
the nearest package elsewhere in the tree that already exercises it (e.g.
`print-on-demand-design-factory-service`'s
`apps/print-on-demand-design-factory-cli.mjs` for the CLI shape, its
`test/*.test.mjs` for the mock-fetch provider-fallback test pattern) and
match that convention instead of the section's own siblings for that one
piece. Seating by custody (which section) and shaping by convention
(which real exemplar) are two different lookups; running only the first
and improvising the second is how a new package ends up house-adjacent
instead of house-conformant.

### Generic law, specialization, and consumer form one dependency chain

When one request separates a generic semantic rule from a carrier- or
format-specific rule, do not produce two unrelated topic directories and do
not copy the generic predicate into the specialization. Name the direct
dependency chain before creating either package:

```text
generic semantic package -> specialization package -> existing direct consumer
```

Each arrow must correspond to an actual import and an exact registry pin. The
generic package owns only the carrier-independent algebra (for example,
admitting or explaining what a description is). The specialization imports
that algebra and adds only the narrower contract (for example, the discovery
and frontmatter constraints of an agent `SKILL.md` description). The existing
consumer imports the specialization and removes its inline copy of those
checks. More distant consumers continue to depend on the existing direct
consumer unless they themselves call the description algebra; do not add both
new packages to every downstream manifest merely to make the graph look
connected.

Forward-test a proposed layered split:

1. Locate the current executable rule and name the first consumer whose inline
   behavior will become a thin call. A prose mention or an empty section
   manifest is not a consumer.
2. State which predicate remains valid outside the specialized format; that is
   the generic package's public algebra. If nothing survives this test, there
   is no generic package yet.
3. State the additional format-specific predicate and prove it calls the
   generic algebra rather than restating it.
4. Write the manifest chain with planned exact pins: the specialization pins
   the generic package, and the direct consumer pins the specialization. Do
   not use a parent topic-section package as an ornamental dependency when it
   exports no code.
5. Resolve the proposed seats against the actual parent taxonomy before
   writing. A repeated structural segment such as `services/services/`, or a
   requested parent that does not exist, is a custody question to settle from
   the live tree and sibling manifests—not a directory spelling to reproduce
   silently.
6. Run the package review for both new owners, publish generic first and
   specialization second through the publish gate, verify both exact versions,
   then migrate the existing direct consumer. A local unpublished chain is not
   forward-test evidence.

Concrete forward-test for description consolidation: the generic
`computer-content-description-engineering-services-section` should expose the
carrier-independent description admission/semantics; the
`agent-skill-description-engineering-services-section` should pin and import
it while adding `SKILL.md` discovery-description rules; and the existing
`@red-cup-engineering/project-agent-skill-markdown-service` should pin and call
the specialization instead of retaining its current nonempty-single-line
description predicate inline. Its downstream
`project-agent-skill-file-projections-service` and harness projectors do not
need direct pins to either new package unless their own code starts calling
those APIs. This is the required generic -> specialization -> existing
consumer chain; two newly named directories without these imports are still
islands.

### One package can carry several faces, including non-code data assets

A section with `src/` + `scripts/` + `apps/` **plus a directory of
non-code build assets** (LaTeX/typst templates, font files, fixture data)
is still ONE house package, not several. The test for whether a directory
becomes its own package is custody-and-reuse (the opening rule above: a
second, independent consumer needing it standalone), not "it isn't JS." A
templates directory that only this package's own build algebra reads is
an internal asset, seated as a sibling of `src/`/`scripts/`/`apps/` at the
package root (e.g. `templates/`), never split out as its own npm package
merely because its files aren't `.mjs`.

Two things make this work, and both are checked concretely, not assumed:

- **`package.json`'s `files` field (or the absence of `.npmignore`
  excluding it) must include the asset directory**, or `npm pack`/`npm
  publish` silently drops it and the tarball's consumer gets a build
  algebra with no templates to render against. Verify with `npm pack
  --dry-run` (or unpack a real `npm pack` output, per the verify-before-pin
  recipe in `consume-jsnode-package`) and confirm the asset directory's
  files are listed in the tarball contents — don't just eyeball the
  manifest and assume.
- **The build algebra in `src/` reads the templates by a path resolved
  from `import.meta.url`** (the pattern already live in
  `artificial-intelligence-education-curriculum-services-section/scripts/build-ebook.mjs`:
  `const NODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)),
  "..")`), never a path relative to `process.cwd()` — the package is
  consumed from inside another package's `node_modules`, where cwd is the
  consumer's root, not this package's.

### Excluding operational `data/`, `test/`, and lockfiles from the tarball

A package whose `data/` holds runtime state (trip records, high-water
marks, lockfiles, journals — the `data/logs`/`data/records`/`data/state`
trio per `org-layering.md`) must never ship that state in the published
tarball. With no `files` field and no `.npmignore`, `npm pack` bundles
the whole working tree — `data/` included — which is a live packaging
defect, not a hypothetical: found 2026-08-31 in
`alpaca-account-kill-switch-service` (no `files`, no `.npmignore`,
`data/state/high-water-mark.json` and a lockfile going into every
tarball), and unfixed the same shape sits in three more siblings under
the same `alpaca-services-section` (`alpaca-alert-watch-service`,
`alpaca-esther-paper-trading-loop`,
`alpaca-esther-paper-redistributor-loop` — each has a `data/` dir, no
`files` field, no `.npmignore`). Absence of `files` is not a rare gap;
check for it on every package that has a `data/` dir before publishing.

The house convention, verified against
`harness-lifecycle-journal-service`'s (published, `data/logs/` +
`data/records/schema/` + `data/records/service-records/` present on
disk) actual `package.json`: a `files` **whitelist**, not
`.npmignore` — list only what ships, and runtime `data/` is never one of
the listed paths. Only a specific, build-relevant subpath is, when one
exists — this package ships its JSON Schema and nothing else under
`data/`:

```json
"files": ["src", "scripts", "data/records/schema"]
```

`npm pack --dry-run` on it lists exactly 8 files, including
`data/records/schema/harness-lifecycle-event.schema.json` and nothing
else under `data/` — `data/logs/` and `data/records/service-records/`
are excluded by simply not being named.

A package with no data meant to ship (the kill-switch's whole `data/` is
runtime state — nothing built from it belongs in a consumer's
`node_modules`) just omits `data/` entirely:
`"files": ["src", "scripts"]`. `test/` and `package-lock.json` are never
listed either way — a `files` whitelist excludes anything not named, so
leaving them off IS the exclusion; no separate `.npmignore` entry is
needed for them. (`README.md`, `package.json`, and `LICENSE` ship
regardless of `files` — npm's own always-included set — so they need no
entry.)

**Verify exclusion, not just inclusion**, with `npm pack --dry-run`
before publishing: read the tarball-contents list it prints and confirm
it contains no line under the package's runtime-state subpaths (its
`data/logs/`, `data/state/`, or `data/records/service-records/`, per
whichever the package actually has), no `test/` line, and no
`package-lock.json` line — not only that the intended asset paths are
present. This is the same command the asset-directory verification above
calls for, run in the other direction: there, confirm a wanted path made
it in; here, confirm an unwanted one did not.

Before creating, moving, or extending a package's custody, run
`review-561-group-javascript-package` on it. That review is for ownership
decisions (does this directory's manifest name, namespace, and seat match
its actual custody); it is not a precondition for ordinary consumption of
an already-published dependency — see `consume-jsnode-package` for that.
