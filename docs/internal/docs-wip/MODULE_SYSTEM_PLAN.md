# Module System — Implementation Plan

Status: **Draft for review (revised after design review).** No code changes yet.
The plan now treats modules as a *state* problem (hermetic checking + a merged
declarations manifest), not just a *path* problem — see "The core reframe".

## Motivation

Tracked pain point: *"Need module paths. Having to load everything via relative
paths is troublesome."* Today an import's path is resolved relative to the
**current working directory**, not the importing file, so a module can only be
imported reliably from the directory you happen to run the command in.

## Current state

`import "path"` parses to an `ImportExpression` holding a string path. A module
is a `.noo` file whose **last expression** is the module value — by convention a
record you destructure, e.g. `examples/math_module.noo`:

```noolang
addFn = fn x y => x + y;
multiplyFn = fn x y => x * y;
{@add addFn, @multiply multiplyFn}
```

Consumed as: `{@add, @multiply} = import "examples/math_module"`.

Resolution and loading happen **twice, independently** — once in the type
checker and once in the evaluator:

- `typeImport` (`src/typer/type-inference.ts`): appends `.noo` if missing, then
  `path.resolve(filePath)` — resolved against **CWD**. Its own comment flags the
  gap:
  ```ts
  // For type checking, we need to resolve relative to current working directory
  // In a real implementation, we'd want to track the current file being checked
  fullPath = path.resolve(filePath);
  ```
  It reads, lexes, parses, and type-checks the whole file on **every** import.
- `evaluateImport` (`src/evaluator/evaluator.ts`): `fs.readFileSync(path.value, ...)`,
  evaluates, returns the last expression's value.

### Deficiencies

1. **CWD-relative resolution.** `import "utils"` from `src/foo.noo` looks for
   `./utils.noo` relative to where the command ran, not next to `foo.noo`.
2. **No caching / cycle detection.** Each import re-reads, re-parses, and
   re-type-checks; importing a module N times type-checks it N times. (A prior
   "module-level substitution cache" was removed for being buggy — see commit
   `555f80a`.)
3. **Duplicated resolution.** Typer and evaluator resolve independently and can
   diverge. No module identity or namespacing beyond the returned record.

## Goals

- Imports resolve **relative to the importing file**.
- Support **project-root / named paths** so deep trees don't need `../../../`.
- A **single shared resolver** used by both typer and evaluator.
- **Cache** modules by resolved absolute path, with **cycle detection** and clear
  errors.
- Do not regress: `bun test`, `bun run typecheck`, `node validate_examples.js`
  all stay green; the `-e`/REPL (no source file) path keeps working.

## Non-goals (for now)

- Package manager / remote/versioned dependencies.
- Changing the "module = last expression" model or the `import "..."` syntax.

## Design principles (pitfalls to avoid)

The JS and Python module systems accreted well-known footguns. Noolang's model
already avoids several by construction; the rest are explicit design choices.

**Strengths to preserve:**

- **One module format, forever.** JS's original sin is CJS-vs-ESM duality (plus
  AMD/UMD) and interop hazards. Noolang has exactly one shape — *a module is a
  file whose last expression is its value.* Never add a second format.
- **Modules are values, not magic namespaces.** `import "..."` returns an
  ordinary value (usually a record). Exports are explicit, named, typed, and
  statically knowable — no `module.exports =` reassignment or monkey-patching.
  Selective import is just subset destructuring (`{@add} = import "./math"`), so
  we never need JS's three import forms.

**Choices that avoid specific pitfalls:**

- **Deterministic, file-relative resolution** (vs. Python `sys.path` / Node CWD
  dependence): an import resolves against the importing file's directory.
