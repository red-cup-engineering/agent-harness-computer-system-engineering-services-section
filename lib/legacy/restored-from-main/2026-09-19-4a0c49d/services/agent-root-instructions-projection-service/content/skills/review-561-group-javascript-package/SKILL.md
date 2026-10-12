---
name: review-561-group-javascript-package
description: Review ownership, naming, dependencies, and structural conformance of one 561 Group JavaScript package before changing or connecting it.
---

# Review one JavaScript package

Use this before extending, moving, creating, or adding a dependency edge to a
561 Group JavaScript package. Establish the exact package directory and its
repository boundary first; nested repositories and submodules have their own
custody. An unresolved owner, manifest identity, dependency provenance, or
external-effect boundary stops the proposed package work until it is inspected.
If the package is decommissioned or cannibalized, stop package work: it is not
a repair, release, compatibility, or completion target. Discover its real
consumers, select the retained non-decommissioned owner, and use
`migrate-consumer` to move consumers directly, convert persisted records once
in this early-alpha system, verify receivers, and remove obsolete executable
mechanics. That cutover preserves Founder sources and non-retired legacy,
converts durable active records once into canonical custody, and removes the
retired format after its receiver check.
Before a modification or addition of an operation, census equivalent operations
and their consumers across live nonlegacy code. Route a duplicate family to the
Computer Code Development Services Lead through the COO's existing
work-allocation boundary and use the existing
`@red-cup-engineering/jsnode-engineering-cli` `duplication` and
`duplication-migration` capability. Treat all copies and consumers as one
family: clean-room rewrite the shared typed functional owner, convert persisted
records once, move every consumer, and remove copied mechanics; do not repair
or add one local copy.

Run the typed operation
`review561GroupJavascriptPackage(packageDirectory: string) -> { packageDirectory,
deviations, normalizedManifest }` from its owning section:

```sh
cd lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section
node scripts/review-561-group-javascript-package.mjs PACKAGE_DIRECTORY
```

`PACKAGE_DIRECTORY` is required. The operation inspects the manifest, normalized
manifest, owner/section naming, exports and scripts, tests, and installed
dependency graph. For a new
cross-package edge, review both ends and reject `file:`, `link:`, `workspace:`,
or imports that escape a package root. A fresh registry install and public-import
assay are required after a provider release when the receiver depends on it.

Report the package identity, deviations, applicable boundary, and the focused
check. A report emitted by the operation is not conformance unless its process
exits successfully.

Read [detailed guidance](references/detailed-guidance.md) only for its named
sections **Prove the exact repository and package boundary**,
**Founder-routed frozen-reference adaptations**, **Persistent-journal failure
gate**, **shared deterministic video generation**, **Historical app material**,
or the Cloud Run, GitHub workflow, public-site, harness-projection, and
OAuth-validator extension reviews. Those modes add evidence for their receiver;
they do not replace this package review.
