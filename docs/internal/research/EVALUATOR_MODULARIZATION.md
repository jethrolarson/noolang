# Evaluator modularization: dependency map and phased plan

Status: research/proposal only; no refactor is implemented here.

Scope inspected: `src/evaluator/evaluator.ts` at 3,465 lines, its value model in
`evaluator-utils.ts`, `module-loader.ts`, direct callers, ADR 8, and evaluator-facing
tests. Line numbers below describe the file as inspected and will drift; symbol names
are the durable identifiers.

## Recommendation

Decompose the evaluator, but keep `Evaluator` as the public facade and as the owner of
execution state. Start with recursion analysis, trace formatting, and pattern matching,
then extract the native-builtin catalogue before
extract trait dispatch and imports behind narrow callback-based contexts. Extract the
operator evaluator only after those dependencies exist. Do **not** split handlers into
one file per AST node, move the trampoline independently, or introduce a general
visitor/framework: those changes would distribute the current coupling rather than
remove it.

A reasonable end state is:

- `evaluator.ts`: the `Evaluator` facade, state ownership, central expression dispatch,
  closure/application/trampoline machinery, program entry points, and small handlers;
- `builtins/`: ordered construction of native values, divided by language domain;
- `trait-dispatch.ts`: runtime trait lookup/application/equality;
- `runtime-imports.ts`: runtime import resolution and cache-result merging;
- `operators.ts`: binary and pipeline semantics;
- `pattern-matching.ts`: runtime pattern matching and binding collection;
- `recursion-analysis.ts`: recursive-reference detection;
- `trace-format.ts`: expression rendering for execution traces;
- `evaluator-utils.ts` (or a later, compatibility-managed rename): runtime value types,
  guards, constructors, cells, and value rendering.

This leaves the most execution-sensitive code together. In particular, the closure
owner check, environment switching, and duplicated tail-position evaluator should
remain one review unit.

## Existing architecture and real seams

### Public and compatibility surface

`evaluator.ts` exports:

- `ExecutionStep` and `ProgramResult`;
- `Evaluator`;
- compatibility re-exports of selected `evaluator-utils` value types, constructors,
  and guards.

Repository consumers instantiate `Evaluator` in `src/repl.ts`, `src/module-loader.ts`,
`test/utils.ts`, several focused tests, and `scripts/mcp-provider.ts`. Public members in
actual use are `evaluateProgram`, `evaluateProgramForAssertions`,
`evaluateExpression`, `getEnvironment`, `environment`, and `traitRegistry`.
`module-loader.ts` specifically requires public `evaluateExpression` and
`traitRegistry` to capture module-local trait implementation closures after evaluation.
The constructor's injected `fs`/`path`, `skipStdlib`, and `programArgs` options are also
observable compatibility surface even though there is no named exported options type.

Therefore internal modules should not become additional public API during the move.
Keep imports from `src/evaluator/evaluator` working, retain the current constructor and
members, and let the facade delegate internally. A later API decision may deprecate the
compatibility re-exports, but modularization should not do so.

### State ownership

The class owns six distinct kinds of state/dependencies:

1. `environment`: the current lexical environment (`Map<string, Value | Cell>`). It is
   intentionally replaced, not merely mutated, during calls/scopes.
2. `environmentStack`: prior map identities used by `withNewEnvironment`. Its `finally`
   restoration is part of exception behavior.
3. `currentFileDir`: sticky per-evaluator import context, set by either program entry
   point. Imported closures need their defining evaluator's value, not the caller's.
4. `constructorVariants`: runtime constructor-name to variant-type mapping used by trait
   dispatch and structural equality. Definitions and imports both mutate it.
5. `traitRegistry`: supplied from the typer, externally visible, and mutated when an
   import merges trait metadata/implementations. Implementation entries may hold both
   AST bodies and captured runtime closures.
6. Platform/bootstrap dependencies: injected `fs` and `path`, `programArgs`, plus
   currently global `console`, `process.exit`, `Math.random`, and `execFileSync`.

The environment has semantics that a generic “context object” can easily break:
closures snapshot the map but retain shared `Cell` identities; recursive top-level
bindings install a cell before closure creation; function calls temporarily replace the
current environment; and the trampoline repeatedly switches to a target closure's
captured environment. Keep the class as owner. Extracted modules should receive the
minimum operations they need (`evaluate`, `bind`, trait dispatch, module load), not a
writable bag containing all evaluator fields.

