---
title: "Agency receiving reads the changed records and keeps its state in the section: requirements, specification and design"
description: "Why each push to emsenn/bare-cedar-fog main made Bare Cedar Fog write a whole checkout of the superrepo, with its submodules, under ~/.local/state, and raised disk pressure to 84-88% for five minutes: the producing code, the repair that already exists on main and what it leaves undone, and the EARS requirements, specification and design for a receive that reads only the changed agency records and holds every worktree and lease inside /home/emsenn/info."
date-created: 2026-10-09
type: specification
status: proposed; not implemented; returned as three cloud slices; needs independent receiving (the Senior Engineer does not receive its own outcome)
owner: agent-harness-computer-system-engineering-services-section
keywords:
  - agency-receive
  - receiving
  - worktree
  - source-closure
  - records-snapshot
  - provider-capacity
  - disk-pressure
  - section-state
provenance:
  authors:
    - bare-cedar-fog-claude (Hai Jian), office senior-engineer, incumbency bare-cedar-fog-claude-as-senior-engineer
    - claude-sonnet-5-5 (the carrying model)
  received-under: engineering-services-section/lib/agency/skills/realize-research-grounded-engineering-work/SKILL.md
  duty: engineering-services-section/lib/agency/duties/realizing-allocated-engineering-work.json
  dispatched-by: the Leader's standing direction of 2026-10-09, through Bare Cedar Fog's Claude character
  sibling: computer-systems-engineering-services-section/content/text/documents/articles/notes/2026/10/09/2026-10-09-spec-rpc-witness-volume-and-node-heap.md (its addendum, "a second disk load, seen 15:44-15:50Z", is the symptom this note explains)
---

# Agency receiving reads the changed records and keeps its state in the section

Paths are relative to `/home/emsenn/info/lib/emsenn/services/561-group/services/` unless they start with `/`.
Three prefixes are abbreviated:

- `HARNESS` is `engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/agent-computer-system-engineering-services-section/services/agent-harness-computer-system-engineering-services-section`.
- `ENGINE` is `engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-code-development-system-services-section/apps/computer-code-development-engine`.
- `HOST` is `engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/agent-computer-system-engineering-services-section/services/multi-agent-computer-system-engineering-services-section/services/multi-agent-computer-platform-engineering-services-section/apps/feltos-enterprise-host`.

`STORE` is `/gnu/store/gdbrmhcrl3pfnngmcbmp4fii2gp57pcr-bare-cedar-fog-deployment-1/app`, the build the running unit
executes. `GH-CSS` is `red-cup-engineering/computer-services-section` on `main` (1fbe062fe, 2026-10-09T15:52Z).
`GH-CCDE` is `red-cup-engineering/computer-code-development-engine` on `main` (9a0363f08, 2026-10-09T02:11Z).

## 1. The theory this note applies

These statements are held by the house; each cites where.

1. A carrier session never works in the repository's shared checkout. Each act works in a Git worktree opened for
   that one task alone (`HARNESS/src/carrier/workspace.mjs:1-18`), and a working directory inside a primary
   checkout is refused by every argument or unit builder (`workspace.mjs:63-68`).
2. Receiving is an independent receiver's direct act on an immutable proposal, read-only, returning a typed
   judgement the host admits (`HARNESS/src/carrier/agency-carrier.mjs:1-22`). It inspects "only evidence necessary
   for the stated receiving condition" by "bounded repository reads or an exact native subject"
   (`agency-carrier.mjs:323`, the receiving mission text). Evidence that cannot be read is `unverified`, which is
   unknown and never a rejection (`agency-carrier.mjs:52-56`).
3. A receiver reads the produced commit from the original copy, never latest and never the input. "Missing or
   unresolvable results refuse rather than falling back to the input commit or latest source." Source-result
   receiving "performs no fetch, source acquisition, commit or publication"
   (`GH-CCDE/specifications/source-closure.md`, section "Receiving boundary and operating composition").
