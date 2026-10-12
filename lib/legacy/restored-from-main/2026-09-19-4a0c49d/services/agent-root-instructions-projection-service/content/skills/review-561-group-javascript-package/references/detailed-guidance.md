---
name: review-561-group-javascript-package
description: "Reviews ownership, naming, and structural conformance before changing a 561 Group JavaScript package."
---

Review exactly one 561 Group JavaScript package without changing it before
building on it, extending its custody, moving it, or creating it. The
operation checks the package's actual directory custody, owner namespace,
service-section naming, manifest name, normalized manifest, scripts, and
tests.

Any new cross-package consumer attachment requires this operation on both the
consumer and its upstream provider before the pin is written. Ordinary use of
an existing, already-reviewed exact registry dependency remains routine, but
a new edge must prove the full boundary: every dependency declaration,
source module, and test module. Reject `file:`, `link:`, and `workspace:`
dependency specifiers, and every relative import that resolves outside the
package or enters a nested package root. Same-package relative imports remain
valid. When a package lock is present, inspect every `packages` entry, not
only its root manifest: reject nested local dependency forms, localhost
tarball URLs, and house-package URLs outside `https://registry.561.group/`.
After a provider release, fresh-install the consumer from the registry and
exercise the required behavior through its public import. The CLI always
writes its structured reports, then exits nonzero when any report has a
deviation; process success means conformance, while a returned report alone
means only that the inspection ran.

An unresolved owner, repository identity, dependency provenance, credential,
or external-effect deviation is an immediate stop: inspect the owning section,
consumers, and nearby conformance tests before continuing. A known pre-existing
naming or manifest-normalization deviation inside an already authorized repair
does not create a new permission gate. State whether the bounded repair fixes
or preserves it, do not treat it as precedent, and keep the resulting
conformance deviation honest. The frozen-reference route below remains for a
production adaptation whose authority or receiving boundary is otherwise not
already established.

## Prove the exact repository and package boundary

For a package nested as an independent repository or submodule, do not infer
custody from the enclosing tree. From the exact target directory, record
`git rev-parse --show-toplevel`, `git rev-parse HEAD`, the configured origin
URL, and the enclosing repository's gitlink plus `.gitmodules` entry when one
exists. Normalize SSH and HTTPS forms before comparing the origin with the
declared target GitHub owner/repository. Then compare that repository identity
with `package.json` name, `repository`, exported/bin identity, directory leaf,
and the owning service section. A mismatch, absent origin, ordinary nested
directory where a gitlink is required, or workflow residing only in the
enclosing repository is a stop; sibling repository evidence cannot cure it.

Record the exact target tuple before adapting anything:

| Filesystem/repository boundary | Package boundary | Owner evidence | Result |
| --- | --- | --- | --- |
| top level, full HEAD, normalized origin, gitlink and `.gitmodules` path | manifest name/repository, exports/bin, directory leaf | owning section and direct consumers | exact match or stop with named mismatch |

Only an unambiguous target repository and package boundary may receive a
sibling reference; a mismatch must stop or be explicitly routed through the
founder exception below. Reuse the reference's already-tested provider-neutral
source and workflow mechanics by minimal translation when their
responsibilities match; do not create a second production entry point, state
model, receiver, or workflow implementation in the target. Target-specific
channel, repository, schedule, state branch, credential names, and optional
provider resources must still come from the target's own contract and tests.

Freeze the write scope as part of this tuple. Capture the target repository's
initial status and the enclosing repository's target gitlink, `.gitmodules`,
index, and worktree status; separately capture the frozen reference repository
status and HEAD. During the package change, only paths whose resolved Git top
level is the target repository may be edited, staged, committed, or pushed.
Run every Git command with `git -C <target>` and an exact pathspec when one is
needed. A reference-repository change, sibling-repository change, staged parent
gitlink, or `.gitmodules` edit fails the review. A changed *unstaged* parent
gitlink after the target HEAD advances is expected observation, not authority
to integrate it; parent pointer integration requires its own later scope and
verification.

Before translating a sibling implementation, compare the reference and target
by responsibility: package metadata and repository identity; exported and
script entry points; direct import/subprocess consumers; production workflow;
container/build carrier; durable state contract; target schedule; credential
names; and channel/provider selectors. For every reused carrier, state the
target-specific behavior that must survive and name its target-owned test.
Byte similarity or a passing reference test never substitutes for a target
consumer or target test, and no source/reference package metadata, channel
identity, schedule, state branch, credential name, or provider selector may be
copied without target evidence.

## Founder-routed frozen-reference adaptations

A founder-directed production adaptation may use a frozen reference while the
target package still has known structural migration deviations. This is a
narrow delivery exception, not a declaration that the deviation conforms or
that the reference owns the target. Before continuing, record in the delivery
report: the founder direction, frozen reference identity and revision, exact
target package, each observed deviation, and the bounded receiver/schedule,
release, credential, and live-assay work that the direction authorizes.

Only directory/section placement, package naming, or other recorded migration
shape may pass under this route. The review must still establish the target's
actual engineering owner, manifest identity, direct consumers, and public
entry point; ambiguity about any of those remains a stop. The route never
permits a new owner claim, a new consumer, a broader package migration, or
using the frozen reference as evidence that the target's namespace or layout
is canonical.

Security and custody evidence remains a gate. Verify the target's credential
source and least-privilege boundary, public route and receiver identity,
dependency provenance and exact pins, and that tests resolve the intended
public bytes. Never copy reference secrets, deploy its credentials, widen
permissions, or silently substitute its registry, release, or GitHub identity.
If any of that evidence is absent, stale, or belongs to the reference rather
than the target, stop the adaptation regardless of the founder-routed
structural exception.

## Operation

export function review561GroupJavascriptPackage(packageDirectory)

### Parameters

- packageDirectory (string): The package directory to review.

### Returns

object: The package directory, observed deviations (including dependency and
source/test import-boundary escapes), and normalized manifest.

## Canonical operation

Execute this operation from its owning section so Node resolves the declared
dependencies:

```sh
cd lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section
node scripts/review-561-group-javascript-package.mjs PACKAGE_DIRECTORY
```

`PACKAGE_DIRECTORY` is mandatory because custody and namespace cannot be
assayed from `package.json` alone.

## Institutional fabrication boundary

When a proposed package turns an office duty into an agent skill, work lot, or
operation, review the institutional handoff before reviewing its JavaScript
shape. The enterprise/operations owner retains the office identity, authority,
provider-selection rules, allowed effects, and receiver acceptance. The
engineering package owns only a format-independent admission, projection, or
fabrication mechanism. A Codex/Claude runtime-agent TOML is an installed
consumer projection, never the owning implementation.

First identify the active receiver and consumer. Then inspect the existing
artifact/JSNode fabrication family: artifact-specification admission,
language-specific package-specification admission and projection,
`create-jsnode-operation-package-service`, and any existing composition
service. A proposed package must compose those public operations where they
fit; it may add only the missing agency/work-lot vocabulary and projection.
Do not create a package for a speculative second consumer, or duplicate an
existing projector, package writer, staging path, or assay.

