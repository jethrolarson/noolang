# Module System — Implementation Plan

Status: **Draft for review.** No code changes yet.

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

## Phased plan

### Phase 1 — File-relative resolution + shared resolver + cache

The whole payoff for the stated pain; self-contained.

- **New `src/module-resolver.ts`** (shared by typer and evaluator):
  - `resolveModulePath(importerDir: string, spec: string): string` — append
    `.noo` if missing; if `spec` is relative, resolve against `importerDir`;
    if absolute, use as-is. Throw a clear error if the file does not exist.
  - A module **cache** keyed by resolved absolute path, storing finished
    results (`{ ast, type, value }` as needed by each consumer) — **not** shared
    mutable substitution/type state (that was what made the old cache unsound).
  - An **in-progress set** for cycle detection → clear `Import cycle: a -> b -> a`
    error.
- **Thread the importing file's directory** through both pipelines:
  - Add a `currentDir` (or `currentFilePath`) to `TypeState` and to the
    `Evaluator`. Set it when a file is loaded (CLI/REPL/file runner); fall back
    to `process.cwd()` for `-e` and REPL input that has no source file.
  - Resolve imports against `currentDir`, and set the imported module's own
    `currentDir` to its directory while checking/evaluating it (so nested
    imports chain correctly).
- **`typeImport` / `evaluateImport`** delegate to the resolver + cache instead
  of raw `fs.readFileSync(path.resolve(...))`.
- **Tests:**
  - A module in a nested directory that imports a sibling — works only with
    file-relative resolution (would fail under the old CWD behavior).
  - A→B→A cycle produces a clear error rather than infinite loop / stack blow.
  - A module imported twice is read/evaluated once (assert via a counter or
    an effect run once).
  - Regression: existing `examples/*_module.noo` imports still work from repo
    root.

### Phase 2 — Module roots / named paths

Resolve **non-relative** specs from a project root or small search path so
`import "std/list"` works from anywhere in the tree.

**Design decision (needs a call):**
- (a) **Project-root marker** — nearest ancestor directory containing a marker
  (e.g. `noolang.json` or `.noolang-root`); non-relative specs resolve from
  there. *Recommended default.*
- (b) **Search path** — an env var / CLI flag list of roots (like `NODE_PATH`).
- (c) Convention-only — a reserved `std/` prefix mapping to the bundled stdlib
  dir, everything else relative.

Recommendation: (a) + relative paths covers the common cases with the least
magic; (b) can be layered on later.

### Phase 3 (optional) — Namespacing

Qualified access beyond record destructuring (e.g. `Math.add`), if desired.
Deferred until Phases 1–2 land and we see whether destructuring is enough.

## Key files

- `src/module-resolver.ts` — **new**, shared resolution + cache + cycle detection.
- `src/typer/type-inference.ts` — `typeImport` uses the resolver; `TypeState`
  gains `currentDir`.
- `src/evaluator/evaluator.ts` — `evaluateImport` uses the resolver; `Evaluator`
  tracks `currentDir`.
- `src/typer/types.ts` — `TypeState` shape (`currentDir`).
- `src/cli.ts` / `src/repl.ts` — set `currentDir` from the file being run
  (CWD fallback for `-e`/REPL).

## Risks

- **`TypeState` surface change.** Adding `currentDir` touches state
  construction and every entry point that builds a `TypeState`. Mechanical but
  broad; do it in one pass with a sensible default.
- **Cache soundness.** The previous cache was removed because it shared mutable
  substitution state across modules. This cache must store *finished* results
  (fully-substituted types / evaluated values) keyed by absolute path, and each
  importing context instantiates from those results as if freshly imported —
  no shared mutable type state.
- **REPL / `-e` with no file.** Must keep working via a CWD fallback; add a test
  for `import` from `-e`.

## Suggested execution order

1. `module-resolver.ts` with resolution + existence errors + unit tests.
2. Thread `currentDir` (default CWD) through `TypeState` and `Evaluator`; wire
   `typeImport`/`evaluateImport` to the resolver. File-relative tests.
3. Add caching + cycle detection + tests.
4. Phase 2 root resolution once the convention is chosen.