4. Group code, data, records and research on Bare Cedar Fog live inside `/home/emsenn/info` at the owning section's
   path; what a session leaves in the home directory, `~/.config`, `~/.local`, `~/src`, a scratch directory or
   `/tmp` moves into the section before its work ends (rule `group-material-on-bare-cedar-fog-lives-under-info`).
   The Leader's words, 2026-10-08: "i want no ~/*/561-group no ~/.local/561-group/ no ~/.config/561-group/"
   (`561-group-services-section/content/text/documents/articles/notes/2026/10/09/2026-10-09-note-on-the-leaders-repeated-corrections.md`,
   table row for that rule).
5. A node's per-task durable state lives in the carrier node's root, inside the house:
   `<dataRoot>/data/state/<dialect.tasks>/<id>/` (`HARNESS/src/carrier/session.mjs:6-7`; the dispatched Codex task
   records are already ignored there, `.gitignore` entry for `data/state/codex-tasks`). A task's checkout and a
   provider's lease belong in the same root; today they do not (section 2).
6. A defect is repaired in the owning software, after finding whether a pull request, branch or landed change
   already repairs it, and derived from the theory that governs the capability, not from the symptom (rules
   `errors-are-repaired-in-the-owning-software`, `find-the-existing-repair-before-patching`). Engineering derives a
   generic tool; a section's data is not carried in it (rule `science-engineering-operations-parameterize-in-order`).

## 2. What the running node does, and why it writes a checkout

The running unit is `bare-cedar-fog-561-group.service`; its environment sets `METROPLAT_REPOSITORY_ROOT=/home/emsenn/info`
and no worktree or capacity root (`561-group-services-section/services/561-group-operations-services-section/deployments/bare-cedar-fog-host/deploy/service.json:27-30`,
`deploy/bare-cedar-fog-561-group.service:24`). The producing chain, in call order:

| Step | Code (house copy, line numbers; see the note below the table for `STORE`) | Effect |
|---|---|---|
| Host builds the Codex carrier with `cwd` = `METROPLAT_CODEX_WORKSPACE ?? METROPLAT_REPOSITORY_ROOT` | `HOST/src/agency-work.mjs:163-172` | the receiving act borrows objects from `/home/emsenn/info` |
| Carrier names a receive `agency-receive-<sha256(receipt, workerId, office)[0:32]>` plus `-<n>` for retry n (up to 4) | `HARNESS/src/carrier/agency-carrier.mjs:274` | one task id, so one worktree path, per proposal and attempt |
| `provider.receive` takes a provider lease, then opens the workspace inside it | `agency-carrier.mjs:300-345`, `inWorkspace` at `:198-206` | the `flock` on `codex-provider-capacity/capacity.lock` precedes the checkout (`HARNESS/src/carrier/session.mjs:98-135`) |
| `carrierWorkspaces.open` calls `prepareCarrierWorktree(... effects: "read-only", reuse: true)` | `HARNESS/src/carrier/workspace.mjs:173-183` | read-only skips package install only |
| `prepareWorktree` runs `git fetch` in the repository, `git worktree add --detach <root>/<id> refs/remotes/origin/main`, `resetBranch`, `clean`, then `git submodule update --init --force` for every composed submodule, then `clean` in each | `ENGINE/src/workspace/worktree.mjs:123-137` | a full working tree of the superrepo and its submodules, at **latest origin/main** |
| Root of that worktree | `workspace.mjs:38-39`: `$METROPLAT_CODEX_WORKTREES`, else `homedir()/.local/state/561-group/codex-worktrees` | outside `/home/emsenn/info` |
| Lease root | `session.mjs:98`: `$XDG_STATE_HOME` or `$HOME/.local/state`, then `561-group/<pool>-provider-capacity` | outside `/home/emsenn/info` |
| Duty worktree root (the same engine) | `ENGINE/src/workspace/root.mjs:10-12`: `$METROPLAT_DUTY_WORKTREES`, else `homedir()/.local/state/561-group/duty-worktrees` | outside `/home/emsenn/info` |