Forward-test an agency work-lot fabrication proposal with one table:

| Handoff | Required evidence | Failing result |
| --- | --- | --- |
| office authority -> work-lot candidate | constituted office/enterprise carrier, provider and acceptance boundary | authority or acceptance encoded in an engineering package |
| work-lot -> engineering artifact | active consumer plus the selected existing fabrication public operation | a new package created from a TOML, prose, or unused schema alone |
| artifact -> runtime | generated skill/operation and one named harness/control-plane consumer | runtime-agent TOML presented as the owner or as execution proof |

The test passes only when each owner and arrow is evidenced. If no active
consumer exists, report the missing receiver and stop before creating a package.

## Persistent-journal failure gate: review the whole lawful owner chain

Use this gate when a thin app, CLI, or machine adapter fails while reading a
retained journal, record store, receipt corpus, or other persistent data. The
throwing wrapper is only the observed consumer. Do not patch it, weaken a
generic integrity check, or rewrite retained rows until the review identifies
which package owns the failed invariant and whether the bytes are corrupt at
all.

Freeze the store read-only first. Record its root, every file the failing query
can read, byte digests, row counts, date/feed partition, and worktree status.
Reproduce the failure with the consumer's installed dependency graph without
recording a new event. Never hand-edit, delete, re-identify, append to, or move
the store during diagnosis; a package test that writes only to its own fresh
temporary directory is separate evidence, not a repair of the real store.

Review every package on the actual call path, not merely every package whose
name contains `journal`:

1. **Machine/app adapter:** command and exported function, root/object-kind
   binding, projection or mapping performed after the read, and direct tests.
   It owns a bad root, wrong explicit option, or incorrect post-read mapping;
   it does not own generic content identity or historical schema evolution.
2. **Domain journal:** admitted event/record schema, object kind and its version,
   categories, migrations or multi-version read policy, and the callers that
   record and query it. It owns compatibility between its own historical and
   current record kinds.
3. **Generic semantic-record journal:** identity recomputation, category query,
   relation/charge handling, and refusal semantics. It owns detecting that a
   row does not match the object kind the caller supplied; it must not guess a
   domain's old kind or silently accept mismatched identity.
4. **Witness log and entry packages:** JSONL parsing, append/dedup order, EAVT or
   SEAVT row admission, feed/date addressing, and typed entry identity. They own
   malformed carrier rows and log invariants, not the domain object kind used
   to identify `row.v`.
5. **Addressing/content-identity packages:** token grammar, canonical bytes,
   cryptographic identity, and SRN/RMN addressing. They are candidates only
   when the reproduced mismatch reaches their public operation or independent
   recomputation proves their algorithm disagrees; their presence in a
   transitive dependency graph is not ownership evidence.

For each package, run the canonical review and record directory/section owner,
manifest name and version, exports/bin, relevant tests, and direct consumers.
Then inspect the consumer manifest, lockfile `resolved` URL and integrity, and
the package/version/export path Node actually resolves. Compare those installed
bytes with the reviewed source package. A newer source version beside an
exact-pinned older registry install is two separate facts: tests in the newer
source do not prove the failing consumer has that behavior, and changing only
the wrapper cannot distribute it.

Classify retained rows by recomputing identity read-only under every evidenced
historical and current object kind from the domain package's history or
fixtures. Report counts, never sampled intuition:

- `current identity`: the current domain reader should admit the row;
- `historical identity`: the bytes are internally intact but the domain
  journal needs an explicit compatibility reader or separately authorized
  migration and release;
- `no evidenced identity`: possible corruption or an unidentified producer;
  stop before repair and preserve the exact failing row/path evidence;
- `carrier invalid`: the witness log/entry layer owns the refusal;
- `identity algorithm disagreement`: the content-identity/addressing owner is
  implicated only after the same object kind and value produce different IDs.

Keep namespace custody explicit. Reusable journal, witness, canonicalization,
and addressing mechanics belong to their engineering owner and normally use
`@red-cup-engineering/*`; 561 Group event policy, office meaning, product
projection, and machine binding remain in their 561 Group consumer even when
that consumer's historical manifest still carries a Red Cup scope. Do not move
generic mechanics into `@561-group/*`, and do not put one product's legacy
object-kind table into the generic semantic-record package.

Forward-test in three layers: generic package tests against fresh temporary
stores, domain-journal tests containing a mixed historical/current fixture,
then the exact consumer command against the unchanged real store. A passing
report names the owner/package decision, installed-versus-source resolution,
row classification counts, proposed next action, the evidence that would
disqualify it, and uncertainty. Stop at the domain package when all retained
rows reproduce under evidenced domain object kinds while the generic journal
correctly refuses a wrong kind; stop at the generic/log/addressing layer only
when a focused independent test proves its invariant is broken.

## Operational-use gate: package conformance is not effect authority

Run this gate when the reviewed package contains a deploy, release, publish,
payment, credential, or other operational command and someone intends to use
it now.  The canonical review answers whether the package is correctly owned
and shaped.  It does **not** authorize any invocation of its effect boundary,
prove provider identity, or establish that an already-live artifact came from
the current checkout.

Keep the findings separate in the report:

| Gate | Required read-only evidence | What a pass establishes | What it never establishes |
| --- | --- | --- | --- |
| Package conformance | canonical review, manifest/scripts/exports, direct callers, focused tests | the package is a lawful engineering carrier | permission to invoke its effecting command |
| Local effect readiness | exact executable/version and lockfile provenance; command construction; candidate/binding/target validation | the local carrier will refuse malformed or unpinned inputs as designed | an authority grant, provider authentication, or live deployment |
| Invocation authority | action-specific, unexpired, non-replayed grant/delegation and its trusted verifier; explicit target/candidate binding | this one action may be attempted under the named authority | provider acceptance or public serving |
| Provider and public outcome | provider readback naming deployment/version/route plus independent public probe of the intended artifact | the provider accepted the effect and the named public boundary served it | that a different preview, stale cache, or later deploy has the same bytes |

For an apply-gated static release carrier, inspect the effect boundary before
using it: find the command's `--apply`/equivalent guard, the exact accepted
grant action and expiry checks, replay/one-use record behavior, candidate and
binding digests, provider readback, receipt creation rule, and post-effect
observation.  Confirm that `plan`, `doctor`, `check`, and tests are no-effect
operations.  They may prove readiness, but none may be summarized as a
release, preview, Cloudflare authority, or public publication.

Forward-test without mutation in this order: run the canonical review; run
the package's syntax/focused tests; inspect the no-effect command's reported
disposition; and, only if independently authorized provider reads are already
available, query deployment/version state and probe the public URL.  Do not
create a grant, supply a credential, invoke `--apply`, create a receipt,
deploy, rollback, purge, or use a current login as proof that this session is
authorized.  If an immutable candidate manifest, accepted grant, or provider
receipt is absent, report the corresponding gate as `unobserved` while still
reporting the package-conformance result.  A clean package plus an unobserved
authority gate is a valid stop for operation, not a defect to repair in the
package.