### Runtime coupling graph

The principal dependencies are:

- `Evaluator` -> AST and runtime values for every expression;
- constructor -> native builtins -> stdlib parsing/evaluation in the same environment;
- expression dispatch -> every handler;
- function/application/trampoline -> environment stack, closure snapshots, evaluator
  identity, and recursive expression dispatch;
- binary/pipeline evaluation -> recursive evaluation, runtime values, and trait
  dispatch;
- trait dispatch -> mutable `TraitRegistry`, constructor-to-variant mapping, recursive
  evaluation of AST fallback implementations, and callable application;
- import evaluation -> current directory, injected filesystem/path for the legacy mock
  path, singleton module cache results, constructor metadata, and mutable trait registry;
- `module-loader.ts` -> `Evaluator` to evaluate exports and capture trait closures, while
  evaluator import handling lazily `require`s `module-loader.ts` to avoid a static cycle.

The last point is not incidental. The module loader type-checks and evaluates a module,
and an evaluated module can import another module. Moving `require('../module-loader')`
to a top-level static import as cleanup would recreate a cycle without changing the
ownership model.

### Cohesive regions in the current file

| Current symbols/region                                                              |           Approx. lines | Cohesion and coupling                                                                                                                                                               |
| ----------------------------------------------------------------------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flattenStatements`, `TailCall`, `isTailCall`, builtin helpers                      |                 121-156 | Small helpers; only `TailCall` is trampoline-private.                                                                                                                               |
| `initializeBuiltins`                                                                |                190-1457 | One ordered native-value catalogue. Large, but most entries depend only on runtime values; a few call trait dispatch or injected `fs`.                                              |
| `loadStdlib`                                                                        |               1459-1496 | Bootstrap orchestration. Must run after every native binding and in the evaluator's environment. Uses a deliberately different recursive sequence flattener from assertion tracing. |
| `evaluateProgram`, `evaluateProgramForAssertions`                                   |               1498-1608 | Stable public entry points; differ in trace granularity and type inclusion.                                                                                                         |
| definitions/destructuring/mutation                                                  |               1610-1812 | Environment mutation and recursive-cell semantics. Destructuring walkers are otherwise cohesive.                                                                                    |
| `evaluateExpression` and literals/variables                                         |               1814-1978 | Central dispatch and primitive evaluation.                                                                                                                                          |
| `runTrampolined`, `evaluateTailPosition`, `evaluateFunction`, `evaluateApplication` |               1982-2231 | A single execution-critical unit; owner identity and environment maps are load-bearing.                                                                                             |
| `evaluatePipeline`, `evaluateBinary`                                                |               2233-2649 | Operator semantics with a narrow dependency on recursive evaluation and trait application.                                                                                          |
| imports                                                                             |               2680-2814 | Module boundary and compatibility path; mutates variant/trait metadata.                                                                                                             |
| records/accessors/where                                                             |               2816-2873 | Small handlers; `where` is mirrored inside tail evaluation.                                                                                                                         |
| `containsVariable`                                                                  |               2875-2943 | Pure AST query despite being a method.                                                                                                                                              |
| environment stack and `getEnvironment`                                              |               2946-2975 | State ownership; keep in facade/core.                                                                                                                                               |
| `expressionToString`                                                                |               2977-3037 | Pure trace presentation despite being a method.                                                                                                                                     |
| trait dispatch/equality/type naming                                                 | 3040-3215 and 3432-3464 | Cohesive runtime trait subsystem with explicit evaluator callbacks.                                                                                                                 |
| runtime ADTs and matching                                                           |               3217-3405 | Constructor registration mutates state; pattern matching itself is pure.                                                                                                            |
| `ensureMonadicResult`                                                               |               3408-3429 | Unreferenced in the inspected tree. Verify, then remove separately rather than moving it.                                                                                           |

### Builtin sub-seams

`initializeBuiltins` is not irreducibly one unit. Its existing contiguous categories
support an ordered catalogue:

- core operators/callable composition (`+` through `$`, roughly 192-469);
- list/collection operations (`list_get` through `zip`, roughly 471-713);
- math, output, strings, `argv`, unknown and record utilities (roughly 714-957);
- tuple/Option/Result helpers (roughly 958-1050);
- effects and process/mutation natives (`println` through `exec`, roughly 1052-1205);
- primitive trait support and schema predicates (roughly 1207-1456).

Some category labels in comments are historical rather than architectural. For example,
callable composition and list higher-order functions can dispatch trait functions, and
`primitive_list_all2` lives among primitive trait helpers. Preserve names and insertion
order first; reorganize by semantics only after tests can compare the catalogue.

### Boundaries that are not safe yet

- **Trampoline versus normal expression handlers.** `evaluateTailPosition` deliberately
  duplicates `if`, `match`, `where`, sequence, and application behavior. ADR 8 records
  that an extra shared helper frame caused a borderline stack overflow. Moving those
  mirrored handlers independently risks both semantic drift and stack regressions.
- **Environment as a generic service.** Exposing setters/push/pop to every handler would
  turn private temporal invariants into a broad internal API.
- **One module per expression kind.** Nearly every such module would take `evaluate`,
  environment mutation, and trait/import services, producing many cyclic or “god
  context” dependencies with little independent testability.
- **Unifying operator implementations with similarly named native bindings.** Binary
  `/` and `%` return `Option`; their native entries currently throw on zero. `==`/`!=`
  and arithmetic have special trait paths. Apparent duplication is not evidence of
  equivalent semantics.
- **Combining module loading with runtime imports during the first extraction.** The
  singleton cache, type-state work, recursive loading, evaluator ownership, and closure
  capture make this a semantic redesign, not file movement.
- **Moving/renaming `evaluator-utils.ts` early.** Internal imports now target it directly,
  while `evaluator.ts` intentionally retains downstream compatibility re-exports.

## Test coverage observed

The focused evaluator-related run covered 402 tests in 23 files and passed. Important
coverage includes:

- 103 broad evaluator tests in `src/evaluator/__tests__/evaluator.test.ts`;
- two dedicated `evaluateProgramForAssertions` trace-shape tests;
- 40 tail-call tests/contexts, including deep recursion, exact-once mutation,
  environment restoration, closure-environment switching, and cross-evaluator import
  ownership;
- operator, equality, structural equality, ADT, match, destructuring, and trait suites;
- module cache, cycle, purity, relative resolution, closure capture, imported variant
  dispatch, and custom/mock filesystem paths;
- file I/O, process execution, exit, character/string and stdlib behavior elsewhere in
  `test/`.

This is strong end-to-end regression coverage but weak seam coverage. One inspected
test-support discrepancy should remain out of scope for this refactor:
`clearModuleCache` clears `moduleCache` and `inProgress`, but does not reset
`_frozenBase` despite its comment claiming that it does. Correcting that can change test
isolation and bootstrap cost, so it needs a separate semantic patch.

Before moving a region, add characterization tests for what its new API must preserve:

- exact builtin key inventory before stdlib loading, insertion/override behavior, native
  names, currying shapes, representative error messages, and `argv` capture;
- constructor mapping updates from both local variants and imported `adtDiff`;
- trait dispatch preference for `evaluatedFunctions` over AST fallback, dispatch-index
  order (last argument then first), partial applications, and registry mutation identity;
- destructuring failure side effects (the current walker may bind earlier names before a
  later nested mismatch throws) and duplicate-pattern binding behavior;
- exception restoration for `match` and `where`, not only successful scope exit;
- repeated `evaluateProgram` calls with different file paths on one evaluator, because
  `currentFileDir` is sticky state;
- empty-program result/environment snapshots and the distinct trace contracts of both
  public entry points;
- direct `skipStdlib: true` evaluator construction, so builtin tests do not accidentally
  pass through stdlib replacements.

Do not make the modularization patch “fix” behavior exposed by those tests. Record bugs
separately and change them in a later semantic patch.

## Phased behavior-preserving plan

Each phase should be its own reviewable change. Run its focused tests first and the full
checks before merge. If a phase needs a semantic fix to proceed, stop and split that fix
out; “move plus cleanup” makes rollback and blame unreliable.

### Phase 0 — Freeze contracts and establish guardrails

**Changes**

- Add the missing characterization tests listed above, prioritizing builtin inventory,
  destructuring partial failure, trait closure preference, scope restoration on throw,
  and current-directory behavior.
- Add an internal test helper that constructs a typed evaluator consistently; continue
  using `test/utils.ts` for full pipeline tests.
- Record the exported surface in a compile-time test that imports all current
  `evaluator.ts` exports and exercises constructor options/public members.

**Target files**

- Focused lower-layer tests under `src/evaluator/__tests__/`.
- Full pipeline/import behavior under `test/**` according to repository convention.
- No production movement yet.

**Checks**

`AGENT=1 bun test`, `bun run typecheck`, and `node validate_examples.js`. Keep the deep
TCO suite in the run; a shallow evaluator suite cannot detect the stack-frame hazard.

**Ordering/rollback**

Land before all moves. Test-only and independently revertible.

**Risks**

Tests can accidentally canonize an unintended bug. Label such cases
`[characterization]` and assert only behavior required for a mechanical move (including
error text/side effects only where currently observable).

### Phase 1 — Extract recursion analysis, trace formatting, and pattern matching

**Move exact symbols**

- `containsVariable` (2875-2943) -> exported `containsVariable` in
  `recursion-analysis.ts`.
- `expressionToString` (2977-3037) -> exported `expressionToString` in
  `trace-format.ts`.
- `tryMatchPattern` (3281-3405) -> exported `matchPattern` plus `MatchResult` in
  `pattern-matching.ts`.
- Optionally move the local stdlib `flattenStatements` (121-126) to a narrowly named
  `flattenRuntimeStatements` in `runtime-statements.ts`; do not substitute the typer's
  `flattenStatements`, because parenthesized-sequence behavior intentionally differs.
- Verify `ensureMonadicResult` has no references and remove it in a separate tiny commit;
  do not create a module for dead code.

`Evaluator` calls these functions. The leaf modules import only AST types and runtime
value guards/types. They never import `Evaluator` and never mutate an environment.

**Compatibility**

No new public barrel exports and no changes to `Evaluator` methods. Preserve formatting
strings and matching's merge order exactly.

**Tests/checks**

Add direct unit tests for all AST/pattern cases and existing error/default branches;
then run evaluator, pattern, destructuring, literate trace, full test/typecheck/docs
checks.

**Ordering/rollback**

One helper family per commit if possible. This phase can be reverted file-by-file.

**Risks**

`expressionToString` is incomplete by design (`unknown` for several kinds); do not turn
this move into a formatter rewrite. `matchPattern` currently lets later recursive
bindings overwrite earlier names; preserve it.

### Phase 2 — Extract and then divide the builtin catalogue

**Step 2A: mechanical extraction**

Move `initializeBuiltins` (190-1457), `applyValueFunction` (144-151), and
`createHOFError` (154-156) to `builtins/index.ts` as
`createBuiltinEnvironment(deps): Environment`. `deps` should contain only the observed
external needs:

- injected `fs` and `programArgs`;
- `applyTraitFunctionWithValues` and `resolveTraitFunctionWithArgs` callbacks bound to
  the owning evaluator.

Continue using existing globals for console/process/random/`execFileSync` in this
behavior-only phase. Broadening platform injection is desirable for testing but is a
separate API/semantics decision. Constructor order remains: create builtin environment,
assign it as current environment, then `loadStdlib` into that same map.

**Step 2B: catalogue partition**

After Step 2A is green, split factories into:

- `builtins/core.ts` for operator/callable entries;
- `builtins/collections.ts` for list/collection entries, including
  `primitive_list_all2` if keeping its trait callback with collection code is clearer;
- `builtins/strings-records.ts` for string, record, tuple and schema helpers;
- `builtins/effects.ts` for print/log/file/process/random/mutation entries;
- `builtins/primitives.ts` for primitive trait implementation functions;
- `builtins/index.ts` to assemble ordered entry arrays into one map and add `argv`.

Factories should return entries rather than mutate evaluator state. Keep assembly order
stable and reject duplicate names in a test (or explicitly list intentional overrides).
Dependency direction is `Evaluator -> builtins/index -> category factories ->
evaluator-utils`; category modules know only the two trait callbacks they actually use.
No builtin module imports `Evaluator`.

**Compatibility**

Native names, values, errors, currying, `argv`, startup order, and all public evaluator
exports remain unchanged. Do not export category factories from the public evaluator
barrel.

**Tests/checks**

Use `skipStdlib: true` to assert exact key inventory and category behavior. Run builtin,
operator, stdlib, effect/file/exec/exit, equality/trait, evaluator, and full checks.
Include `stdlib.test.noo` through the repository's `noo test` path if available, because
it validates builtins as imported stdlib consumers.

**Ordering/rollback**

2A must land before 2B; do not simultaneously rename builtins or change error messages.
Each category split is independently revertible through `builtins/index.ts`.

**Risks**

Closures must retain the owning evaluator's trait behavior; passing unbound methods will
lose `this`. Returning a fresh map must not reorder or omit entries. Similar-looking
binary operators and native operator bindings must remain separate.

### Phase 3 — Extract runtime trait dispatch

**Move exact symbols**

Move `isTraitFunction`, `evaluateTraitFunctionApplication`,
`applyRegisteredTraitFunction`, `evaluateEquality`,
`resolveTraitFunctionWithArgs`, `getValueTypeName`, and
`applyTraitFunctionWithValues` (3040-3215, 3432-3464) to
`trait-dispatch.ts`.

Use a small `TraitRuntimeContext` containing:

- the shared `TraitRegistry` reference;
- `evaluateExpression(expr)` for the AST implementation fallback;
- `variantNameForConstructor(name)` for imported/local ADT identity.

Expose functions (or one small runtime object) for expression-argument application,
value-argument application, equality, and trait-function detection. Keep recursive
structural equality inside this module. `Evaluator` delegates; builtins and operators
receive only value-application/resolve callbacks.

Dependency direction: `Evaluator -> trait-dispatch -> evaluator-utils` and AST/trait
**types**. `trait-dispatch` must not import `Evaluator` or module loading.

**Compatibility**

Keep `traitRegistry` public and preserve its object identity. Preserve search order
through registry definitions, evaluated-closure preference, last-then-first dispatch
indices, partial-application threshold, constructor fallback naming, and error text.

**Tests/checks**

Run direct trait-dispatch tests plus all equality/operator/trait suites,
`cross-module-trait-dispatch`, module-loader closure tests, and full checks. Probe inferred
and runtime results for representative primitive, structural collection, local ADT, and
imported ADT cases; typer green alone does not prove runtime dispatch correctness.

**Ordering/rollback**

Do after builtins so trait callbacks are already explicit. Move without deduplicating
`evaluateTraitFunctionApplication` and `applyTraitFunctionWithValues`; deduplication can
follow only if tests prove their subtly different registry choices equivalent.

**Risks**

Evaluating an AST fallback in the wrong evaluator/environment breaks module-local helper
capture. Replacing the registry instead of sharing it breaks importer/type/evaluator
coordination.

### Phase 4 — Isolate runtime imports without redesigning module loading

**Move exact symbols**

Move `evaluateImportDirect` and `evaluateImport` (2680-2814) to
`runtime-imports.ts`. Define an `ImportRuntimeContext` with only:

- current file directory and path/fs operations;
- a child-evaluator factory for the legacy custom-fs path;
- a lazy `loadModule`/`resolveModulePath` adapter for the normal path;
- operations to register constructor variants and merge trait cache diffs;
- source-location/error construction inputs.

Keep the lazy module-loader adapter at the composition edge. `runtime-imports.ts` must
not import `Evaluator`; the facade supplies bound operations. Do **not** change
`module-loader.ts` cache semantics or its use of a distinct evaluator in this phase.

Dependency direction: `Evaluator -> runtime-imports`; `runtime-imports -> module-cache
interface` (prefer a type-only shape), with the lazy concrete adapter supplied from the
facade. `module-loader.ts -> Evaluator` remains temporarily. This makes the cycle visible
and narrow rather than pretending it is solved.

**Compatibility**

Preserve custom-fs detection by identity (`fs !== defaultFs`), extension/path rules,
stdlib behavior of child evaluators, cache identity, idempotent trait merging,
constructor metadata merging, and structured import error contents.

**Tests/checks**

Run `import_relative`, import error propagation, module-loader/resolution,
cross-module trait dispatch, imported ADT equality, and TCO cross-module ownership tests,
then full checks.

**Ordering/rollback**

After trait extraction, because import merge hooks then have a narrow owner. Keep direct
and cached import paths in one commit so dispatch cannot temporarily target two
implementations.

**Risks**

A static import can trigger initialization cycles. A child evaluator using caller state
or a caller trampoline executing an imported closure corrupts relative paths and trait
dispatch. Do not add cross-evaluator bouncing.

**Possible later cycle removal (not part of the mechanical phase)**

A separate design can split module type/cache construction from runtime realization and
inject an evaluator factory into the realization layer. That affects `typeImport`, cache
entry lifecycle, cycle detection, and callers of `loadModule`; it deserves its own ADR
and tests rather than being smuggled into file decomposition.

### Phase 5 — Extract operator evaluation

**Move exact symbols**

Move `evaluatePipeline` and `evaluateBinary` (2233-2649) to `operators.ts`. Export
`evaluatePipeline(expr, context)` and `evaluateBinary(expr, context)` with a narrow
context:

- recursive `evaluateExpression`;
- trait-function detection/value application/resolution/equality from Phase 3;
- lookup of a fallback native operator in the current environment.

All function values created for `|>`, `<|`, and pipeline composition must close over
those bound operations. `Evaluator.evaluateExpression` remains the central dispatcher.
`evaluateTailPosition` continues routing non-sequence binary expressions through normal
`evaluateExpression`, preserving ADR 8's frame behavior.

Dependency direction: `Evaluator -> operators -> trait-dispatch API and
evaluator-utils`; never `operators -> Evaluator`.

**Compatibility**

Preserve left/right evaluation order, short-circuiting, cell unwrapping, safe-thrush
wrapping, special primitive fast paths, trait fallback order, and distinct `/`/`%`
behavior. Do not merge `evaluatePipeline` with binary composition in this phase.

**Tests/checks**

Run every file under `test/features/operators/` and `test/features/equality/`, mutation
exact-once and TCO suites, then full checks. Add direct ordering tests with mutation for
short circuit, `$`, `|`, `|?`, and composition closure invocation.

**Ordering/rollback**

After trait extraction, otherwise the operator context would expose many evaluator
privates and become permanent coupling. Move pipeline and binary together because they
share composition semantics, but make no semantic cleanup.

**Risks**

Unbound callbacks, eager right-hand evaluation, and accidental use of native operator
entries in place of special paths are the main hazards. An extra helper frame in the
trampoline path is forbidden.

### Phase 6 — Extract binding walkers; stop before the trampoline

**Move exact symbols**

Move `evaluateTupleDestructuring`, `extractTupleElements`, `extractRecordFields`, and
`evaluateRecordDestructuring` (1629-1791) to `destructuring.ts` using only
`evaluateExpression` and `bind(name, value)` callbacks. Preserve immediate binding order
rather than changing to an atomic “return a Map then commit” design.

`matchPattern` is already in `pattern-matching.ts`; leave `evaluateMatch` in the core
because normal and tail-position match execution must remain visibly paired. Likewise
leave `evaluateWhere`, `evaluateIf`, `evaluateFunction`, `evaluateApplication`,
`evaluateTailPosition`, `runTrampolined`, environment stack methods, definition/mutation,
constructor registration, and `evaluateExpression` in `Evaluator`.

Dependency direction: `Evaluator -> destructuring -> evaluator-utils` and AST types.

**Compatibility**

Preserve exact mismatch errors, nested traversal/binding order, returned RHS value, and
partial environment mutation when a later binding fails.

**Tests/checks**

Run direct walker tests, all destructuring/pattern/where/mutation tests, TCO match/where
and environment restoration tests, then full checks.

**Ordering/rollback**

Last extraction. If the resulting `evaluator.ts` is maintainable, stop. File size is not
itself a reason to move the closure/trampoline unit.

**Risks**

An aesthetically cleaner atomic binding implementation is a behavior change. A generic
binding abstraction may also erase the distinction between immutable values and cells.

## Final dependency rule

Keep dependencies acyclic around the core wherever current module loading permits:

`Evaluator facade/core`

-> `builtins`, `operators`, `runtime-imports`, `trait-dispatch`, `destructuring`

-> `pattern-matching`, `recursion-analysis`, `trace-format`, `evaluator-utils`

Leaf modules never import the facade. Cross-cutting behavior is supplied as small bound
callbacks. `module-loader.ts -> Evaluator` plus the evaluator's lazy loader adapter is
the one documented cycle-shaped runtime relationship until a separate module-loader
redesign removes it.

## Completion criteria

The decomposition is complete when:

- `Evaluator` remains the only supported construction/entry facade;
- state ownership and trampoline code are still locally understandable;
- category modules can be unit-tested without parsing/type inference where appropriate;
- no extracted module imports `Evaluator` merely to call back into it;
- no broad `EvaluatorContext` exposes all state;
- public exports and runtime/error/trace behavior are unchanged;
- focused suites, full `AGENT=1 bun test`, `bun run typecheck`, and
  `node validate_examples.js` pass after every phase.

The goal is not the smallest possible `evaluator.ts`. It is to isolate stable semantic
subsystems while keeping the environment/closure/trampoline invariants in one place.