The deployed copies in `STORE/node_modules/@red-cup-engineering/` were compared with the house copies. `workspace.mjs`
is byte-identical. `agency-carrier.mjs`, `session.mjs` and the engine's `worktree.mjs` differ in unrelated parts, but
the deployed `prepareWorktree` is the same legacy sequence (`STORE/.../computer-code-development-engine/src/workspace/worktree.mjs:156-166`:
`fetchMain`, `add`, `resetBranch`, `clean`, `updateSubmodules`) and the deployed `sharedCapacityRoot`
(`.../agent-harness-.../src/carrier/session.mjs:98`) is `$HOME/.local/state/561-group/<pool>-provider-capacity`.
So the chain above is what the process ran.

Every push to `emsenn/bare-cedar-fog` main moves `origin/main`. A receive awaiting receipt, or a retry after an
`unverified` judgement (`RECEIVING_RETRY_MS` = 10 minutes, `RECEIVING_ATTEMPTS` = 4, `agency-carrier.mjs:58-59`),
opens a new task id and so a new full checkout. `.gitmodules` of the house declares 16 submodule paths, each updated
with `--force`. A failed act keeps its worktree, marked, up to `FAILED_WORKTREES_KEPT` = 10 of them
(`workspace.mjs:26`, `:99-114`), so the retained bytes are ten full checkouts.

Three defects follow, each independent of the others:

- **D1, volume.** The cost of a receive is the size of the whole tree and its submodules, though a receive judges
  one proposal that changed a few records. The 84-88% pressure and load 15-17 on 16 CPUs of 15:44-15:50Z are this
  cost (addendum of `computer-systems-engineering-services-section/.../2026-10-09-spec-rpc-witness-volume-and-node-heap.md`).
  The byte count of a checkout was not measured here (no `du` on this laptop); the pressure trace is the evidence.
- **D2, place.** The checkout and the lease are written under `~/.local/state/561-group/`, which the rule in
  theory statement 4 forbids. On the laptop today `codex-worktrees` holds one `agency-receive-3eb91973af0a2bc24e93090a918b8b92`
  directory and `duty-worktrees` one entry.
- **D3, subject.** Legacy preparation checks out `refs/remotes/origin/main` as of the moment the act opens
  (`worktree.mjs:123`, `from = ORIGIN_MAIN`). Theory statement 3 says the receiver reads the produced commit. A
  receive that opens after a later push reads files the proposal did not produce.

## 3. The repair that already exists, judged