## Extension review: shared deterministic video generation across independent channels

Use this review before replacing NotebookLM, Gemini, or another paid/cloud
generation path in more than one independently owned YouTube-channel
repository. The no-paid-GCP constraint is a deployment and cost constraint;
it does not merge the channels' publication authority or turn a shared Docker
image into a channel owner.

First enumerate every candidate repository independently. For each, establish
its Git top level and origin, manifest and executable entry point, channel ID
and public handle, OAuth client/token source, publication target, schedule,
and durable publication/idempotency state. A common parent directory,
similarly named `src/` module, copied vendor package, or byte-identical
workflow is not evidence of common package custody.

The reusable owner may contain only provider-neutral, deterministic mechanics:
input validation; stable rendering plan construction; local Docker image and
toolchain definition; media assembly; checksum/metadata emission; and
explicit, injectable filesystem/process boundaries. A shared owner must take
all channel facts as validated input and must have no embedded channel ID,
OAuth selector, credential path, playlist, title policy, schedule, public
host, or state-directory default. It must neither call YouTube nor retain a
channel's token or publication receipt. A generator that chooses content,
calls a remote model, or publishes is not provider-neutral and remains in the
channel that owns that authority unless separately reviewed as a real service.

Keep channel-local: source/admission policy, audience and editorial rules,
approved input selection, per-channel OAuth and scopes, YouTube account and
playlist selectors, publication/retry/idempotency rules, schedules, and the
durable receipt that prevents duplicate upload. The channel wrapper is the
only effect boundary allowed to read its secret reference or invoke upload.
It must reject an artifact or receipt whose channel identity, input digest, or
generator version does not match its own contract before publication.

For a local Docker replacement, require a reproducible image/toolchain
definition (pinned base and media tools where the repository supports pins),
an explicit input/output contract, no paid-GCP dependency in the scheduled
path, and an offline focused test. The test must prove identical declared
inputs yield the same render-plan/metadata bytes and that a foreign channel
selector is rejected before any OAuth or upload boundary. If video bytes are
not deterministic because of codecs or timestamps, record the allowed
variance and assert stable input digest, render-plan digest, and provenance
metadata instead; never claim byte determinism without evidence.

Report a matrix with one row per repository plus the shared package/image:
repository origin and revision; owner; generator entry point; OAuth/publication
boundary; state location; artifact location; direct consumers; and the test
that proves channel isolation. Do not migrate a channel until this matrix
shows that sharing mechanics changes neither its credential authority nor its
duplicate-publication protection.

### Offline renderer package gate

For a provider-neutral offline media renderer, additionally review the
package's public contract before implementation. The package may expose pure
plan/provenance construction and an effectful render operation only when the
latter receives an explicit executor. It must not import a product app,
resolve a channel-specific environment variable, fetch remote media/model
content, or include upload/OAuth dependencies. Inspect `exports`, `bin`,
`files`, direct callers, and every `child_process` use to prove those limits.

Require a single contract boundary with: validated explicit asset/input paths;
a canonical, order-stable render plan; a serializable provenance record that
names input digests and declared media-tool identity; and a normalized executor
request/result. Reject ambient time, random IDs, locale-dependent ordering,
implicit cwd lookup, and bare process calls at the planner boundary. An
executor may be a test double or a thin script-owned adapter, but `src/` must
remain testable without ffmpeg installed and scripts must remain thin effect
entry points under the normal import stratification.

Review tests as two independent proofs. First, `node --test` must show same
declared inputs produce identical plan/provenance bytes and reject a foreign
channel/publication selector before executor invocation. Second, an optional
isolated integration test may exercise the local media binary; it may claim
artifact byte determinism only when it compares repeated outputs on the
declared toolchain. If codec/container metadata varies, assert plan and
provenance digests instead and report byte reproducibility as unproven.

Forward-test this gate by reporting the reviewed package tuple, allowed public
exports, executor injection point, forbidden dependency/effect scan, and the
two test classifications. A package containing an upload script, a provider
SDK, or unscoped channel defaults fails the review even if its local render
test passes.

### Vendored renderer admission in an independent channel repository

When an independently owned mathematics-channel repository vendors the shared
renderer rather than consuming a published package, treat the vendor tree as
source under that repository's manifest—not as a second package or a claim
that the renderer owns the channel. Before changing it, compare the target
manifest's `name`, `repository`, `exports`/`bin`, and package-directory leaf
with the actual `mathematics-education-youtube-services-section`; name and
repair any disagreement in the same bounded change. The vendored renderer may
retain its upstream provenance in a source header or ordinary metadata, but
must not supply the target's package identity, scripts, channel selectors, or
production authority.

Treat upstream provenance as a testable byte claim, not a comment. Record the
upstream package name, exact version or immutable revision, admitted source
file list, and a SHA-256 digest for each admitted file (or one canonical
sorted manifest digest). Add a focused test or fixture that verifies the
vendored files still match those recorded digests and that the declared
version/revision is present. If a local patch is intentional, record its
separate patch digest and reason; never relabel modified bytes as an exact
upstream copy. A digest mismatch, an unpinned version, or provenance that only
names a repository without the admitted bytes fails vendor admission before
the renderer is reused.

Assay the complete dependency closure, not only direct imports. Search the
manifest, lockfile, source, scripts, workflows, and vendor tree for NotebookLM,
Gemini, Google generative-AI SDKs, remote-model endpoints, and their package
identifiers. The scheduled production path must contain none of them. If a
removed production dependency remains in `package-lock.json`, refresh the
lockfile through the target's declared install procedure and verify every
resolved URL is the canonical registry `https://registry.561.group/`; a stale lockfile is a
failed removal, not harmless historical evidence.

The target manifest's `test` script must be exactly one standard runner
invocation as defined above, normally `node --test`; remove `verify` when it
only wraps, chains, or duplicates that invocation. If `verify` remains, it
must be a distinct documented contract and must not be required for ordinary
tests. Forward-test by reporting: the corrected target package tuple; vendor
entry points and direct callers; zero forbidden production matches (or their
explicit non-production disposition); the exact lockfile registry result; and
the literal `test`/`verify` script values; and the upstream version/revision,
admitted-file digest witness, and fresh provenance-test result. Then run the
literal test script and report its fresh Node test count. A green command
through a wrapper does not prove this gate.

## Distinguish package identity from a deployed site host

Normally the manifest package leaf must equal the package directory leaf.
There is one structural site exception: a package directly under a `sites/`
directory may be seated at `<leaf>.561.group` while its manifest is named
`@owner/<leaf>`. Apply the exception only when all three parts agree: the
immediate parent segment is exactly `sites`, the suffix is exactly
`.561.group`, and the manifest leaf equals the host prefix. A dotted directory
elsewhere, a different DNS suffix, or a different package leaf remains a
deviation. The site exception never relaxes the custody namespace check.

