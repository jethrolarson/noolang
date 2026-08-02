# 5. Modules type-check hermetically and merge by declaration, not by import order

Date: 2026-07-ish (design), landed shortly after

## Status

Accepted, implemented (`src/module-loader.ts`)

## Context

The tracked pain point was narrow — "imports resolve against CWD, not the
importing file" — but a design review against the real interpreter showed
resolution was the easy part. The hard part was shared mutable state:
modules type-checked *in the importer's `TypeState`* and registered
`implement`/`variant` declarations into process-global registries. A
naive path-keyed value cache made those side effects load-bearing and
produced real unsoundness, reproduced concretely:

- **Trait incoherence**: a diamond import of a module defining an instance
  hit "duplicate implementation," swallowed by the old `typeImport`
  catch-all, returning a fresh type variable — misuse of the module
  type-checked. Conflicting instances across modules resolved
  first-import-wins, silently.
- **Context-dependent module types**: a module's inferred type depended on
  which importer checked it first (environment leaked both ways).
- **Name-keyed type identity**: two modules each declaring `variant Box`
  collided silently in the by-name ADT registry.
- **Effect erasure**: a module's top-level effects were discarded entirely.

## Decision

Treat loading a module as producing a hermetically-checked result plus a
declarations manifest merged with conflict detection — never as running
code into shared registries.

- **Hermetic checking**: each module type-checks in a fresh `TypeState`
  seeded with builtins + stdlib only, plus the merged manifests of modules
  *it* imports — never the importer's environment. Export type fully
  substituted and generalized before caching, so it's identical regardless
  of importer or order.
- **Transitive declarations manifest**: `variant`/`constraint`/`implement`
  declarations, each tagged with defining canonical path; a module's
  manifest is its own ∪ its imports' merged manifests (own-only breaks
  diamonds — a module would never learn a shared dependency's instance).
- **Instance values are closures over their home module**: captured at
  load over the defining module's evaluated environment, not raw AST
  re-evaluated in the dispatcher's environment — otherwise an instance
  member calling a local helper fails with `Undefined variable` when
  dispatched from elsewhere.
- **Merge trusts, dedupes, conflicts — never re-validates**: each instance
  was already checked hermetically at its own load; re-checking in an
  importer lacking some third module's types would spuriously fail.
  Instances key on `(trait, type)`: same defining path dedupes, different
  path hard-errors naming both files. ADT identity is `(canonical path,
  name)`: same collapses, different hard-errors — never a silent overwrite.
- **Imports are pure**: a top-level effect, or a top-level `mut`, is a hard
  error — the former keeps `import` provably referentially transparent and
  once-only caching sound; the latter would otherwise become a
  cross-importer singleton via the memoized module value. A module needing
  runtime data exports an effect-typed function instead.
- **Cycles are a hard error** with the chain reported: a module *is* its
  evaluated value, so `A → B → A` has no answer.
- **Resolution**: file-relative (against the importing file's directory,
  threaded as `currentDir`), not CWD-relative. Bare specifiers resolve only
  through an explicit import map, never directory-walked — kills the
  Python "local file shadows stdlib" footgun and Node's `node_modules`
  walk-up maze.

## Consequences

- The single acceptance property that matters most: **a module's inferred
  export type is identical no matter who imports it or in what order** —
  the direct, falsifiable evidence hermetic checking works. Treated as the
  gate, not one test among many.
- Fail-closed tests are the point of this feature, not incidental — the
  worst regression is a fail-closed test quietly starting to pass (the
  checker silently accepting something unsound again, exactly the old
  swallowed-duplicate-implementation bug). Each such test is demonstrated
  red→green, not just asserted green.
- Perf guard: total type-check time across N modules that each import
  stdlib must scale ~linearly in N with a small per-module constant, not
  `N × (stdlib check cost)` — sharing the frozen builtins+stdlib base
  across hermetic checks is what makes this affordable; regressing it
  should show up as a step-change in CI, not a silent slowdown.
- Non-goals, deliberately: package manager / remote or versioned
  dependencies; changing the "module = last expression" model.
- Left open, by design, as future opportunities rather than scope now:
  module signatures (separate compilation, opaque types), namespacing
  (already free — `Math = import "./math"; Math | @add`), content-
  addressing, capability-passing via effect-typed exports.