The search was by name in the deployed app and in both organization repositories (open pull requests of
`GH-CSS` and `GH-CCDE`, merged pull requests #101-#135 of `GH-CSS`, #1-#8 of `GH-CCDE`).

**Open pull requests.** None repairs D1, D2 or D3. `GH-CSS` #136, #134, #131, #130, #129, #120, #92, #49, #30, #18
and `GH-CCDE` (none open) were read by title and branch; none concerns the receiving workspace.

**Landed on `GH-CCDE` main: the exact source-closure mode (PRs #4, #5, #6, #7, #8).** Judgement: *aligned in its
theory, already landed, not yet in effect on this node, and incomplete for D1 and D2.*

- Aligned: `prepareWorktree({sourceBinding, sourceResult, ...})` "never fetches latest main, never runs `git submodule`"
  and, for receiving, opens "the witnessed produced commit in its original physical copy" and "rejects dependency
  installation" (`GH-CCDE/specifications/source-closure.md`; `GH-CCDE/src/workspace/worktree.mjs` `prepareWorktree`;
  `src/workspace/source-closure.mjs` `prepareSourceResultWorktree`). This is a repair of D3 and of the `git fetch`
  and `git submodule update` cost.
- Not in effect: the deployed app has no such mode. `STORE/node_modules/@red-cup-engineering/metroplat/src/source-repository.mjs`
  is the 28-line `configuredSourceRepository` only; the deployed host `STORE/src/agency-work.mjs` has no
  `repositoryOf`; deployed proposals carry no `sourceRepository` or `sourceResult`
  (`STORE/node_modules/@red-cup-engineering/feltos/src/work/work-result-proposal.mjs`). Every receive therefore
  takes the legacy path of section 2. The house copy of `HARNESS/src/carrier/workspace.mjs` (last commit
  `063645a41fb`, 2026-10-04) predates the mode as well.
- Not wired: the mode needs the host's trusted `sourceBindingOf`, `bindSourceGit` and `publishSourceCandidate`
  ports, and the specification states "No runtime factory registration, host acquisition, source grant or
  deployment is performed by this source change."
- Incomplete for D1: exact mode still runs `git worktree add` of the whole produced tree for the root and for every
  composed child, up to 128 copies (`source-closure.md`, "Domain and codomain"). It removes the fetch and the
  `git submodule` runs and bounds the set to the admitted closure; it does not reduce a receive to the records
  that changed.
- Incomplete for D2: `carrierWorktreeRoot` on `GH-CSS` main (`services/agent-harness-computer-system-engineering-services-section/src/carrier/workspace.mjs`)
  is unchanged in its default, `homedir()/.local/state/561-group/<name>-worktrees`.

**Landed on `GH-CSS` main: source-free receiving.** `configuredWorkSourceRepository` in
`apps/metroplat/src/source-repository.mjs` returns `{ mode: "no-source", effects: "read-only" }` for work with no
`sourceRepository` whose capabilities are all installed pure operations, and `carrierWorkspaces` then gives the act a
private scratch directory with no Git (`SOURCE_FREE_WORKSPACE_RULE`, `sourceFreeWorkspace`). Judgement: *aligned and
already landed; it is the right shape for a receive that needs no source, and it throws for any work that names a
capability outside that set.* It is the model for the records mode below, which is the middle case: the receive needs
a few files, not a tree and not nothing.

**Not repaired anywhere: the place of the roots and the lease (D2).** No branch or pull request moves them.
`GH-CSS` #131 and #134 concern the harness's sign-in and world entry.

Consequence: the aligned change extends the landed mechanism with a third mode and moves the roots. It does not
build a parallel mechanism (rule `use-and-improve-the-groups-own-software`).

## 4. Requirements (EARS, one shall each)

Terms: a *receiving act* is one `provider.receive` attempt. A *result entry* is one entry of a proposal's named
`metroplat.git.source-result` (`path`, `sourceRepository`, `sourceBase`, `commit`). An *agency record* is a file
whose path has a `lib/agency/` segment. A *state root* is `<dataRoot>/data/state/` of the carrier node, inside
`/home/emsenn/info`.

Reading only what changed:

- **R1.** When a receiving act opens for a proposal that carries a named source result, the carrier shall derive
  that proposal's changed paths from each result entry by `git diff --name-status -z --no-renames <sourceBase> <commit>`
  run in the entry's original source copy.
- **R2.** When every changed path of a proposal is an agency record, the carrier shall open the act in records mode
  and shall place in the act's directory only those paths, each read at its result commit by `git cat-file --batch`
  from the original copy's object store.
- **R3.** While a receiving act is in records mode, the carrier shall run none of `git worktree add`, `git checkout`,
  `git submodule`, `git fetch`, `git clean` or `pnpm install` for it.
- **R4.** While a receiving act is in records mode, its directory shall contain no `.git` entry and shall be read-only
  (directories 0500, files 0400).
- **R5.** When a changed path is a gitlink of a composed child, the carrier shall read that child's changed agency
  records from the child's own original copy named by the source closure, at the child's result commit.
- **R6.** If any changed path of a proposal is not an agency record, then the carrier shall open the act with the
  existing exact source-result worktree (`prepareSourceResultWorktree`) and shall not open it at latest `origin/main`.
- **R7.** If a records-mode set exceeds 512 files, 4 MiB in all, or 256 KiB for one file (the bound of
  `readSourceSnapshot`), then the carrier shall refuse records mode with the typed obstruction
  `receiving.records:over-budget` and shall open the exact source-result worktree of R6.
- **R8.** If a proposal carries no named source result, then the carrier shall open the act source-free
  (the landed `no-source` scratch) and shall not open any checkout of the repository.
- **R9.** If a receiving act cannot read a named path or commit from its original copy, then the act shall end with
  the receiver's `unverified` decision naming the path, and shall not end in a rejection.

Keeping state in the section:

- **R10.** The carrier shall hold every task directory and worktree of a dialect under
  `<dataRoot>/data/state/<dialect.name>-worktrees/` and shall not default to a path under `homedir()`.
- **R11.** The carrier shall hold each provider's capacity ledger and lock under
  `<dataRoot>/data/state/<dialect.pool>-provider-capacity/`.
- **R12.** The code-development engine shall hold duty worktrees under `<dataRoot>/data/state/duty-worktrees/`.
- **R13.** Where an environment variable names a root explicitly (`METROPLAT_<NAME>_WORKTREES`,
  `METROPLAT_DUTY_WORKTREES`), the carrier shall refuse a value outside the house root unless the variable
  `METROPLAT_STATE_OUTSIDE_HOUSE` names it.
- **R14.** When a directory lies under a dialect's task root, is ignored by the house's Git ignore rules, and holds
  either its own `.git` file or the records marker file `.records-task`, the check `assertNotSharedCheckout` shall
  accept it.
- **R15.** If a directory lies inside a primary checkout and does not satisfy R14, then `assertNotSharedCheckout`
  shall refuse it.
- **R16.** When a receiving act in records mode ends, whatever its decision, the carrier shall remove the act's
  directory.
- **R17.** When the carrier opens the first task of a host run, it shall retire the former roots
  (`~/.local/state/561-group/<name>-worktrees`, `duty-worktrees`) by the existing `pruneRetiredWorktreeRoot`, and
  shall move a former capacity ledger into the new root only when it holds no live reservation.
- **R18.** The house shall ignore `**/data/state/*-worktrees/`, `**/data/state/*-provider-capacity/` and
  `**/data/state/duty-worktrees/` in Git, and shall exclude them from the pnpm workspace.

Evidence:

- **R19.** When a receiving act opens in records mode, the carrier shall record in the act's task state a witness
  listing each path, its blob object id and its byte count, and the total.
- **R20.** The work readout of the host shall report, for each receiving act, its mode (`records`, `source-result`
  or `no-source`) and the bytes it materialized.

## 5. Specification

### 5.1 `recordsSnapshot` (pure of Git except a bound reader)

Domain: `{ entries: ResultEntry[], copyOf(entry) -> SourceCopy, locus: RegExp, budget: { files, bytes, fileBytes }, git: BoundGit }`.
Codomain, a frozen value, one of:

- `{ kind: "workspace.records-snapshot", files: [{ path, status, oid, bytes, entryPath }], totalBytes, results: [{ entryPath, sourceBase, commit }] }`
- `{ kind: "receiving.records:obstruction", reason: "non-record-path" | "over-budget" | "unreadable", paths: string[] }`

Effects: host-read only. It runs, through the bound Git port that refuses acquisition and network commands
(`source-closure.md`, "Effects and recovery"), `git diff --name-status -z --no-renames`, one `git ls-tree` per
changed directory-free path set, and one `git cat-file --batch`. It writes nothing. It is total: every input yields
one of the two values. A deleted path (`D`) is listed in `files` with `oid: null` and no content. A rename is
reported as delete plus add (`--no-renames`).

### 5.2 `openRecordsWorkspace`

Domain: `{ dialect, spec, snapshot, dataRoot, environment }`. Effect: creates
`<dataRoot>/data/state/<dialect.name>-worktrees/<task id>/` with mode 0700, writes each file under its entry path
(the entry path of a child is its composed path), writes `.records-task` (the witness of R19, canonical JSON), then
sets the modes of R4. It refuses a destination that exists and is not empty and unbound. Reopening an act whose
directory matches the witness byte for byte reuses it; a mismatch refuses.

### 5.3 The three modes of `carrierWorkspaces.open`

In order, for a receiving act:

1. `repositoryOf(spec)` returns `mode: "no-source"` -> source-free scratch (landed).
2. A named source result exists -> `recordsSnapshot`; a snapshot value -> `openRecordsWorkspace` (new); the
   obstruction `non-record-path` or `over-budget` -> `prepareSourceResultWorktree` (landed).
3. Otherwise refuse with `source workspace: original sourceRepository is unresolved` (landed); never legacy
   preparation for a receiving act.

Execution acts are unchanged by this note except for R10, R12 and R14.

### 5.4 Roots

`carrierWorktreeRoot(dialect, environment, dataRoot)` and `sharedCapacityRoot(dialect, { dataRoot, environment })`
take the carrier node's `dataRoot` (already computed by `codexNodeOptions`, `HARNESS/services/codex-harness-services-section/src/operations.mjs:429-444`,
and passed to the carrier as `dataRoot`). Each dialect's host wiring passes it to `carrierWorkspaces` and to
`inProviderTurn`. `dutyWorktreeRoot(environment, dataRoot)` in `ENGINE/src/workspace/root.mjs` takes it the same way.