### Exact founder-routed ecological-channel leaf deviation

For the founder-authorized recovery of the one existing ecological channel,
the directory leaf `public-ecological-youtube-services` is an admitted,
named deviation from the ordinary `*-services-section` service-section leaf.
Treat it as a frozen identity fact for that recovery only: the target must
remain the independent repository rooted at that exact directory, and its
manifest package leaf must remain `public-ecological-youtube-services` under
the existing `@emsenn` namespace. Record the missing `-section` suffix as the
sole admitted shape deviation.

This exception permits a bounded repair inside that repository only after the
review independently proves its current Git top level, origin, manifest,
direct consumers, workflow, and channel/publication boundary. It does not
permit renaming or moving the directory, changing the package namespace or
repository identity, treating the leaf as a precedent, or waiving any other
package, credential, workflow, consumer, or custody mismatch. A different
leaf, an ambiguous repository boundary, or an additional deviation remains a
stop. Forward-test this exception with a read-only tuple check that accepts
only the exact directory/manifest pair above and rejects the otherwise similar
`public-ecological-youtube-services-section` pair as a different target.

## Recognize one standard test-runner invocation

Assay the whole `test` command, not a runner substring. A standard Node test
command may preload one or more runtime loaders before the built-in runner,
using either `node --import LOADER --test ...` or
`node --import=LOADER --test ...`. The preloads are part of that one Node test
invocation; they are not a verification layer.

Reject a `test` command when an arbitrary program or positional script appears
before `--test`, or when shell composition adds another effect such as build,
pack, publish, or a second command. A command merely containing `node --test`
is not evidence of a standard test boundary. Keep the same single-invocation
rule for other recognized runners.

## Separate ownership, dependency direction, and collision safety

A clean ownership review proves only that one package has the right address,
namespace, and manifest shape. Report these three gates independently:

1. **Ownership conformance:** run the canonical review on the provider and the
   consumer. A clean result does not authorize changing their dependency edge.
2. **Dependency direction:** census both packages and their direct consumers.
   Compare exported responsibilities, not filenames. When a healthy lower-level
   provider already owns the generic operation, a consumer or higher-level
   package must compose that public export; it may not remove the dependency and
   copy, narrow, or reinterpret the operation locally. A domain package may add
   policy around the provider, but it must not absorb the provider's generic
   Markdown, filesystem, YAML, or vault responsibility.
3. **Worktree-collision safety:** record staged, unstaged, and untracked paths
   separately for the provider, consumer, manifests, lockfiles, source, tests,
   and fixtures. Diff the index, worktree, and `HEAD` before editing. If another
   change removes the provider, changes the same contract, or rewrites the same
   tests, stop integration and reconcile that intent; package conformance does
   not make overwriting concurrent work safe. Never reset, restore, stage, or
   rewrite someone else's paths to manufacture a clean baseline.

Report one result per gate. `clean ownership / wrong dependency direction /
collision present` is a valid and actionable outcome; do not collapse it into
either “package clean” or “package broken.”

## Prove the dependency bytes the tests actually load

Before relying on a consumer test for an in-repository dependency, inspect its
declared specifier and resolve the exact public subpath from the consumer
directory. Record the resolved export file, package root, version, and install
form: copied `file:`, workspace/link, or registry tarball. Resolve the same
public subpath from a small consumer-side probe; a source-relative import is not
integration evidence.

Treat `node_modules` as generated, read-only evidence. Never patch, copy into,
stage, or commit an installed package. A `file:` dependency is normally a
snapshot copied at install time, so matching versions do not prove matching
bytes. Hash the resolved public-export bytes and the provider source export,
then refresh the consumer install through its declared lockfile/local-registry
procedure when they differ. Re-resolve and re-hash after refresh. If refreshing
would clobber unrelated manifest, lockfile, or installed-tree work, stop and
report the collision rather than editing the installed copy.

Run the provider's focused test at its source boundary, then run a consumer
test that exercises the required behavior through the refreshed public import.
Capture both commands and the resolution/hash witness. A green suite against a
stale copied dependency proves only the stale copy; report the integration as
unverified until the declared dependency supplies the current bytes.

### Gate cross-package generic/domain composition

When a reviewed package will consume an existing package across an
infrastructure/domain boundary, extend the review to the provider package and
report one exact edge rather than merely declaring both packages conformant.

1. Run the canonical package review on both directories. Record each manifest
   name/version, owner namespace, public `exports`/`bin`, and package leaf.
2. Name the provider's generic responsibility and the consumer's domain policy
   separately. Generic Markdown, YAML, filesystem, or vault behavior stays in
   the provider; term/glossary admission stays in the domain consumer. Reject
   a provider import of the domain package, a provider-owned fixed domain-key
   list, or a consumer-side copy of the generic algorithm.
3. Verify the consumer declares the exact provider package and version form.
   For a registry dependency, query `https://registry.561.group/` for that exact
   version and check the lockfile resolved URL and integrity. `file:`,
   workspace, and link forms fail new-edge admission; do not present them as
   registry proof.
4. From the consumer directory, resolve the exact public package subpath the
   code will import. Record the resolved file, package root and version, then
   compare its bytes with the reviewed provider export. A source-relative
   import, unresolved export, stale copied `file:` install, or package-name-only
   resolution fails the edge.
5. Require a provider test at the source boundary and a consumer test or probe
   that exercises the operation through the public import. Report their fresh
   counts/results separately.

Forward-test this gate read-only before editing either package. A passing
result names both package tuples, the public subpath, exact dependency and
registry/install provenance, resolved bytes, tests, and the generic/domain
policy split. If any item is absent, stop the integration or name the exact
manifest/export/install repair required; do not bridge the gap by copying code
or reaching into provider source.

### Gate a generic -> specialized -> existing-consumer extraction

Use this gate when one package currently mixes a reusable rule with a
carrier-specific rule and the change will create two nested topic packages:
one generic capability owner, one specialized owner that depends on it, and an
existing package that will consume the specialized public operation. Reviewing
only the existing package, or treating the two proposed directories as one
provider, is insufficient.

Freeze three distinct package tuples before writing: proposed generic
provider, proposed specialized provider, and existing consumer. For each tuple
record the exact requested path, nearest existing owning-section manifest,
proposed or current manifest name/version, directory leaf, public export, and
direct consumers. Validate the path itself against the section shape. Every
child capability must occupy `<parent>/services/<child-*-services-section>`;
an extra anonymous directory, a repeated `services/services` edge, or a parent
without an owning manifest is a stop unless that intermediate directory is an
actual reviewed service section with its own matching manifest. Do not silently
normalize a founder-supplied path, and do not create a placeholder package to
make an invalid tuple appear reviewable. Report the exact malformed segment and
the nearest conforming parent for routing.

