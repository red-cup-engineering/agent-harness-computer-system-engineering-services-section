---
name: installing-an-enterprise-in-claude
description: "Installs a whole enterprise into a node: every office seated in the enterprise's offices/ roster is installed as a subagent by calling installing-claude-as-an-agent once per office, and a generated standing block is spliced into <node>/CLAUDE.md between its markers so a fresh session at that node knows, with no other context, to delegate work to those offices and to run the obligation loop. Refuses an enterprise path holding no offices/ directory, an empty roster, a root that does not contain the enterprise, a torn marker pair, a roster record that yields no description, and a cited instrument that seats nowhere; a sibling installer's failure kills the install with its stderr shown and the offices already installed recorded in the manifest, so no partial success is reported as success and --clean can sweep the residue. Use to stand a node up as an enterprise's dispatcher; use the two sibling installers to seat one office; never edit the block by hand — CLAUDE.md between the markers is output, regenerated on the next install."
requires-capabilities:
  - account
  - offices
  - office
  - office-incumbency-admit
  - character-mask-admit
---

An enterprise install is the third relation between an office and a node.
installing-claude-as-an-office seats one office as the identity a node's
sessions step into; installing-claude-as-an-agent seats one office as a
colleague a session hands work to. This skill seats the WHOLE ROSTER as
colleagues, and teaches the node's own sessions what to do with them: the
session at an enterprise node holds no office itself — it is the
dispatcher, and the standing block in its CLAUDE.md is the whole of its
standing instruction.

The block is a deterministic projection of the enterprise's pools — same
enterprise, same root, same block, from any working directory, because
every path it cites renders relative to a root that is checked to contain
the enterprise. It fabricates no roster fact: the office that attestation
belongs to is read from the roster (the bearer of attesting-a-work-product),
and an enterprise that seats no such office is told exactly that — the
operator is the witness. The instruments it cites are cited with the
enterprise's own pools passed explicitly, so the commands are true for a
non-default enterprise, not only for the one this repository grew first.

The agents are not installed here; they are installed by the sibling,
called once per office and never copied — found beside this script in the
flat pool, or by walking up to the lib/management/skills pool of the unit
a projected copy seats under. Its refusals are this skill's refusals,
propagated uncensored, and a mid-roster failure stops the install with
everything already installed recorded in the enterprise manifest, so
--clean sweeps the residue rather than stranding it.

## One block, both markers

The block lands in <node>/CLAUDE.md between
`<!-- installing-an-enterprise-in-claude: begin -->` and its end marker.
A file that does not exist is created holding only the block; a file
holding both markers has the block replaced in place, byte-exact, the
rest untouched; a file holding neither gets the block appended after one
separator newline. Which of the three happened is recorded in the
manifest as the block's splice mode, and clean undoes exactly that —
the separator is removed only when the splice added it, a created file
left holding nothing is removed, and a block spliced between pre-existing
markers is excised without touching a byte on either side. A file holding
ONE marker is a torn block — a contradiction to name, not a thing to
repair silently — and is refused.

## Run it

```sh
node .../install-an-enterprise-in-claude.js [<enterprise>] [<node>] --root <repo-root> --authority-root <git-worktree-root>
node .../install-an-enterprise-in-claude.js <enterprise> <node> --list --root <repo-root> --authority-root <git-worktree-root>
node .../install-an-enterprise-in-claude.js <enterprise> <node> --dry-run --root <repo-root> --authority-root <git-worktree-root>
node .../install-an-enterprise-in-claude.js <enterprise> <node> --clean --root <repo-root> --authority-root <git-worktree-root>
node .../install-an-enterprise-in-claude.js <enterprise> <node> --reinstall --root <repo-root> --authority-root <git-worktree-root>
```
Every form also requires `--authority-root <git-worktree-root>`; it is
deliberately not defaulted from `--root`, because omission is not consent.

<enterprise> is the enterprise's management library — a directory holding
an offices/ pool, with duties/, works/ and skills/ expected beside it —
defaulting to <node>/lib/management. <node> is the directory whose
sessions receive the enterprise, defaulting to the working directory.
Installs are recorded in <node>/.claude/.claude-enterprise-manifest, each
office as it installs, so that --clean is exact: it removes the block by
the recorded splice mode (the rest of the file byte-identical), delegates
--clean per manifest office to the sibling — or, for an office whose
record no longer seats in the roster, performs the sibling's exact
inverse here and says so, since the sibling refuses to resolve a record
that is gone — and removes the manifest. A manifest-less clean reports
that there is nothing to clean, which is a report, not an error; a dry
run of clean says what it would do, never that it did.

Known limit, stated rather than hidden: a manifest written before the
splice mode was recorded carries a bare `CLAUDE.md` line, and clean
degrades it to in-place — the non-destructive default, which touches no
byte outside the markers. An old separator-mode install cleaned through
such a manifest therefore leaves its one separator newline behind rather
than risk eating a byte that was never this mechanism's.

## What it refuses, and why that is the skill

- **No offices/ at the enterprise path** — refused. That is an absence,
  not an empty enterprise; installing from it would invent a roster.
- **A root that does not contain the enterprise** — refused. The block's
  cited paths render relative to the root, and a root that does not hold
  the enterprise would bake lies into the node's standing instruction.
- **An empty roster** — refused. An enterprise with no offices installs
  nothing, and an install that does nothing must say so rather than
  succeed.
- **A torn marker pair** — refused. One marker without the other is a
  contradiction in the node's own record of itself.
- **A sibling installer failure** — fatal, stderr shown, the offices
  already installed left recorded so clean can sweep them. No partial
  success is reported as success.
- **A roster record yielding no sentence; a cited instrument seating
  nowhere** — refused. The block is a projection, and a projection that
  fabricates or cites what does not exist is a lie in the node's
  standing instruction.

The question is always asked of the enterprise's pools, never of the
seated files: CLAUDE.md between the markers and .claude/agents/ are
output. Hand-editing them cannot provoke a refusal — reinstalling over
the edit is the correction, which is why the edit belongs in the record.

## When NOT to use

- Not for seating one office — that is installing-claude-as-an-office
  (the identity a session steps into) or installing-claude-as-an-agent
  (one colleague a session delegates to).
- Not for authoring offices, duties, or skills — this installs what
  already exists.
- Not for editing the standing block. It is output: change the
  enterprise's records and reinstall.
