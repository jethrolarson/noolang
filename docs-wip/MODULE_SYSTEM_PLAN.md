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

Resolve **bare** (non-relative) specifiers so `import "std/list"` works from
anywhere in the tree, without a `node_modules`-style algorithm.

**Decided (per the design principles above): Deno-style explicit resolution.**
- **Relative specifiers must start with `./` or `../`** and resolve against the
  importing file. A specifier without that prefix is *never* a sibling file.
- **Bare specifiers resolve through a single import map** — an optional project
  file (e.g. `noolang.json`) mapping names/prefixes to paths, plus a built-in
  `std/*` → bundled stdlib mapping. One source of truth; no directory walking,
  no per-package manifest resolution, no `index.noo` magic.
- A missing/omitted import map means only `std/*` and relative imports resolve;
  bare non-`std` specifiers error clearly ("no import-map entry for X").

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
