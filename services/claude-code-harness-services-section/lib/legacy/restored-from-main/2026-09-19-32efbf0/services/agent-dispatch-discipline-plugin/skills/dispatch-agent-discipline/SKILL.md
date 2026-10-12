---
name: dispatch-agent-discipline
description: How to commission, steer, and receive work from Claude Code subagents without losing context, accepting unverified claims, or duplicating work. Load before dispatching any agent.
---

# Agent dispatch discipline

Distilled from real multi-agent sessions where every failure mode below
actually happened at least once. Each rule exists because its absence
already cost someone a redone task, a wasted context window, or a false
"done."

## Write a complete brief or don't dispatch

A subagent has no memory of this conversation. A brief that assumes
context it doesn't have produces confident, wrong work.

- State the requested outcome, exact file paths, and what "done" means —
  a fixed schema or acceptance check, not a vague goal.
- State the permitted operation explicitly: read-only investigation, a
  proposed patch for review, or an authorized edit. An agent that isn't
  told it may only investigate will sometimes "helpfully" edit anyway.
- Require exact commands and verbatim counts in the report (test counts,
  line counts, exit codes) — not a summary that rounds a partial pass up
  to a full one.
- One agent, one scope. When dispatching several agents in parallel, give
  each a disjoint set of files/territory; two agents editing overlapping
  paths is how work gets silently overwritten.
- Only dispatch when a distinct finding, implementation, or verification
  result can actually change your next decision. If you already know the
  answer, do it yourself — dispatching to "be thorough" burns tokens and
  time without changing anything.

## The fan-out anti-pattern

A broad topic ("clean up all mentions of X", "survey everything about Y")
looks like it wants one agent per file or per directory. It usually
doesn't. Before fanning out on your own initiative, ask: does splitting
this into N agents change the answer, or would one agent working through
the material sequentially reach the same conclusion for a fraction of the
cost? Fan out only when:

- the resulting lots are few enough to name individually in the brief,
- each lot is genuinely disjoint (no two agents read or touch the same
  file), and
- each lot needs independently-gathered evidence, not just a different
  slice of the same search.

"One agent per directory" or "one agent per file type" as a way to give
everyone something to do is the anti-pattern, not a plan.

## Steering a running agent

- A message to a running agent queues for its *next* tool call — it does
  not interrupt mid-tool-call. If something changed that the agent needs
  to know before its next action (a file moved, an assumption broke),
  send it immediately.
- Never tell an agent (or the user) that something is done before it is
  actually done on disk. A premature "done" claim gets caught by whatever
  reads that state next, and it costs trust.
- An agent that appears stuck in an idle loop ("waiting for the build to
  finish...") gets one nudge: check whether the underlying process is
  still alive, kill it if it's hung, try the step once in the foreground,
  and report the real outcome either way. Don't nudge repeatedly hoping
  it resolves itself.
- If you need to stop a subagent, stop it explicitly. A child agent
  spawned by a stopped parent can keep running as its own top-level task —
  check for and stop those separately if you don't want them continuing.

## Recovering an interrupted commission

If a dispatched agent's report never arrived (you lost the thread, the
session restarted, whatever), its absence from the conversation is not
proof it stopped working or that its output is invalid.

1. Look for the original agent and any children it spawned; get one
   current status or terminal report from that exact agent before doing
   anything else. If it's still running, don't start a second, competing
   one on the same files.
2. Re-check the actual state of the files/repo rather than trusting your
   memory of the plan — confirm what was actually written, not what was
   supposed to be written.
3. If work remains, redispatch only the measured remainder, with the
   prior agent's report as context — never redo the whole task from
   scratch "to be safe."

## Receiving a report

- A report without the verbatim evidence you asked for (exact counts,
  exact command output) goes back for it. Don't accept a rounded-up
  summary in place of the number.
- Reject a report that treats an absence of counter-evidence as proof —
  "I didn't find X" is not the same claim as "X doesn't exist," and a
  report should say which one it's making.
- Sometimes an agent delegates part of its task to a child and reports
  back only "I delegated this" — that's a status update, not a result.
  Wait for the actual finding before acting on it.
- Verify the one load-bearing claim yourself before telling anyone else
  the task is done — run the test suite, hit the URL, open the file.
  Don't forward an unverified "it works" up the chain.
- Calibrate how much ceremony you demand to the actual number of
  consumers. A one-person project doesn't need deprecation shims,
  compatibility re-exports, or phased migrations for a change with one
  caller — that overhead is for when a real, named external consumer
  exists. Don't cargo-cult enterprise migration process onto solo work.
- A report that a task is "blocked" should say what a competent person
  would try next and why your specific constraints rule it out — "our
  wrapper for X is broken" is a fact about your plumbing, not proof that
  X itself is unreachable.
- When multiple agents' reports land together, reconcile them into one
  findings set before acting on any single one. Deduplicate overlapping
  findings, and where two agents genuinely disagree, record the
  disagreement rather than silently picking whichever arrived first.

## Briefing work meant to leave your machine

When the deliverable is headed somewhere public — a public repository, a
package registry, a plugin marketplace — add an explicit leak-prevention
check on top of the normal brief. This is a different risk than an
in-tree task, and normal "is this correct" review doesn't cover it.

- Tell the agent explicitly what must not appear anywhere in the
  artifact — code, comments, README, config defaults, example paths, or
  commit history: your local filesystem paths and machine name, any
  personal identifying information, internal hostnames or private
  registry URLs, and any project-internal jargon or vocabulary that means
  nothing to an outside reader.
- Tell it what to use instead: placeholder paths (`~/myproject`, `./`),
  the public package registry, plain descriptive language.
- Before accepting the diff, grep every file the agent touched — not just
  the ones it claims it changed — for the forbidden terms. If it made any
  commits, grep the commit history too: a term removed from the current
  file but still present in an earlier commit still ships if the
  repository goes public.
- A hit is a blocking finding. Send it back for a real fix rather than
  explaining it away as "just a comment."
