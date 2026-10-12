---
name: use-git
description: How to do git work in this tree directly — status, staging, committing, history, untangling a shared dirty working tree. Load before any git operation beyond a read-only `git status`/`git log`/`git diff`.
---

# Use git

Do this work yourself, in the main loop, with the `Bash` tool. Git is not a
reason to dispatch an agent, and it is not a reason to create a `git
worktree` either: this checkout is 270k+ tracked files and several GB of
`.git`, shared live by many concurrent sessions. A linked worktree
materializes another full copy of that same huge tree — it does not isolate
work cheaply here, it multiplies the disk I/O that has been crashing the
machine. Do coherent work directly in this one checkout and commit it by
exact path (below).

## Scope every tree-walking command

`git grep`, `git status`, and `git log -p`/`--all` each walk the whole
working tree or the whole history when run unscoped. Given this repository's
size, that is not a style preference — an unscoped run of any of these (or
several running concurrently across a session's own subagents) is the actual
mechanism that has crashed the shared machine's disk.

- Search tracked-file content with `rg` (ripgrep) or `fd`, not `git grep`;
  always pass a path or type filter, never an unscoped run over the whole
  tree.
- `git log`, `git blame`, `git bisect`, `git show` are read-only and always
  fine to run, but pass a path (`-- <path>`) — an unscoped `git log -p` walks
  every commit's full diff across the entire tree.
- Skip `git status` when you already know which paths you touched. When you
  do need it, scope it (`git status --short -- <path>`) rather than a bare
  `git status` across the whole working tree.

## Routine, bounded change (the default)

Use the house operator:

```
node lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/computer-code-development-services-section/services/version-control-services-section/services/git-services-section/services/committing-git-paths-service/scripts/commit-git-paths.mjs \
  --repository <repo> --path <file> [--path <file>...] --message <message>
```

Supply literal repository-relative file endpoints, both old and new for a
rename. Unrelated dirt neither grants ownership nor blocks closure — don't
fix it en passant, but don't let it block your own scoped commit either.

`--path` takes one file per flag, space-separated — never `--path=<file>`
(rejected as an unknown argument) and never a comma/newline-joined string
with quote characters spliced in by `sed`/string interpolation (the quotes
become literal bytes in the path and it reports "does not exist"). For many
files, build a real shell array and let the shell quote each element:

```sh
mapfile -t paths < <(git status --short -- <your-scoped-tree> | cut -c4-)
args=()
for p in "${paths[@]}"; do args+=(--path "$p"); done
node <script-path-above> --repository <repo> "${args[@]}" --message "<message>"
```

(an array, expanded quoted as `"${args[@]}"` — not a `$(...)`-interpolated
string, which re-splits on whitespace and drops any real quoting) or pass
each `--path <file>` pair out explicitly when the list is short.

## Never stage or commit by wildcard

This checkout is shared live by many concurrent sessions and subagents, each
with real uncommitted work in the same working tree at the same time.
`git add -A`, `git add .`, `git add -u`, and `git commit -a` stage or capture
*everything currently sitting in the working tree* — including a file
another live session is mid-edit on. That is the actual mechanism behind a
commit appearing to "wipe" someone else's work: nothing was deleted, it was
swept into an unrelated commit (or its containing directory got rewritten
out from under it by a wildcard operation). `commit-git-paths.mjs` above
exists specifically to prevent this: it stages only the literal endpoints
you name, into a private temporary index, and refuses to install the commit
if the real index changed underneath it. Use it — by exact path — for every
commit. The only wildcard exception is a deliberate, owner-requested bulk
commit, covered below, and it still requires checking the dirty set first.

## Before any destructive op

`git checkout`/`restore`/`reset`/`clean`, or `rm -rf` inside the repo: run
`git status` (scoped to the path you're about to touch) first. Stash (`-u`
for untracked) or commit what's there before proceeding. Never revert or
discard a diff you didn't make — it may belong to a different live session
sharing this checkout, not just a stale local edit of your own.

## Bulk/blanket commits (`git add -A` + `git commit`)

Only when the owner explicitly asks for exactly that, in these words, in
this conversation — not as a shortcut when scoping feels slow. When asked:
check the dirty set for `.env`/secret-shaped files first (`git status
--short | grep -iE '\.env'` or similar), then add and commit with one commit
message that says plainly what this is (e.g. "bulk commit of accumulated
uncommitted work, owner-directed, no per-file review").

## History

`git log`, `git blame`, `git bisect` directly — read-only, no operator
needed, but scope every one of them to a path (see "Scope every
tree-walking command" above). `git mv` preserves history through a tracked
move; note in your report when an untracked file moved by plain `mv`
instead.