An absent proposed package cannot pass the canonical operation yet. Assay its
proposed tuple read-only against the parent manifest and two closest sibling
packages, then label the result `provisional creation boundary`, never `clean`.
After fabrication, run the canonical operation independently on both new
packages and the existing consumer. The later review must prove each manifest,
leaf, namespace, `exports`/`bin`, scripts, tests, and owner; passing the parent
or sibling does not confer conformance on the child.

Define the responsibility cut before moving code. The generic owner keeps the
subject-independent meaning, normalization, and common assay. The specialized
owner keeps only the consumer-specific recognition or activation policy and
must call the generic public export. The existing consumer keeps projection,
serialization, or installation behavior and must call the specialized public
export. For agent-skill descriptions specifically, the reusable description
contract belongs below the skill contract; request-recognition, discovery, and
activation wording belongs in the specialized skill-description package; and
`SKILL.md` YAML/Markdown rendering remains in the skill projector. Reject any
of these shapes:

- the generic package imports the skill package or knows skill-only fields;
- the specialized package copies or reinterprets the generic assay;
- the projector retains a second description-quality implementation;
- frontmatter quoting, linefeed normalization, or file projection is moved
  into either description-quality owner merely because it handles the same
  field; or
- the old package is deleted before every unique behavior and direct consumer
  has an explicit destination and regression test.

Record the dependency graph as exact public imports:
`generic <- specialized <- existing consumer`. Each arrow must name the
export subpath, exact dependency version, lockfile provenance, resolved package
root/version, and resolved-byte hash. If either new provider is not yet
published, test it at its own source boundary but leave the downstream edge
unadmitted; publish through the separate publish gate, then install the exact
registry version and repeat resolution. Never bridge an unpublished stage with
a source-relative import, `file:` snapshot, patched `node_modules`, or a
temporary copied implementation.

Before deleting or thinning the existing implementation, inventory its
exports, internal helpers, tests, fixtures, README contract, package dependents,
and source/import callers. Classify every item as generic provider,
specialized provider, retained consumer projection, generated/legacy residue,
or unresolved. Move the behavior in dependency order, preserving a provider
test for the generic rule, positive and neighboring-negative recognition tests
for the specialization, and a consumer integration test through the installed
specialized public import. An unresolved behavior or caller stops deletion but
does not justify duplicating it in both new packages.

Forward-test this gate on the proposed paths before implementation. The report
passes only when it names all three tuples, catches any repeated or ownerless
path segment, marks absent packages provisional, states the three-way
responsibility cut, produces an acyclic dependency graph, inventories the old
implementation and consumers, and gives the ordered create/test/publish/install/
migrate/review sequence. After implementation, replace provisional results
with three canonical review results plus fresh generic, specialized, and
consumer test evidence. Package conformance and publication remain separate
gates; this review never authorizes a release.

### Gate an independent channel onto the canonical video-rendering public import

Use this gate when an independently owned YouTube production package replaces
a local, vendored, or paid-generation renderer with the canonical
`@red-cup-engineering/video-rendering-services-section` package. The migration
changes an implementation dependency only: it does not change the channel
repository's Git identity, directory, publication authority, or contract.

1. Review the channel package and the renderer package as separate repository
   tuples. For the channel, prove its current Git top level, HEAD, normalized
   origin, manifest name and `repository`, directory leaf, direct production
   entry point, and channel-owned publication boundary. A package-directory or
   manifest-name mismatch is a structural deviation. Repair only the manifest
   identity/directory conformance that the founder has routed; do not rename,
   move, reinitialize, or repoint the channel repository to make the tuple
   look clean.
2. Confirm from the renderer manifest and registry tarball that
   `@red-cup-engineering/video-rendering-services-section` is the canonical
   provider, the exact version is available through `https://registry.561.group/`, and the
   intended public export subpath is declared in `exports`. Consumer source
   may import only that public subpath. Reject source-relative renderer
   imports, deep unexported paths, copied implementation, and a package name
   inferred from a directory.
3. Preserve the channel's verification layer as a distinct layer in the test
   boundary. If its package shape intentionally keeps verification fixtures,
   probes, or an adapter outside the ordinary provider `src/`/`scripts` shape,
   record the exact layer, its caller, and its target-owned test as a routed
   verification-layer deviation. That exception permits no production effect,
   channel selector, credential read, upload call, or duplicate renderer
   implementation there. Do not erase a healthy verification layer merely to
   imitate the provider's layout.
4. Before editing, prove the consumer install will load the intended public
   bytes: inspect the dependency specifier and lockfile, resolve the public
   subpath from the channel directory, and record the resolved file, package
   root, version, integrity, and SHA-256. For a stale `file:`/copied install,
   refresh by the package's declared local-registry procedure; never patch
   `node_modules`. After refresh, repeat resolution and hashing.
5. Forward-test the proposed edge with a channel-owned test that imports the
   public renderer contract through the package name and exercises the
   verification layer, plus the renderer's focused source test. Report fresh
   `node --test` counts separately. The channel proof must reject one foreign
   channel/publication selector before any executor, OAuth, or upload boundary.
   A passing provider-only suite, a package-name-only resolution, or a test
   that imports renderer source directly does not admit the migration.

Report the two repository tuples, the exact public import, the exact pinned
dependency and registry/lockfile witness, resolved byte hash, the named
verification-layer deviation and its bounded disposition, and the separate
provider and consumer test counts. Stop if repository identity/path is the
suggested repair: that is outside this dependency migration and requires its
own founder-directed repository move.

## Historical app material entering an existing engineering package

Apply this narrow, read-only assay before treating a legacy `apps/`,
`domains/`, or similarly named directory as an app that belongs in an existing
engineering package. A historical directory name is not package identity, and
plain Markdown material is not a JavaScript package merely because it is
stored beneath a software-looking path.

1. Classify the candidate and destination independently before invoking this
   JavaScript-only operation. Review a containing package only when the
   destination already has a `package.json`, a resolvable manifest identity,
   and an owning service section. If the destination is an application
   directory inside that reviewed package, record the app's public entry point
   rather than inventing a second package review. A legacy source fragment,
   mixed-language app, or directory with no manifest does not acquire a
   JavaScript package identity by being proposed beneath `apps/`; route its
   language-specific review to its actual owner instead.
2. Inventory the historical directory without changing it. Record its file
   classes, any `package.json` or lockfile, executable entry points, imports,
   tests, generated outputs, and references from outside the directory. Treat
   an archive copy, a generated projection, and a source app as three distinct
   dispositions until their provenance is known.
3. Search for fuller versions by manifest name, public entry-point name,
   distinctive exported symbols, and content digest—not by directory name
   alone. Compare candidates' source trees, manifests, exports, tests, and
   consumers. Move or merge only the smallest source set whose behavior is
   evidenced; retain an archival corpus when it is not equivalent to the live
   app, and do not replace a fuller current app with an older snapshot.
