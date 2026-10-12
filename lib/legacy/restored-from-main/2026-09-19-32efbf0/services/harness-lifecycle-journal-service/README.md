# harness-lifecycle-journal-service

`@red-cup-engineering/harness-lifecycle-journal-service`

One admitted event schema and one recording path for every agent harness's
skill selections and provider commissions. Factored out of the Bare Cedar Fog
Codex section so a second harness records the same evidence instead of
re-deriving a parallel journal.

## What it owns

- `data/records/schema/harness-lifecycle-event.schema.json` — the canonical
  schema, `urn:bare-cedar-fog:harness-lifecycle-event:v1`. Two variants,
  `skill-selected` and `provider-commissioned`. `actor` is an `enum` over the
  admitted harness actor URNs, never a `const` welded to one harness.
- `src/harness-lifecycle.mjs` — `assertHarnessLifecycleEvent`,
  `recordSkillSelection`, `recordProviderCommission`,
  `summarizeHarnessLifecycle`, `openHarnessLifecycleJournal`, and the
  constants `HARNESS_LIFECYCLE_OBJECT_KIND`, `ADMITTED_HARNESS_ACTORS`,
  `SKILL_SELECTED_EVENT_TYPE`, `PROVIDER_COMMISSIONED_EVENT_TYPE`.

Every recording function requires an explicit `actor` and an explicit journal
`root`. There is no default actor: the caller's own harness package supplies
its actor URN and its own `data/logs/` root.

## What it does not own

Harness introspection stays with the harness. `inventoryCodexHarness` and the
ops attention adapter read Codex-specific runtime paths and remain in
`bare-cedar-fog-codex-services-section`.

## Adding a harness

Append the actor URN to `ADMITTED_HARNESS_ACTORS` in
`src/harness-lifecycle.mjs` and to the `actor` `enum` in both schema variants.
Nothing else in this package changes. The new harness package then adds its
own thin `scripts/record-harness-*.mjs` wrappers binding that actor and its
own root.

## Operations

    node scripts/record-harness-skill-selection.mjs --root DIR --actor URN --turn ID --skill NAME
    node scripts/record-harness-provider-commission.mjs --root DIR --actor URN --turn ID --agent NAME --task TEXT
    node scripts/summarize-harness-lifecycle.mjs --root DIR

Consumers at the script stratum import `src/harness-lifecycle.mjs` directly
rather than shelling out to these.

## Parity guard

Both harnesses' wrapper output validates against this one schema. Each harness
package carries a drift test asserting its own actor, the shared object kind,
and the shared event types; those tests fail if either side forks the contract.

## Tests

    npm test