### 5.5 Receiver instruction

For records mode the rule shown to the session replaces `CARRIER_WORKSPACE_RULE`:
"Your working directory holds exactly the files this proposal changed, at the commit it produced, read-only. It is
not a Git checkout. Judge the receiver condition against these files and the evidence the proposal names. If a file
you need is not here, return unverified naming it."

## 6. Design

### 6.1 Owners and order (data -> code -> networking -> systems)

| Owner | Change | Tier |
|---|---|---|
| `GH-CCDE` `src/workspace/` | new `records-snapshot.mjs` (5.1) beside `source-snapshot.mjs`; `root.mjs` takes `dataRoot` (R12) | code |
| `GH-CSS` agent harness `src/carrier/workspace.mjs` | records branch in `carrierWorkspaces.open`/`close`, `openRecordsWorkspace`, root default (R10), `assertNotSharedCheckout` (R14-R15), former-root retirement (R17) | code |
| `GH-CSS` agent harness `src/carrier/session.mjs` | `sharedCapacityRoot` from `dataRoot` (R11) | code |
| `GH-CSS` `apps/metroplat/src/source-repository.mjs` and `HOST/src/agency-work.mjs` | pass `dataRoot` to the dialects' workspaces; wire `sourceBindingOf`, `bindSourceGit` for exact mode so item 2 of 5.3 can occur | systems |
| House (`emsenn/bare-cedar-fog`) | `.gitignore` and `pnpm-workspace.yaml` entries (R18); the deployment declaration carries no path outside the house | systems |

