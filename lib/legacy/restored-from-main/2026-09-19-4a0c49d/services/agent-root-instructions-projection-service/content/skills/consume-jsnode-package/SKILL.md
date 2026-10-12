---
name: consume-jsnode-package
description: "Consume a house jsnode package by its registry name and an exact pin, never a file: path, verifying the version exists, reading its real exports, and keeping npmrc/lockfile/registry routing sane."
---

# Consuming a jsnode package

For when code becomes its own package, see `seat-reusable-jsnode-package`;
for publishing one, see `release-jsnode-npm-package`. This skill is the
consumer side: reaching a package that already exists.

## Consume by registry name and exact pin — never `file:`

**The ruling, stated plainly:** a package depends on another house package
by its registry name and an exact pinned version, resolved through
`https://registry.561.group`. A `file:` specifier is never how one
section's package reaches another section's package. It pins to a
snapshot of the target's working tree at install time, not to a
published, versioned artifact; npm can prune it from the lock entirely
(dependencies with no resolvable registry entry are exactly what a
fresh-install lockfile drops); and it only ever resolves on the one
checkout that has both paths present at those exact relative offsets — it
breaks the moment the path shifts, the machine changes, or CI clones a
narrower tree.

**Why this is stated as a ruling and not a style preference:** this
session found the failure live. A load-bearing journal package
(`harness-lifecycle-journal-service`) was wired into the Codex and Claude
harness services-section packages through a 14-segment
`file:../../../../../../../../../../../../../../../` dependency; npm's
fresh-install lockfile never captured a resolvable entry for it, and the
prune broke the recorder. The same pattern is not an isolated mistake —
this session's grep for `"file:` across tracked manifests turned up dozens
of live cross-section instances: `geode` and over a dozen other packages
consumed by `l-space.561.group` this way, `harness-lifecycle-journal-service`
and `session-transcript-dialects` reached from both harness
services-sections this way, and most of `mathematics-education-youtube-services-section`'s
own dependency block. Every instance found is the same disease: a package
that was never published standing in as a dependency via a raw relative
path.

**What the tree actually does, checked before drawing the boundary:** no
cross-section `file:` dependency found in this census was a deliberate,
sanctioned composition — every one is a package that should have been
published and was not. The one place a `file:` reference is unproblematic
is fully inside a single package's own workspace — a package deliberately
vendoring a subtree it owns and ships together with digest-verified provenance.
That is not cross-section composition; it is one package's own internal
layout. If you are about to write `"file:../../../..."` to reach another
section's package, that is the signal to publish the target package (see
`release-jsnode-npm-package`) and pin it by name instead, not to wire the
path.

### Verify-before-pin: confirm the version exists, then read its real API

Never write an exact pin into `package.json` on the strength of a task
description, a teammate's claim, or a remembered publish — confirm the
version is actually live on the canonical registry, and read its actual
exported surface, before wiring anything to it:

```sh
npm view <@scope/name>@<exact-version> --registry https://registry.561.group
```

