---
name: operate-remote-hosts
description: Measure or operate cold-red-gate and the GCP mirror through their current machine records and bounded SSH procedures.
---

# Work with a remote host

Read the current dated machine record under
`561-group-services-section/data/records/` before connecting. It owns host
identity, intended role, and the current SSH or provider surface; remeasure
reachability rather than trusting past prose.

Start with `timeout 12 ssh -o BatchMode=yes -o ConnectTimeout=8 HOST COMMAND`.
Keep every command scoped to the requested host and capability. Inspect actual
processes, listeners, unit fragment paths, runtime working directories, and
deployed revision before making a claim. Do not print credentials, environment
dumps, or private configuration.

Separate source, process existence, listener reachability, protocol behavior,
receiver admission, and public acceptance. Deployment, restart, package install,
or another mutation requires the user's applicable authority and a named
receiver-visible check.

Read [detailed guidance](references/detailed-guidance.md) only for named
sections **Secret-safe verification**, **ScheduleDelivery queue**, **Deciding
whether tests are side-effect-free**, **Where data lives**, **Bounded topic
survey**, **farstone-convention release wave**, **Memory capacity gate**, or
the unit/Caddy/UFW verification sections.