Records mode needs a named source result, which exists only once the exact mode is wired and deployed, so the
order of the three slices is: engine, then carrier and host, then house and deploy. The deployed node keeps its
current behaviour until the release is rebuilt and the unit restarted; this note does not do either.

### 6.2 Why records mode and not only exact mode

Exact mode checks out the whole produced tree and every composed child. A receive judges a proposal whose result
is, in the case that raised this, a few agency records. The diff of two commits and a batch blob read cost the
size of the change; a checkout costs the size of the tree. The landed no-source scratch shows the house already
accepts a Git-free directory as a receiving workspace; records mode fills it with the proposal's own files.

### 6.3 Why the state root is `data/state/` and how that meets the old comment

`workspace.mjs:35-37` keeps worktrees outside the repository because "each worktree's packages would join the pnpm
workspace beside the originals and the tree would read as untracked files in the shared checkout." Both causes are
removed by the design: records mode installs no packages and writes no Git metadata, exact-mode execution trees
are excluded from the workspace by R18, and R18 ignores the roots in Git. The root `.gitignore` already holds the
precedent for machine state kept under a section's `data/state/` and ignored (`codex-tasks`). `assertNotSharedCheckout`
stays fail-closed: R14 admits only an ignored directory under the dialect's own root carrying its own marker.