4. Locate the destination package's `files`, `exports`, `bin`, build scripts,
   generated directories, and direct consumers. A legacy generated output may
   be admitted only when its generator and receiver are identified; otherwise
   it remains historical evidence rather than package source. Do not move
   `node_modules`, caches, or copied build output into a package.
5. If the candidate contains only Markdown, term definitions, or notes, this
   package review is inapplicable. Route it through the Markdown carrier and
   term-admission procedure, preserving its provenance and checking links.
   If it contains executable material but has no JavaScript manifest (for
   example Python, shell, Guile, or an unclassified source fragment), report
   its runtime and entry point, then stop this operation and use the relevant
   language/service review. Do not manufacture a `package.json`, Node test,
   or JavaScript package structure merely to justify a relocation.

Report the reviewed destination package (or explicitly why none applied), the
historical candidate's actual language/runtime identity, any fuller candidate
and equivalence finding, external consumers, generated-output disposition, and
the next owning review when JavaScript review was inapplicable. An unknown
answer to any executable or generated-output question is a stop for the app
relocation, not a reason to classify the archive as harmless.

## Extension review: a dependency-free Cloud Run reconciliation CLI

When the proposed change is a new or extended Cloud Run reconciliation CLI in
an existing channel package, run the canonical operation first. Its
deviations are gates, not advisory output: resolve or explicitly route each
one before changing the package. Do not add a deployment CLI to a package that
the review cannot identify as its real owner.

After a clean ownership review, record these read-only findings before
implementation:

1. Read the root manifest's `exports`, `bin`, `scripts`, `files`, and runtime
   dependencies. A reconciliation command is an effect boundary, so it needs a
   thin `scripts/<verb>-<noun>.mjs` entry point; it must not be added as an
   `app`, and it must be published or deliberately kept private according to
   the package's existing `files` and `bin` contract.
2. Locate all existing Cloud Run, Cloud Build, deployment-lane, and channel
   runtime modules and their tests. Follow imports outward from them, then
   search the package's callers and package scripts. Reuse the existing lane
   manifest/contract and command construction rather than creating a second
   declaration of desired deployment state.
3. Confirm dependency-free means Node built-ins plus existing package source
   only. Do not introduce a new npm dependency, unpinned range, or lockfile
   churn merely to invoke `gcloud`; inject or wrap process execution through
   the package's established boundary so tests can observe commands without
   contacting Cloud Run.
4. Check import stratification: `src/` supplies reconciliation and command
   formation; one `scripts/` command parses arguments and performs the effect;
   `apps/`, if present, only composes downward. Tests use `node --test` and
   must cover an idempotent no-change result, a required update, and a command
   failure without making live cloud writes.

Use this focused discovery sequence, replacing the placeholder with the
already-reviewed absolute package path:

```sh
PACKAGE_DIRECTORY=/absolute/path/to/package
find "$PACKAGE_DIRECTORY" -maxdepth 3 -type f \
  \( -path '*/src/*' -o -path '*/scripts/*' -o -path '*/test/*' \) -print \
  | rg 'cloud-run|cloud-build|lane|deploy|reconcil|runtime'
rg -n --glob '!node_modules/**' --glob '!package-lock.json' \
  'cloud-run|cloud-build|gcloud|lane|reconcil' "$PACKAGE_DIRECTORY"
```

Invoke the canonical operation above from its owning JavaScript-services
section; do not guess a relative owner path or silently use an unrelated
dependency tree. The commands in this section are discovery only. Report the
exact review deviations, existing effect boundary, consumer locations, and
the test command selected before writing product code.

## Extension review: contract-v2 receiver with a GitHub schedule

For a founder-routed YouTube production adaptation that adds or changes a
dependency-free Cloud Run receiver and its GitHub scheduled carrier, this
review is complete only after the following target-owned contract assay. The
frozen reference may suggest mechanics, but cannot establish the receiver,
schedule, repository, account, or credential identity.

1. Locate the target's contract-v2 definition and every parser, producer,
   receiver, test fixture, workflow, and direct caller of it. Record its
   version marker, required and rejected fields, validation point, response
   shape, idempotency/replay rule, and the public import or HTTP entry point.
   Do not let a v1 default, compatibility branch, or unversioned payload
   silently reach production; if compatibility is explicitly required, make
   its accepted versions and retirement boundary visible in the contract and
   tests.
2. Identify the one target receiver: Cloud Run service or job name, project,
   region, runtime identity, ingress/IAM boundary, revision/image provenance,
   and traffic allocation. Inspect read-only provider queries and target
   deployment configuration for each fact. A route copied from the reference,
   a successful build, or a deployment-command exit does not establish this
   identity.
3. Treat the GitHub workflow as the primary production carrier and Cloud Run
   as a separate, optional manual backend unless the founder has directed a
   different carrier ordering. Inspect the exact `schedule`,
   `workflow_dispatch` inputs, branch/ref restriction, event and job
   permissions, action revision pins, concurrency behavior,
   environment/protected-deployment gate, credential source, and every
   backend invocation. The scheduled event must run the target-owned
   production entry point without requiring Cloud Run; ordinary `push`, pull
   request, and reusable-call paths run verification only and must not obtain
   cloud identity, submit a build, reconcile a service, or invoke a receiver.
   A Cloud Run action is admissible only behind an explicit manual-dispatch
   input whose default is false, with a ref restriction and a job-level guard
   that tests that input. GitHub cron is an at-least-once, delay-prone trigger:
   the production entry point must make duplicate delivery safe and must not
   infer timing, channel, project, region, or authority from ambient workflow
   values.
4. A dependency-free adaptation may use Node built-ins and existing target
   source, but no new npm package, action, broad token, secret-loader, or
   unpinned runtime range merely to call the receiver. Keep credential values
   out of committed configuration, fixtures, logs, command lines, and error
   messages. Bind the target's approved workload or runtime identity to one
   target receiver; reject sibling repository, channel, account, region, and
   visibility selectors before any provider command is formed.
5. Check both carrier families before implementation: `src/` owns contract-v2
   normalization, validation, receiver request formation, and testable
   reconciliation; one thin `scripts/` entry point performs a local effect;
   `.github/workflows/` schedules the primary entry point and may manually
   dispatch the optional backend, but never contains a second implementation
   of contract logic. Verify independently that the schedule does not reach
   the optional backend and that every push/test path is backend-free. The
   workflow must not import an `app`; any `apps/` layer only composes downward.

Forward-test the proposed change locally with contract-v2 valid input, missing
or unknown field rejection, an explicit v1/unversioned rejection (unless an
approved compatibility test says otherwise), idempotent duplicate scheduling,
and a receiver/provider failure that reveals no credential material. Parse the
workflow or inspect its guarded job text to prove: its scheduled path reaches
the primary production entry point; its push/test path has no Cloud Run,
Cloud Build, or workload-identity action; and an optional backend can run only
from a false-by-default manual input on the protected ref. Also prove one
sibling channel/project/region selector is rejected before an effect. Report
the local test count separately from any read-only Cloud Run assay. Do not
claim a live schedule or receiver result until the deployed revision, traffic,
access boundary, and an authenticated target-owned request have each been
independently observed.

