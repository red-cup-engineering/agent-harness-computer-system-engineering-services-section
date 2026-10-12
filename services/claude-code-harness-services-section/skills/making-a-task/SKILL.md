---
name: making-a-task
description: "Raises a task against a duty: a unit of work organised around a goal whose conditions are commands a machine runs, refusing any whose goal is prose; seats the work-items the task holds; and with --verify, re-runs a task's goal and derives whether it is achieved. Use before beginning any work, and to settle whether work already done is finished. Prose goals are refused because they cannot fail, and work against a goal that cannot fail is work nobody can grade."
requires-capabilities:
  - duties
  - work-item
  - structured-work-intent-admit
  - work-discharge-admit
---

A task is the thing that makes work able to fail.

The vocabulary here is exact, because confusing it is the recurring failure
this pool exists against:

  - A DUTY stands. It is owed by an office, it passes whole to whoever holds
    the office next, and it does not finish. Tasks are raised against it,
    and each of those finishes; none of them finishes the duty.
  - A TASK is ephemeral and organised around a goal. The goal is what makes
    it a task: commands a machine runs, so it terminates — achieved, failed,
    or abandoned — and which one is a readout, never an assertion.
  - A WORK-ITEM is an element of a task: the trackable entry, atomic
    (work-unit) or composite (workflow). It is NOT a task, it has no goal,
    no status, and no assignee. Requirements name work-items in realized-by.

So this script raises TASKS. Its predecessor (make-a-work-item.js) emitted
goal-bearing, office-dispatched records under the work-item name — a task
and a work-item fused into one thing — and every session that read them
learned the conflation. The record shapes are now checked against the
glossary terms themselves, so the confusion cannot be re-seated here.

The whole content of this script is otherwise the REFUSAL. Emitting a task
is trivial; what makes it a task rather than a note is that its goal is
commands a machine runs, so the work is done when they exit 0 and not when
a worker says so.

`make real high quality skills, duties, and offices` cannot fail. Every
output satisfies it, so a worker handed it will substitute a task it can
finish for the task it was given — confidently, in a shape indistinguishable
from progress. That is not a defect of the worker's character; it is what any
worker does when nothing can tell a right answer from a plausible one.
`node .../write-an-office.js --check` can fail. That is the difference,
and this script will not raise a task without it.

## Run it

```sh
echo '{"id":"…","goal":["node x.mjs --check"],"discharges":"realizing-a-requirement",
       "work-items":[{"id":"…","kind":"work-unit","actions":["…"]}]}' \
  | node .../make-a-task.js

node .../make-a-task.js --verify <id>   # re-run the goal; derive achievement
node .../make-a-task.js --list
```

Input is JSON. Output is JSON. Who the task is handed to belongs to the
dispatch, never to the record: a `dispatched-to` in the intake is echoed in
the witness output and written nowhere, because a task that named its worker
could not be handed to anyone else.

## What --verify is for, and whose it is

`--verify` re-runs the goal and derives `achieved` from the results.
It is the **witness's** instrument, not the worker's: it executes the check
and never reads a report. `achieved` is true only when there was at least
one condition and the gap is empty — the goal's own rule, not this
script's invention. A worker running `--verify` on itself proves nothing.

## Known limit, stated rather than hidden

Goal conditions are expected to fail at declaration — the work has not been
done. So this catches only a command that cannot be spawned at all; it
cannot tell "fails because the work is undone" from "fails because the check
itself is broken", since both exit non-zero. A silently always-failing check
will pass declaration and make the task unachievable. The witness re-running
it will show a gap that never closes, which is the signal.

## Foreign enterprises

Every pool this script reads is overridable: tasks (`--pool`), work-items
(`--work-item-pool`), duties (`--duty-pool`), and the schema pool the
record shapes are validated against (`--schemas`; `--terms` is honored as
a deprecated alias). So an enterprise whose tree does not seat pools at
emsenn's paths can raise tasks with this instrument by naming its own
pools. Absent the flags, the defaults are emsenn's pools under `--root`:
instances in lib/emsenn/services/561-group/services/board-of-directors/services/executive-office/content/, classes in lib/emsenn/services/561-group/services/board-of-directors/services/executive-office/lib/schemas/.

## When NOT to use

- Not for work already dispatched — this raises; it does not amend.
- Not to record that work is done. Achievement is derived by --verify, and a
  record that could assert its own completion is marking its own homework,
  which is the entire thing the goal exists to prevent.
- Not for standing obligations. If it does not finish, it is a duty, and it
  belongs in the duties pool with tasks raised against it — never here.