### 6.4 The lease

The lease serialises provider turns; the checkout ran inside it. With R2 the work inside the lease is a diff and
a batch read, so the lease no longer holds the machine's disk. Moving the ledger (R11) changes only its path. The
`flock` helper and the slot protocol (`session.mjs:98-302`) are unchanged.

### 6.5 Failure behaviour

An unreadable record ends the act `unverified` (R9); the existing retry (4 attempts, 10 minutes apart) then reads
the same immutable commits again. Because the subject is a commit and not `origin/main`, a push between attempts
cannot change what the receiver reads. A failed act leaves its artifacts (`prompt.txt`, `events.jsonl`,
`exit-code`) in `<dataRoot>/data/state/<dialect.tasks>/<id>/` and no directory (R16), so `FAILED_WORKTREES_KEPT`
bounds only execution trees.

## 7. Receiving conditions

The independent receiver (the Chief Engineering Officer under `receiving-and-integrating-engineering-source`; the
Senior Engineer does not receive its own work) accepts each slice only when it has inspected:

1. **Records mode reads only what changed.** For a proposal whose result changes N agency records, the act's
   directory holds exactly those N files at the result commit, byte equal to `git cat-file blob <oid>`, and the
   task state holds the witness of R19. No `.git` entry exists in it.
2. **No checkout commands.** The Git invocations recorded for a records-mode act are `diff`, `ls-tree`, `cat-file`
   and nothing else (R3); `git worktree list` in `/home/emsenn/info` lists no `agency-receive-*` entry for it.
3. **Place.** A push to `emsenn/bare-cedar-fog` main with no agency change opens no directory; with an agency
   change, every path the act creates lies under `/home/emsenn/info/**/data/state/`. No path is created under
   `~/.local/state/561-group/` by the carrier, the lease or the duty worktree.
4. **Pressure.** `/proc/pressure/io` some avg10 stays below 25 during the receive of a push that changed three
   records (the 2026-10-09 trace reached 84-88 on the legacy path).
5. **Subject.** After a second push lands between two attempts of one receive, both attempts read byte-identical
   directories.
6. **Fail closed.** A proposal with a non-record path opens the exact source-result worktree, never latest main; a
   proposal with no named result opens source-free; an unreadable record yields `unverified`.
7. **Place of the guard.** `assertNotSharedCheckout` refuses a directory under `/home/emsenn/info` that is not
   ignored or lacks the marker.

## 8. What is returned and why not a pull request

The smallest aligned change is not small. It adds a module to one repository, changes the carrier, the session
runner and the host in a second, and changes the house's ignore and workspace files; the receiving mode it depends
on (exact source result) is landed but not wired on this node. A change that moved only the root, or only
shortened the checkout, would answer the words of the request and leave D3 and the lease in place (rule
`leader-prompts-become-research-before-code`). It is therefore returned as three cloud slices that carry this
note as their specification:

1. `red-cup-engineering/computer-code-development-engine`: `records-snapshot.mjs`, `root.mjs` (R1, R2, R5, R7, R12, R19).
2. `red-cup-engineering/computer-services-section`: carrier, session runner, metroplat and host wiring (R3, R4, R6, R8-R11, R13-R17, R20).
3. `emsenn/bare-cedar-fog`: ignore and workspace entries, removal of the former roots after the release carries slice 2 (R17, R18).

## 9. Not yet derived

- Whether `lib/agency/` is the whole of "agency record" for the receivers the Group seats (a record under a
  section's `content/` that an office duty names as a deliverable is not covered by R2 and falls to R6).
- The byte size of one legacy checkout on this host, and the time the lease was held: neither was measured, to
  honour the whole-tree prohibition.
- Which pull request pinned the standalone engine into `GH-CSS` main: the in-tree copy of the engine in `GH-CSS`
  has no `workspace/source-closure.mjs`, yet `GH-CSS` main's `workspace.mjs` imports it, so the import resolves only
  through a package supplied outside that tree. Slice 2 confirms the resolution before it relies on it.