## Extension review: public legal page served by a JavaScript site

Apply this assay when a public legal carrier (for example terms, privacy,
accessibility, cookies, or an acceptable-use page) is proposed for a site that
is served from a JavaScript package. It reviews the package that actually
serves the page, not a nearby content directory or a deployment repository
that happens to mention its host.

1. Establish applicability before treating the page as JavaScript work. Locate
   the public site's receiver and its containing package, then run the
   canonical package review on that package. Record its manifest, owner,
   public host, and the framework or server that receives the request. If the
   serving owner is not a JavaScript package, or the page is served by a
   distinct non-JavaScript owner, say this review is inapplicable, name that
   owner and route, and use its language/site review instead. Do not invent a
   `package.json` or claim a Markdown source is served by Node merely because
   it is stored under a site tree.
2. Trace the exact public route from request to output. Inspect the framework
   route declaration, exported handler, static-file mapping, redirect, or
   equivalent build configuration and identify the requested legal path and
   any canonical/alias path. Then follow that route to the source carrier:
   template/component, Markdown/MDX/document import, generated data, or
   static asset. Record the inclusion edge that makes the legal text part of
   the route. A source file that is unimported, outside the configured content
   glob, or shadowed by another route is not page evidence.
3. Inspect the package's declared build and static-generation path. Record the
   exact build command, build output directory, framework adapter/export mode,
   and the generated artifact or route manifest expected to contain the page.
   For a statically generated page, prove from a fresh local build that the
   requested output file (or generation manifest) is present and that its
   rendered bytes include the intended legal content. For a server-rendered
   page, use the package's local server or route test to prove the response
   through its exported/build route. Never treat a source import, a successful
   type check, or an old `dist` directory as static-generation proof.
4. Identify and run the package's declared focused test command, including any
   route, rendering, or build assertion that can observe the legal page. If no
   test reaches the route, record that limitation and at least perform the
   package's declared build plus a local route/output assay; do not label that
   weaker evidence a full route test. Keep test failures, a failed build, and
   an absent generated page as separate findings.
5. Trace the deploy carrier that publishes these exact bytes: the package's
   deployment workflow, hosting configuration, container/static-upload step,
   artifact handoff, and target host/path. Confirm that its configured build
   context and output directory are the reviewed package and generated output,
   rather than a sibling site or stale artifact. A deploy-carrier review is
   not permission to deploy and does not establish that the carrier has run.

Report local evidence separately from deployed evidence. A local build, route
test, generated file, or carrier configuration proves only the reviewed source
and local artifact path. Live/public proof requires an independent request to
the deployed canonical URL, observing the expected status, content, and any
redirect/canonical behavior after the relevant deployment revision is serving
traffic. If deployment access, revision identity, or public response is not
observed, report live status as unverified; never infer it from a green local
build or a workflow definition.

## Extension review: harness policy and projector semantics

Use this gate before changing a JavaScript harness projector, its policy
contract, or the generated instructions it controls. First locate the
canonical package from present evidence. Search current manifests for the
projector's advertised script and exported entry point, then follow the
resolved script/import to its owning `package.json`; do not treat an older
harness record, generated `AGENTS.md`, installed skill copy, or legacy
projector as package custody. Run the canonical review on every package whose
JavaScript will change. For Bare Cedar Fog Codex, distinguish the
machine-specific harness package and projector from the generic Codex harness
projection service; if the change crosses both package boundaries, review both
and name the public import which joins them.

A policy-field name is part of the behavioral contract. Trace the exact field
through all authored and generated consumers before deciding it is merely
configuration:

`authored policy field -> policy loader/assertion -> projector argument and
rendering branch -> generated root instruction/runtime skill -> delegated
instruction inheritance -> observed agent behavior`

For the field under review, record its declared name, actual value type,
validation and error text, every direct reader, tests/fixtures, generated
targets, refresh/check commands, and runtime consumer. Then compare its name
and documented scope with what the projector actually makes agents do. A name
such as `turnBootstrapSkill` is defective when the intended contract is one
receiver-owned bootstrap for a whole delegated program but its projected
wording makes every child interpret each inherited turn as a new bootstrap.
Passing JSON validation or producing stable bytes does not make that semantic
misrepresentation conformant.

Preserve generated-source custody. Identify the authored policy, shared skill
source, machine-specific projector, generic projector when used, focused tests,
and every managed target. Change the owning policy/projector/skill source and
regenerate; never hand-edit `AGENTS.md`, `.agents/skills/`, `.codex/agents/`,
or another managed projection. Compare source and generated diffs separately,
and verify the generated skill bytes against their authored digest.

For an internal early-alpha field with no external or retained-state contract,
perform one clean migration. Rename the key to its truthful semantics (for
example, `receiverBootstrapSkill` when the receiver owns the one bootstrap),
update every active policy, reader, assertion, error, test, fixture, and
generated projection in the same bounded change, and require zero active
contract references to the removed key afterward. Do not add a dual-read
fallback, alias, deprecated key, compatibility shim, version bridge, or
permanent migration record. Migrate any current authored value that the new
field needs, regenerate disposable projections, and delete the misleading
key. Only an
evidenced external or retained-data consumer can justify a compatibility
boundary; current consumer absence neither deletes the capability nor turns a
misnamed alpha field into a permanent interface.

Forward-test a proposed `turnBootstrapSkill` -> receiver/root-scoped rename
before implementation:

1. review the Bare Cedar Fog Codex harness package tuple and, if changed, the
   generic projector package tuple; name their manifest identities, exports,
   scripts, direct consumers, and focused tests;
2. show from the bootstrap skill and dispatch contract that one executive/root
   receiver owns the bootstrap completion, then quote the old field or rendered
   instruction which can make a delegated child bootstrap recursively;
3. choose one truthful replacement key, enumerate every active old-key reader,
   test, fixture, error, policy, and generated target, and give each the same
   flag-day migration disposition;
4. prove the old key has zero active policy, projector, test, fixture, or
   generated-target references after the change, regenerate only through the
   owning projector, and run its static projection check;
5. run the generic projector tests when its contract changed, then the focused
   and full machine-harness tests; report each package's evidence separately;
6. inspect the regenerated root instruction and runtime skill digest, and
   forward-test root + three planned investigators under four slots: root runs
   one batched provider, A and B inherit the accepted digest completion, C is
   queued, and no child commissions an improver; and
7. confirm the change reached its consumers by moving the shared logic
   upstream rather than by mirroring it into the sibling Claude harness
   (owner-ruled 2026-09-06: no parity-chasing between Claude and Codex) —
   the review fails if either harness still projects the removed
   per-turn/per-child semantics from its own separately authored copy.