- **Relative imports must be explicit** (Deno's rule): `./x`, `../x` for local
  files; a *bare* specifier (`std/list`) is only ever a named/registered module,
  never a sibling file. Kills the Python "local `random.py` shadows the stdlib"
  footgun.
- **No directory walking, no per-package manifest resolution** (vs. Node's
  `node_modules` walk-up + `package.json` `main`/`exports` maze): relative
  specifiers resolve against the importing file; bare specifiers resolve through
  a single, explicit **import map** (one optional project file mapping name →
  path). No `index.noo` auto-resolution; one extension, handled consistently.
- **Circular imports are a clean error — for free.** Because a module *is its
  evaluated value*, `A → B → A` is genuinely unresolvable; there is no partial
  module to hand back. Detect the cycle and report the chain, rather than JS/
  Python's silent half-initialized modules.
- **Effect-tracked loads (Noolang's advantage).** The effect system can *see* a
  module's load-time effects. Default toward imports being referentially
  transparent (pure to import); surface load effects in the type when present —
  something neither JS nor Python can express. This directly avoids the
  "top-level code runs on import, order matters" class of bugs.
- **Single source of truth for names.** The import map keeps one name→path
  mapping, which is also the right foundation if a package manager is ever added
  (avoids npm's duplicate-version / diamond issues).

## The core reframe (from the design review)

A [design review of the first draft](https://github.com/jethrolarson/noolang/pull/109)
reproduced concrete failures against the interpreter and reframed the problem:
**resolution is the easy part; the hard part is shared mutable state.** Modules
today type-check *in the importer's `TypeState`* and register `implement`/
`variant` declarations into *process-global registries* (`TypeState.traitRegistry`,
`adtRegistry`). So a naive path-keyed "cache the value" makes those side effects
load-bearing and produces real unsoundness:

- **Trait incoherence.** A diamond import of a module that defines an instance
  hit a "duplicate implementation" error that the old `typeImport` catch-all
  swallowed, returning a fresh type variable → misuse of the module type-checked.
  Conflicting instances across modules resolved first-import-wins, silently.
  *(The catch-all is already removed — see the merged import-error fix — which
  un-masks these; the merge model below is what actually resolves them.)*
- **Context-dependent module types.** A module's inferred type depended on which
  importer checked it first (environment leaked both ways). Caching `{type}` by
  path would freeze that accident.
- **Name-keyed type identity.** Two modules each defining `variant Box` collided
  silently in the by-name `adtRegistry`; first wins.
- **Effect erasure.** `typeImport` returned a pure result, discarding a module's
  top-level effects entirely.

So the design must treat loading a module as producing a **hermetically-checked
result plus a declarations manifest that is merged with conflict detection** —
not as running code into shared registries.

## Module loading model

`loadModule(realpath) → { exportType, exportValue, manifest }`, memoized by the
**canonical real path** (`fs.realpathSync`, so symlink/case aliases are one
entry).

- **Hermetic checking.** Each module type-checks in a **fresh `TypeState`**
  seeded with builtins + stdlib **only**, plus the merged manifests of the
  modules it *itself* imports — never the importer's environment. The export
  type is fully substituted and generalized before caching, so it is identical
  regardless of who imports it or in what order.
- **Declarations manifest.** The result carries the module's `variant`
  definitions, `constraint` (trait) definitions, and `implement` instances —
  each tagged with its defining canonical path. The manifest is **transitive**:
  a module's exported manifest = its own declarations ∪ the merged manifests of
  the modules it imports. (Own-declarations-only breaks the A→B→D / A→C→D
  diamond — A would never learn D's instance.)
- **Instance values are closures over their home module** (the runtime mirror).
  Each `implement` member is captured, at load, as a closure over its defining
  module's evaluated environment — not stored as raw AST re-evaluated in the
  dispatcher's environment. Otherwise an instance member that calls a helper
  local to its own file fails with `Undefined variable` when dispatched from
  another module. This is a **Phase-1 value-side deliverable**, part of the same
  work item as the merge — not a later cleanup.
- **Merge with conflict detection** (on import, into the importer's registries).
  The merge **trusts, dedupes, and conflicts — it never re-validates** an
  instance in the importer's context (each was already checked hermetically at
  its own load; re-checking in an importer that lacks some third module's types
  would spuriously fail). Merge is pure set-union-with-hard-conflict
  (commutative/associative), keyed on canonical realpaths, so it is
  order-independent:
  - **Instances** keyed by `(trait, type)`: same defining path ⇒ dedupe (so
    diamonds are fine by construction); different defining paths for the same
    `(trait, type)` ⇒ **hard error naming both files** (global coherence).
  - **ADT identity** = `(canonical path, type name)`: same path dedupes;
    different path, same name ⇒ **hard error** (never a silent overwrite;
    qualified coexistence is a Phase-3 namespacing feature, not this).
  - **Weak orphan rule** (cheapest to add now): an instance must live with
    either the trait or the type it implements. Treat all of `std/*` as one
    coherence unit so a stdlib instance is never an orphan of another stdlib
    module.
- **Effects: imports are pure.** Top-level module effects are a **hard error**
  (`import` is then provably referentially transparent, and once-only caching is
  sound). A module that needs runtime data exports an *effect-typed function*
  the importer runs. (Leaves the door open for an explicit `import!` with defined
  run-once semantics later; do not build it now.) A top-level `mut` binding is
  likewise **rejected** — it would otherwise become a cross-importer singleton
  via the memoized module value.
- **Cycles: hard error.** Because a module *is* its evaluated value, `A → B → A`
  has no answer. Detect via an in-progress set and error with the chain and the
  remedy ("merge the files, or extract a shared third module — mutual recursion
  is expressible within one file"). Door left open for type-only imports later.

## Phased plan

### Phase 1 — File-relative resolution + hermetic loader + manifest merge

This now includes the *state* fixes, not just paths — they are the point.

- **New `src/module-loader.ts`** (shared by typer and evaluator): `resolve`
  (below) + `loadModule` implementing the model above — realpath-keyed cache,
  hermetic `TypeState`, manifest extraction, and merge-with-conflict-detection.
- **Thread the importing file's directory** through both pipelines: add a
  `currentDir` to `TypeState` and the `Evaluator`, set when a file is loaded
  (CWD fallback for `-e`/REPL). Resolve imports against it; a module's own
  `currentDir` is its directory while it loads.
- **Replace `typeImport`/`evaluateImport`** to delegate to the loader; unify the
  typer's CWD resolution with the evaluator's file-dir resolution (they diverge
  today — same program can pass or fail by directory).
- **Tests:** nested-dir sibling import (needs file-relative); A→B→A cycle → clear
  error; module imported twice loads once; **diamond with `implement`+`variant`
  in the shared module — no duplicate error *and* misuse on both paths is a type
  error**; **a module's inferred type is identical across importers/orders**;
  **conflicting instances across two modules ⇒ deterministic error naming both**;
  **effectful top-level module ⇒ error**; symlink/case aliases hit one cache
  entry; regression: existing `examples/*_module.noo` imports still work.

### Phase 2 — Bare specifiers, import map, resolution edge cases

Deno-style explicit resolution (unchanged from the decision above), plus the
edge cases the review flagged:

- **Relative specifiers must start with `./`/`../`**; bare specifiers resolve
  through a single **import map** (`noolang.json`) + a built-in `std/*` mapping.
  No directory walking, no `index.noo` magic.
- **Cache key is the canonical `realpath`**; consider erroring on a case-mismatch
  so macOS-passing code does not break Linux CI.
- **Absolute-path imports** are a portability trap — warn or forbid; machine
  paths belong in the import map.
- **Fold the three existing stdlib-resolution strategies** (`evaluator.ts`,
  `type-operations.ts`, plus the typer) into the single `std/*` mapping; today
  running a file from another directory fails to find `stdlib.noo`.
- Import-map entries resolve relative to the **map file**, not CWD; `./x` and
  `./x.noo` share a cache entry.

### Phase 3 (optional) — Signatures, namespacing, content-addressing

Opportunities the value-based model unlocks cheaply:

- **Module signatures** — exports are already statically-known record types; an
  optional signature (at the import site or in the import map) buys separate
  compilation, an explicit cache contract, opaque types, and future type-level
  cycle tolerance.
- **Namespacing is just syntax** — `Math = import "./math"; Math | @add` already
  works; qualified-access sugar over records avoids a second namespace concept.
- **Content-addressing** — once imports are pure and results are
  `(type, value, manifest)`, keying by content hash enables incremental checking
  and a diamond-free lockfile/package story.
- **Capability-passing** — with top-level effects rejected, "export effect-typed
  functions" becomes the blessed pattern; Noolang can *enforce* what JS/Python
  only recommend.

## Key files

- `src/module-loader.ts` — **new**: resolution, realpath cache, hermetic
  `loadModule`, manifest extraction + merge, cycle detection.
- `src/typer/trait-system.ts` — registry **merge** entry point (dedupe by source
  path; conflict = error) instead of raw in-place `implement`.
- `src/typer/type-inference.ts` — `typeImport` calls the loader; ADT registry
  keyed by `(path, name)`.
- `src/evaluator/evaluator.ts` — `evaluateImport` calls the loader; `Evaluator`
  tracks `currentDir`; drop the ad-hoc stdlib resolution.
- `src/typer/types.ts` — `TypeState` gains `currentDir`; registries carry source
  path per declaration.
- `src/cli.ts` / `src/repl.ts` — set `currentDir` from the file being run.

## Risks

- **Registry keying is the crux.** `traitRegistry`/`adtRegistry` must track the
  defining path per declaration and merge (not overwrite). This is the change
  that makes coherence and identity sound; get it right first.
- **Hermetic checking may surface latent bugs** where modules currently rely on
  importer context (the review demonstrated both forward and reverse leaks).
  Expect to fix real unsoundness, not just add plumbing.
- **`TypeState` surface change** (`currentDir` + per-decl source paths) touches
  every state constructor — one mechanical pass with sensible defaults.
- **REPL / `-e` with no file** keeps working via a CWD fallback; test `import`
  from `-e`.

## Suggested execution order

1. **Registry merge with source-path keying + conflict detection**, with unit
   tests for dedupe / conflict / ADT identity — the soundness core, independent
   of resolution.
2. **Hermetic `loadModule`** (fresh `TypeState`, generalized export, realpath
   cache, cycle detection) + the "identical type across importers" and diamond
   tests.
3. **File-relative resolution** + `currentDir` threading; unify typer/evaluator
   resolution; reject effectful top-level modules.
4. **Phase 2** import map + edge cases; fold stdlib resolution into `std/*`.
5. **Phase 3** opportunities as desired.

## Verification & acceptance

This is a *soundness* feature, so "good" is not "the tests pass" — it is **the
unsound programs are provably rejected, and it did not get slow doing it.**
Verify both, explicitly.

### Goal → proof (traceability)

Every guarantee should map to the test that closes it. "Fail-closed" tests
assert the checker *rejects* an unsound program.

| Guarantee | Proof (test) | Kind |
|-----------|--------------|------|
| Trait coherence | two files define conflicting instances of the same `(trait, type)` → hard error naming both files | fail-closed |
| Diamond safety | A→B→D, A→C→D, D defines an instance → no false duplicate error; and misusing D's value type-errors on *both* paths | positive + fail-closed |
| Type identity | two files each `variant Box = …` → error; a variant flowing through a diamond is the *same* type on both sides | fail-closed + positive |
| Hermetic / determinism | a module's inferred export type is identical regardless of importer or import order | **property (headline)** |
| Pure imports | a module performing a top-level effect (`print` at load) → error; *exporting* an effectful function is fine | fail-closed + positive |
| Cycle | A↔B → clear error with the chain, not a hang | fail-closed |
| Runtime closure | an instance whose member calls a helper local to its defining file, dispatched from another file → runs correctly | positive |
| Resolution | nested-dir relative import resolves; symlink/case aliases hit one cache entry; bare non-`std` with no map entry → clear error | positive + fail-closed |
| No regression | existing `examples/*_module.noo` imports still work | positive |

### The headline acceptance test

One test matters more than the rest: **a module's inferred type is identical no
matter who imports it, or in what order.** That property is the direct,
falsifiable evidence that hermetic checking works — it *is* the reframe made
testable. If it fails, the design is broken. Treat it as the gate.

### Fail-closed is load-bearing

The negative rows above are the *point* of the feature. The worst regression is
not a broken test — it is a **fail-closed test that quietly starts passing**
(the checker begins accepting something unsound, silently, exactly like the old
error-swallowing `import`). Any change that flips a fail-closed test green is a
red alert, not a passing build. Each should be shown red→green: wrongly accepted
before the merge/keying logic existed, correctly rejected after.

### Performance guard

The make-or-break perf constraint — sharing the frozen builtins+stdlib base
across every module's hermetic check (see the design's cost discussion) — needs
a guard, not a hope:

- Benchmark: total type-check time across **N modules that each import stdlib**
  must scale ~linearly in N with a small per-module constant — **not**
  `N × (stdlib type-check cost)`. Wire it into the existing CI
  `performance-comparison` job so a reintroduced per-module stdlib re-check
  shows up as a step-change, not a silent 10× slowdown.
- Sanity assertion that trait dispatch stays a map lookup (O(1)) as the instance
  registry grows with imports.

### Definition of done (Phase 1)

- The headline property test (identical module type across importers/orders) is
  green.
- Every fail-closed test rejects what it should, each demonstrated red→green.
- The full existing suite stays green; `examples/*_module.noo` unbroken.
- The stdlib-sharing perf guard is within budget.
