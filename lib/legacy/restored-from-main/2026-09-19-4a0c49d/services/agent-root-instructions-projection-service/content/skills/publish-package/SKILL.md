---
name: publish-package
description: Publish one house JavaScript package through the canonical registry gate, with source, registry-install, receipt, and optional consumer-repin evidence.
---
<!-- Generated from @red-cup-engineering/agent-root-instructions-projection-service/content/skills/publish-package/SKILL.md. Edit the package source. -->

# Publish a package

Use the existing publication operator.
Do not recreate its install, registry, tarball, receipt, or repin algorithms in a consumer, shell recipe, or this skill.

The canonical house registry is `https://registry.561.group`.
This skill authorizes publication to that registry only.
Publishing to npmjs, making a repository public, or submitting a marketplace listing remains a separate principal-controlled public-release gate; report it as outstanding when it is in scope.

## More than one package changed, or a consumer cascades? Stop — use the wave operator, not this one repeatedly

`publish-package.mjs` (below) is for ONE package and its direct, already-known consumers.
It is the wrong tool the moment you find yourself repinning a consumer, then discovering THAT consumer's own consumer is now stale too, and repeating this by hand — that one-at-a-time chase is exactly the expensive failure mode this note exists to stop (observed 2026-09-11: a session spent its entire length manually walking a four-package stale-pin chain this way before finding the tool below already existed in the same package).

The same `npm-workspace-publication-service` package that owns `publish-package.mjs` also owns a whole-workspace release pipeline, built for exactly a multi-package change or a consumer cascade:

- **`prepare-release-wave.mjs`** — scans every tracked/untracked changed file across the whole workspace, computes the correct version bump for each changed package, and retargets every internal consumer's exact pin automatically.
  `--apply` rewrites manifests and lock roots for the whole wave in one pass.
  This is what replaces manually finding "oh, this consumer needs repinning too" one level at a time.
- **`publish-workspace-tiers.mjs`** — publishes the whole computed set leaf-first (dependency order).
  `--preflight` installs and tests every pending package in isolated copies before any registry write begins; `--execute` only writes once the whole set has already passed.
- **`reconcile-package-locks-from-releases.mjs`** — batch-refreshes every affected consumer's lockfile against one release wave's output, instead of reconciling one package's lock at a time.

Reach for these the moment a change touches, or is discovered to touch, more than one package's published version — not after manually chasing a second, third, or fourth stale pin by hand.
If you are already mid-chase when you realize this, stop the manual chase and switch to the wave tooling for what remains rather than finishing the chase by hand for the sake of not switching tools.

## Operator (single package)

The published owner is `@red-cup-engineering/npm-workspace-publication-service@0.8.4`.
Its source CLI is:

```text
/home/emsenn/info/lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section/services/javascript-node-services-section/services/jsnode-packaging-services-section/services/npm-services-section/services/npm-registry-services-section/services/npm-workspace-publication-service/scripts/publish-package.mjs
```

Discover the installed package and its current CLI through `jsnode_package` when available; if that capability is unavailable, verify this source path and the CLI's `--help` output on disk before use.
Its contract is:

```text
publish-package --package <absolute-dir> [--bump patch|minor|major] [--apply]
  [--pin <dependency-name>@<version>]... [--repin <absolute-consumer-dir>]...
  [--registry <url>]
```

Use absolute package and consumer paths.
Omit `--apply` to run the gate through its plan frontier.
Plan mode is not a side-effect-free local check: it reads the registry, builds where declared, removes and reinstalls the package's `node_modules` with the package's own manager, and runs tests.
It does not bump, publish, write a receipt, or repin a consumer.

`--pin <dependency-name>@<version>` sets one of the package's own already- declared dependencies to that version and refreshes its lockfile (an update-lock install, never a frozen one) before the gate runs — use this instead of hand-editing the package's `package.json` and separately running `npm install` when this package itself needs to pick up a newly-published upstream version first.

With `--apply`, the operator checks registry liveness, build freshness, the manager-owned fresh install, source tests, version availability, the prior tarball's public surface, publishes, installs the new registry artifact and imports every export, writes a receipt, and then processes each requested consumer repin.
It detects npm, pnpm, and yarn from the manifest and lockfiles; the operator preserves committed locks and uses the owning manager to update a consumer lock after its manifest pin changes.
Do not delete a lockfile or force `npm install` around this operator.