The review fails if it treats a passing projection check as semantic evidence,
edits a managed target, retains the old alpha key as fallback, skips a direct
reader/test, claims A/B/C ran in parallel under the four-slot cap, or changes a
second JavaScript package without reviewing its boundary.

## Extension review: channel-local OAuth authority validator CLI

Use this gate before adding one OAuth authority-validation command to an
independently owned YouTube channel package. Run the canonical package review
first. The command checks that the package's existing refresh credential can
currently obtain an in-memory access token and that `channels.list(mine=true)`
resolves the package's configured channel. It is neither OAuth setup nor a
publication path: it must not widen, rotate, persist, revoke, upload, or
disclose credentials.

1. Prove the target is exactly one channel package: record its manifest name,
   package-directory leaf, repository identity, public `bin`/`scripts` names,
   configured expected channel-ID source, and existing scheduled production
   entry point. The proposed command is channel-local, named consistently with
   that package's script/CLI convention, and has one thin `scripts/` entry
   point over a testable `src/` operation. It may not accept another channel,
   repository, account, playlist, credential path, or arbitrary OAuth client
   selector. A manifest `files` list that deliberately omits `scripts/` is
   compatible with an internal repository CLI; do not add a public `bin` or
   widen package publication merely to expose this diagnostic.
2. Inventory only local variable *names* and their tracked source locations.
   Read manifests, declared configuration, source, tests, and workflows for
   client ID, client secret, refresh token, expected channel ID, and requested
   scopes. Never read `.env`, token files, environment values, GitHub secret
   values, authorization URLs, or command output that could contain them.
   The command prints an opaque outcome only: for example `authorized`,
   `missing-local-variable`, `token-rejected`, `channel-mismatch`,
   `scope-contract-mismatch`, or `provider-unavailable`. It never prints a
   value, token prefix, authorization code, bearer header, response body,
   credential path, or full provider error.
   Establish the OAuth-client tuple separately from the refresh credential:
   fixed Google token endpoint, fixed YouTube Data API endpoint, client-ID
   variable name, client-secret variable name if the existing client type
   requires one, refresh-token variable name, and the target's declared
   client type/application registration. The CLI may select none of those at
   runtime. Reject a missing tuple, a client type the tracked target contract
   does not admit, or a configurable endpoint, redirect, or audience before
   request construction. This validates an already inducted client; it never
   registers or re-consents one.
3. Keep validation mechanics and effects separated. `src/` owns a function
   that receives a deliberately constructed environment object explicitly and
   validates the fixed configuration-name set, one fixed expected channel ID,
   and one fixed declared scope set from the target contract. The script must
   project only those named keys into a fresh object; it must never pass
   `process.env`, a spread of it, or a generic configuration object through to
   the validator. The validator must not search parent directories, walk
   upward for `.env` files, merge inherited configuration, inspect arbitrary
   credential locators, or accept caller-selected identifiers/scopes. It posts the existing refresh-token
   grant through an injected `fetch`/HTTP boundary,
   then passes the returned access token only to the injected authenticated
   `channels.list(mine=true)` probe. The access token is ephemeral: do not log
   it, return it, write it, or cache it. Exchanging the existing refresh token
   for that in-memory access token is allowed validation; requesting a new
   refresh token, changing scopes, invoking browser/device consent,
   revoking/rotating tokens, or persisting anything is not. Reject malformed
   or foreign expected-channel selectors before any HTTP request. Reuse an
   existing exact-channel comparison only when its import has no credential
   write or loopback/consent side effect; otherwise extract the small pure
   comparison into the target package instead of importing an OAuth-admission
   program.
4. Treat scopes precisely. The reviewed package's tracked declared scope
   contract is the basis for static validation. A refresh-token response may
   omit `scope`, so absence there is not a scope success or failure. If a
   provider response explicitly reports insufficient scope, classify that
   opaque failure; do not call token-info, consent, or another endpoint merely
   to infer it unless that read-only probe is already part of the target's
   contract and has an injected test boundary.
   The authenticated `channels.list(mine=true)` response is the identity
   proof: accept exactly one returned channel ID equal to the expected ID and
   classify zero, multiple, malformed, or nonmatching IDs as opaque identity
   failure. A successful identity response demonstrates only the permission
   used by that probe, not every hypothetical upload permission. Keep the
   declared scope contract and observed probe result as separate report fields.
5. The CLI owns only local configuration loading and exit mapping. It may load
   the package's established ignored environment mechanism at its one fixed,
   package-local locator, project the exact local variable names into the
   explicit environment object, call the `src/` validator once, and emit one
   redacted line with a nonzero exit for every non-authorized outcome. It must
   not make validation an import-time side effect, append to `.env`, read an
   arbitrary file path, discover a parent/ancestor `.env`, or make a scheduled
   production workflow depend on the diagnostic. Keep direct provider HTTP, request construction, and response
   parsing out of the script so tests can prove them without real OAuth.
6. Review GitHub only as a product-local name mapping. Inspect workflow YAML
   and repository configuration names to identify which target-owned workflow
   references which secret names and which scheduled/manual job consumes them.
   Report `mapped`, `missing`, or `unknown` by name only. The validator neither
   calls GitHub nor receives a GitHub-secret selector; it never writes or
   reveals a secret. Human consent, account/channel selection, and secret
   induction remain separately authorized Leader actions.

Forward-test the changed procedure without credentials or network. The
read-only structural assay reads only `package.json`, tracked source/tests,
and workflow text. The focused Node tests inject an explicit environment
object, a successful token response, and an exact channel response; a rejected
token response; a wrong channel; a
malformed/foreign expected selector rejected before `fetch`; an explicit
insufficient-scope response; and CLI redaction/nonzero-exit behavior. Assert
the token request uses `grant_type=refresh_token` but that no test output,
return value, fixture, or error carries token bytes. Report one row for the
exact independent channel root with package tuple, internal CLI name, expected
channel source, fixed endpoint pair, OAuth-client tuple, local variable names,
declared scope contract, observed-probe classification, scheduled carrier, and
test count. Include a proof that the validator receives only the fixed named
key projection (and cannot observe a sentinel inherited variable), an ancestor
`.env`/inherited-variable non-discovery proof,
a malformed client tuple rejected before `fetch`, a zero-
or-multiple-channel response, and an endpoint-injection attempt rejected
before request construction. A green injected test proves only local authority
logic; actual OAuth authority remains unverified until the Leader separately
runs the target-local command with its existing credentials and observes its
opaque result.

## No hardcoded wallet addresses or character names (owner-ruled 2026-09-01)

App and script code never embeds wallet addresses, wallet/character names, or
per-wallet dispositions as source constants. Rosters live in data — the
canonical EVM register is agrodao's
`content/observations/public-accounts/evm-wallet-fleet.json` — and code loads
them (with an env-var path override) at run time. A constant like
`YANAGI: { address: "0x..." }` in source is a defect to fix, not a
convention to copy; the live example of the correct shape is
`treasury-observation-service/scripts/observe-treasury-reward-and-vault-positions.mjs`.