A hit prints the tarball URL, `dependencies`, `bin`, and dist-tags; a miss
(404, or a `versions` list that doesn't include the pin) means the pin is
wrong or the package hasn't shipped yet — stop and fix the version, don't
publish a guess and hope the target catches up. Then pull the real API
surface rather than assuming it from the description — `npm view` alone
does not show a package's `exports` map or function signatures:

```sh
npm pack <@scope/name>@<exact-version> --registry https://registry.561.group
tar xzf <name>-<version>.tgz && cat package/package.json   # exports, bin
grep -n '^export' package/src/*.mjs                        # real function names/params
```

Worked example (this session, `@red-cup-engineering/image-generation-inference-team@0.1.1`):
`npm view` confirmed it live (published 34 minutes prior, `dist-tags.latest:
0.1.1`, one dependency `sharp@0.35.4`); unpacking showed `exports: {".":
"./src/image-generation.mjs"}` and `bin: {"image-generation-cli":
"./apps/image-generation-cli.mjs"}`, with the actually-callable surface
being `generateImage(prompt, {outDir, fileBaseName, ...})` exported from
`scripts/generate-image.mjs` (the effectful wrapper a consumer's own
`scripts/` should import) — not the lower-level provider functions in
`src/image-generation.mjs`, and not the CLI. Guessing the function name
or assuming a `generate()` default export from the description alone
would have produced a pin that resolves but a call site that throws.

### Which face to import — the consumer's own stratum picks the door

Import stratification (`import-stratification.md`) applies to a
dependency's OWN internal faces too, not just to files inside the
consuming package: **a `scripts/` file may import the dependency's
`src/` or `scripts/` exports, never the dependency's `apps/*-cli.mjs`**
(a CLI entrypoint is a composed face for an app or a shell invocation,
not a function for another script to call); an `apps/` file may import
any of the dependency's faces, `src`/`scripts`/`apps` alike. When a
dependency exposes the same capability at more than one face (e.g. a
package.json `bin` CLI wrapping a `scripts/` function), pick the door
matching the consumer's own stratum — never reach for the CLI face from
inside a script merely because it was the first thing found.

### Pinning into an existing injection seam

A freshly-published package often exists to fill a seam a consumer module
already left open for injection (a transport/executor/adapter parameter,
not a hard import). Declaring the exact pin in `package.json` and wiring
the seam to use it are two separate decisions — never conflate them into
"it's a real package now, so import it." Read the target function's own
JSDoc and parameter default before touching either side:

- **No default** (e.g. `{ invoke } = {}`, throwing when the caller omits
  it) with the JSDoc naming the collaborator as deliberately not imported
  (kept swappable/stubbable, dependency-light) — that is a pure-injection
  seam by design. The correct action is to add the exact pin to
  `package.json` as a declared dependency, so a caller CAN wire it, and
  leave the function's signature and body untouched. Adding a default
  import there would let a seam that today always fails loudly on a
  missing transport start silently resolving one on its own — a behavior
  change the module's own comment says not to make.
- **An existing default-import convention for other seams in the same
  module** (a parameter like `submit = submitRmnTask` that imports a real
  implementation and defaults to it, letting a caller still override it) —
  match that same shape for the new dependency: import it and default the
  new parameter to it.

A pin sitting in `package.json` with nothing importing it is not
automatically dead weight — check which case above the seam is in before
either wiring a default that doesn't belong or flagging the pin as unused.

## Lockfile hygiene

Every `resolved` URL in `package-lock.json` must point at
`https://registry.561.group`. A lock pinned to `127.0.0.1:4873` (the
laptop's read-through cache) or any other dead host resolves on one
machine only and is a documented recurring disease. Check with:

```sh
grep -c '"resolved": "https://registry.561.group' package-lock.json
grep -vc '"resolved": "https://registry.561.group' package-lock.json  # expect 0 among registry deps
```

When a lockfile misbehaves — stale resolutions, an unresolvable `file:`
entry, a mix of hosts — the recipe is delete both and reinstall clean,
never hand-edit the lock:

```sh
rm -rf node_modules package-lock.json && npm install
```

Then re-run the `resolved` URL check above before trusting the result. A
stale `node_modules` can mask an unresolved lockfile even after deleting
the lock alone, which is why both go together.

## `~/.npmrc` scope routing, and what to do on auth failure

`~/.npmrc` routes the default registry and all six house scopes to
`https://registry.561.group/`; public (unscoped) packages resolve from
npmjs as normal. Verify routing rather than assuming it — a service
restart has rewritten it mid-session before:

```sh
npm config get registry
npm config get @<scope>:registry
```

On a `401`/`403` from the canonical registry: report the exact error
verbatim and stop. Never bypass it — no switching to a different
registry, no vendoring a tarball to route around auth, no committing
`node_modules`. If the missing package is a public (non-house-scoped) tool
rather than a house package, the bounded recovery procedure is
`find-operator-guides`' npm dependency-acquisition-failure section; it is
read-only diagnosis, not authorization to reroute a workflow's registry
on your own judgment.

## Verdaccio's role: the laptop is a cache, not a second custody

Canonical custody is `https://registry.561.group` (Verdaccio on
cold-red-gate). The laptop's `127.0.0.1:4873` is a read-through cache of
that canonical only — it holds no packages of its own and nothing is
published there directly. A package that resolves against the laptop
cache is evidence of what this one machine has fetched, never proof that
the canonical registry actually carries that version; verify against
`https://registry.561.group` before treating a laptop-side resolution as
settled.