House packages remain below `1.0.0`.
During initial development, use a patch bump for a compatible fix and a minor bump for an added, removed, or incompatible public capability.
A breaking change does not authorize a stable-major release.
Neither passing tests nor making a package available in the house registry establishes product readiness or a stable public API.
A transition to `1.0.0` requires a separate, explicit instruction from the Leader; never infer it from the size of a change or a request to improve a product.

Read the report rather than inferring success:

- `planned` means the pre-publication gate passed without a release.
- `published` means every requested repin passed.
- `published-with-repin-failures` means the package release exists but at least one consumer did not install or test; stop the release train at that consumer and report the partial result.
- `refused` records the first failing gate and its evidence.

CLI exit `0` is limited to `planned` and `published`; exit `2` is a refusal or partial release.
Inspect every step in the JSON report, especially the fresh install, tarball-diff, registry import, receipt, and repin entries.

## Consumer activation

Pass each known ordinary consumer once with a repeated `--repin <absolute-dir>` only when its exact pin should move with this release.
The operator updates the manifest and owning lock, reinstalls, and runs the consumer's test command.
Verify any additional receiver-specific startup, deployment, or live probe outside the package gate.
Use `migrate-consumer` only when replacing a superseded capability, rather than updating one exact version.
If a repinned consumer's own consumers now need repinning too, that is the signal from the section above to switch to the wave tooling rather than repeating this by hand.

## When `--apply` is denied by the harness itself

`--apply` runs a Bash command that mutates a shared external resource (the house registry).
The Claude Code auto-mode permission classifier denies this category of command by default — with the reason `[Modify Shared Resources]` — for every session and subagent alike; a background subagent cannot clear this the way a foreground session with a present human can.
Observed directly 2026-09-11: identical denial hit both a dispatched subagent and the foreground orchestrator running the identical command.

This denial is not evidence that publishing is broken, and it is never license to substitute other work for the publish step.
On this exact denial:

- Stop before committing anything for this lot.
  Do not commit a new canonical package, a bumped dependency version, or any other artifact of the migration while its publish is still outstanding — a half-migration that adds a new implementation without deleting the superseded ones increases duplication, which is a worse state than not starting.
- Never narrate the gap away in a commit message ("publish blocked, pending") as if that closes the lot.
  An admitted obligation blocked on an external condition stays open; a commit is not a substitute receiver outcome for it.
- Report the exact denial text and the exact command to the orchestrating session/user and stop there.
  Only the session holding an interactive human who can approve the prompt, or a Bash permission rule the user adds for this operator, can clear it — a subagent guessing around it cannot.
- Once cleared, run the same `--apply` command and finish the lot atomically: publish, then delete the superseded duplicate(s) and repin real consumers in the same pass, per the engineering method's "never leave a fix half-done" rule.

## Boundaries and supplemental gates

The gate proves source behavior and an isolated registry install/import.
It does not prove a running service deployment, an authenticated user flow, a production probe, a public npm release, or a marketplace submission.
Run and report those only when the requested receiver requires them.

Do not bypass a failed registry, source, version, or public-surface gate.
A normal publish creates release state: after publication, failed consumer acceptance leaves the release partially delivered until that consumer is repaired and verified.
Do not overwrite tags or unpublish on your own judgment.
An explicit Leader instruction to roll back or renumber published packages authorizes that correction.
Use the shared packaging repair operation with an explicit version map, original-artifact backups, dependency and integrity repair, and registry and installed-artifact verification.
Do not refuse the authorized correction merely because it changes published versions or tags.

## Forward tests

- `node <operator> --help` prints usage and performs no registry action.
- A plan against a dead registry returns a step-0 refusal datum and exit `2`.
- A successful report includes passed source fresh-install evidence, registry import evidence, and a receipt.
  The existing `0.8.4` report is one such observed case; it does not replace rerunning the gate for a new release.
- Any public-release, deployment, or receiver-live gate absent from the report remains explicitly unverified.
- A change discovered to touch more than one package's version, or whose consumer cascades past one hop, was planned and executed with the wave tooling above, not a manual chain of single-package `--repin` calls.
