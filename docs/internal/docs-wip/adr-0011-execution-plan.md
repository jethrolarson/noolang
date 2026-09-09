# ADR 0011 execution plan: structural `Eq`

This is a handoff for an implementation agent. It translates
[`adr_0011.md`](../adrs/adr_0011.md) into work against the current interpreter; it
is not a second design document. Keep the ADR's boundary: derive only `Eq`, do
not permit structural `implement` heads, and prefer rejecting a comparison over
accepting one whose components are not actually `Eq`.

## Current repository reality

Verified against the repository on 2026-09-04:

- `==` and `!=` are already typed as `a -> a -> Bool given a implements Eq` in
  `src/typer/builtins.ts`. `typeBinary` in `src/typer/type-inference.ts` calls
  `tryResolveConstraints` and rejects an unresolved fully concrete operand.
- `tryResolveConstraints` in `src/typer/constraint-resolution.ts` reduces
  `implements` to a nominal registry lookup after a local `getTypeName`. That
  helper returns `null` for tuples and records. A declared variant without an
  explicit instance also misses.
- Direct calls such as `equals x y` take the separate
  `resolveTraitFunction` / `handleFullTraitFunctionApplication` route in
  `src/typer/trait-system.ts` and `src/typer/trait-function-handling.ts`.
  `resolveTraitFunction` currently represents only a concrete registered
  implementation or a miss; the success path expects an implementation AST to
  type. Derived resolution therefore needs an explicit result shape rather than
  a fake registry entry or generated AST.
- Runtime `==` / `!=` in `src/evaluator/evaluator.ts` handles primitive values,
  then calls `resolveTraitFunctionWithArgs("equals", ...)`. Direct `equals`
  calls also reach that resolver. Runtime dispatch maps constructor names back
  to declared variant names through `constructorVariants`; imports merge this
  information from `ModuleCache.adtDiff`.
- Runtime tuples, records, and constructors retain exactly the component data
  needed for derivation (`TupleValue.values`, `RecordValue.fields`, and
  `ConstructorValue.name/args`). They do not retain static `Type` values.
- `TypeState.adtRegistry` contains each variant's ordered type parameters and a
  constructor-to-payload-types map. `typePattern` in
  `src/typer/pattern-matching.ts` demonstrates how to substitute a concrete
  variant's arguments into those payload types.
- ADR 0010's guard is `nominalImplementationTarget` in
  `src/typer/type-inference.ts`. It currently rejects tuple and record
  implementation heads. Structural derivation does not require changing it or
  module-manifest coherence keys.
- `TraitImplementation.givenConstraints` is stored but not enforced; the source
  still has `// TODO: Validate given constraints are satisfied`. Consequently,
  `[fn x => x] == [fn x => x]` currently infers `Bool` merely because a nominal
  `Eq List` entry exists. This matters to ADR 0011: a tuple containing that list
  is not soundly `Eq` just because the outer registered instance exists.
- `std/json.noo` currently has an explicit `Eq JsonValue`; its array arm already
  uses `xs == ys`, while its object arm still uses `primitive_list_all2` because
  `{String, JsonValue}` has no `Eq`. `json.test.noo` already has end-to-end
  equality cases. `stdlib.test.noo` has a now-temporary comment saying tuples
  cannot be compared.

Baseline probes (all run with `NO_COLOR=1 bun src/cli.ts --types`):

| Probe | Current result |
| --- | --- |
| `{1, "a"} == {1, "a"}` | `No implementation found for operator ==` |
| `{@a 1} == {@a 1}` | `No implementation found for operator ==` |
| `variant V = A Float \| B String; (A 1) == (A 1)` | `No implementation found for operator ==` |
| `[fn x => x] == [fn x => x]` | **incorrectly accepted as `Bool`** |

## Required semantic primitive

Introduce one type-level answer to “does this concrete type satisfy this
trait?”, and make both operator constraint resolution and direct trait-function
resolution use it. Do not add three loosely equivalent checks: recursive
variants and explicit-instance precedence will otherwise drift between `==`,
`!=`, and `equals`.

A reasonable shape is a pure helper near the trait system:

```ts
type TraitSatisfaction =
  | { kind: 'registered'; implementation: TraitImplementation }
  | { kind: 'derived-eq' }
  | { kind: 'unresolved' }
  | { kind: 'missing' };
```

The exact API is not prescribed, but it must preserve these distinctions:

1. unresolved type variables keep a constraint rather than fail;
2. a matching registered instance takes precedence over derivation;
3. tuple/record/declared-variant `Eq` may be derived only when all required
   component types satisfy `Eq`; and
4. a concrete non-`Eq` type is a hard miss.

Structural satisfaction rules:

- Apply the current type substitution and erase aliases with the existing alias
  resolution before inspection. An alias whose underlying type is an eligible
  tuple or record derives through that underlying shape; do not add alias
  identity, alias-specific registry entries, or an alias rejection path.
- Tuple: recurse over every element.
- Record: recurse over every field value; field order is irrelevant.
- Declared variant: find it in `adtRegistry`, substitute the concrete variant
  arguments for the ADT's type parameters in **every constructor's** payloads,
  then recurse over every payload. Checking only the constructor visible at a
  call site would make `Eq` depend on the current value and contradict the ADR.
- Recursive variants: memoize by `(trait, resolved type)` with an in-progress
  state. Treat a back-edge as provisionally satisfied, but commit success only
  after all non-cyclic leaves succeed. For example, recursion must not hide a
  function payload in another constructor.
- Other resolved shapes: use a registered instance or fail. Do not add
  structural derivation for lists, unit, functions, or unions under this ADR.
  Erased aliases are not a separate shape and follow their resolved underlying
  type as described above.

### Registered conditional instances are a required prerequisite

The registered-instance branch must honor `givenConstraints`; otherwise the
new recursive check is unsound at `List`, `Option`, and `Result`, and the ADR's
“components are all `Eq`” condition is false in production.

The registry currently discards the implementation target shape and keeps only
its nominal key. Preserve the checked `implementationTarget` on
`TraitImplementation` (for example as `targetType`) so satisfaction can match a
concrete `List a` / `Option a` / `Result a b`, obtain bindings, substitute those
bindings into `givenConstraints`, and recursively satisfy each `implements`
leaf. Ensure cloning/module-cache transport retains that field; caches already
carry `TraitImplementation` objects, so no new coherence identity or manifest
key should be needed.

`and` means all clauses. Existing `or` semantics are not defined by ADR 0011;
do not silently treat it as `and` by reusing the current `flattenConstraintExpr`.
If an existing conditional `Eq` uses `or`, stop and get a language-level
decision. Current stdlib `Eq` instances use only a leaf or `and`.

An explicit `Eq V` remains the selected definition even when structural
fallback would be possible. If its substituted `given` clause is unsatisfied,
`V` has no usable `Eq`; do not bypass the explicit instance by deriving one.
That is the operational meaning of “suppresses it.”

## Implementation sequence

Follow TDD: add the focused tests below and see the intended failures before
changing production code.

1. **Centralize type-level satisfaction.** Add the recursive, cycle-safe query
   and registered-conditional matching. Replace the nominal-only decision in
   `tryResolveConstraints` without changing its existing multi-constraint
   substitution behavior.
2. **Represent derived direct dispatch.** Extend `resolveTraitFunction`'s result
   so `equals` on an eligible structural type reports `derived-eq` without an
   implementation AST. In `handleFullTraitFunctionApplication`, type that case
   from the already-freshened trait signature and argument unification; its
   result is `Bool`. Keep ordinary trait dispatch unchanged.
3. **Add one runtime equality operation.** Put component comparison in one
   evaluator helper used by both the binary operator fallback and
   `resolveTraitFunctionWithArgs`'s direct-`equals` fallback:
   - first dispatch a registered `Eq` implementation for the value's nominal
     runtime type;
   - otherwise tuple: same arity and pairwise recursive equality;
   - record: identical key sets and pairwise recursive equality by key;
   - declared variant: same constructor name, same payload arity, and pairwise
     recursive equality;
   - shape/constructor mismatch returns `False` rather than throwing;
   - unsupported same-shape values still produce the existing no-instance
     error.

   Do not compare nested payloads with raw JavaScript equality. Each recursive
   component comparison must try nominal `Eq` first so a user instance (for
   example normalized-key equality) remains observable. Also avoid the current
   broad `try/catch` pattern around an implementation call: an exception thrown
   *inside* a selected user `equals` must not be mistaken for “no instance” and
   replaced by derived behavior.
4. **Preserve runtime variant identity across modules.** Reuse
   `constructorVariants` and imported `adtDiff`; do not add type objects to every
   runtime value. Add an import regression to prove this path rather than
   assuming local-only constructor registration covers it.
5. **Simplify JSON only after derivation passes.** Remove the explicit
   `implement Eq JsonValue` from `std/json.noo`; structural derivation then
   covers `JArray (List JsonValue)` and
   `JObject (List {String, JsonValue})`. Keep `primitive_list_all2` itself: it is
   still used by stdlib's registered `Eq List` implementation. Update/add JSON
   equality tests to prove nested arrays and objects recurse through the derived
   variant.
6. **Update stale tests/docs.** Replace `stdlib.test.noo`'s “tuples have no Eq”
   comment and add an association-list structural equality assertion. Do not
   change ADR 0010's guard or diagnostics.

## Focused acceptance matrix

Use `test/utils.ts` (`runCode`, `parseAndType`, `expectSuccess`, `expectError`)
rather than constructing the pipeline manually.

### Positive typing and runtime

- Tuple and direct method: `{1, "a"} == {1, "a"}` and
  `equals {1, "a"} {1, "a"}` are `Bool` / `True`.
- Tuple inequality and `!=`: unequal payloads produce the expected booleans.
- Record equality is independent of source field order.
- Nested mixed shape: a record containing a tuple containing a declared variant
  compares correctly.
- Variant constructors: equal payloads compare `True`; different constructors
  of the same variant compare `False`.
- Generic variant: `Box Float` derives when `Float` is `Eq`.
- Erased alias: `type Pair = {Float, String}` (and equivalently a record alias)
  compares through its underlying structural type. This must not require or
  create alias runtime identity.
- Recursive variant: a tree-like variant with tuple/record children compares at
  multiple depths without resolver recursion overflow.
- Explicit override precedence: an explicit `Eq` for a structurally derivable
  variant whose `equals` intentionally differs from structural equality is used
  both at top level and when nested in a tuple/record.
- `std/json`: equal and unequal nested arrays/objects pass after removing its
  explicit implementation, including through an importer.

### Required rejection cases

Assert type errors, not runtime failures:

- tuple containing a function;
- record containing a function;
- `Box (a -> a)` or another generic variant instantiated with a function;
- a variant with one comparable constructor and a different constructor that
  has a function payload (the whole variant is not `Eq`);
- nested `List` / `Option` / `Result` whose conditional `Eq` requirement is not
  met. Test both `[fn x => x] == [fn x => x]` and the direct
  `equals [fn x => x] [fn x => x]`; these are separate typer paths and both
  currently risk a nominal-registry false positive;
- differently typed tuple elements remain a unification error, not `False`.

### Defensive runtime shape cases

Where the typed language cannot naturally construct two operands of the same
static type but different product shape, test the extracted pure runtime helper
rather than weakening type checking: tuple arity mismatch, record key-set
mismatch, and constructor/payload-arity mismatch all return false.

## Validation gate

Focused tests are necessary but not sufficient. Before declaring the ADR
implemented, run:

```sh
AGENT=1 bun test
bun src/cli.ts test stdlib.test.noo
bun src/cli.ts test json.test.noo
bun run typecheck
node validate_examples.js
```

Then manually inspect exact inferred output (not only exit status):

```sh
NO_COLOR=1 bun src/cli.ts --types '{1, "a"} == {1, "a"}'
NO_COLOR=1 bun src/cli.ts --types '{@x 1, @nested {"a", Some 2}} == {@nested {"a", Some 2}, @x 1}'
NO_COLOR=1 bun src/cli.ts --types 'variant Tree = Leaf Float | Branch {Tree, Tree}; (Branch {Leaf 1, Leaf 2}) == (Branch {Leaf 1, Leaf 2})'
NO_COLOR=1 bun src/cli.ts --types 'variant Box a = Box a; {Box 1, {@x "ok"}} == {Box 1, {@x "ok"}}'
```

Each should report `Bool`. Also rerun both function-list forms and confirm
no-`Eq` type errors:

```sh
NO_COLOR=1 bun src/cli.ts --types '[fn x => x] == [fn x => x]'
NO_COLOR=1 bun src/cli.ts --types 'equals [fn x => x] [fn x => x]'
```

## Risks and stop conditions

- **Conditional instances are currently aspirational.** Implementing only the
  three structural cases will go green on simple examples while accepting
  nested non-`Eq` components. Treat the function-list negative as a release
  gate. If honoring `givenConstraints` is judged outside ADR 0011, pause and
  refine the ADR rather than shipping the weaker claim.
- **Two type-dispatch paths exist.** Tests must cover both infix operators and
  direct `equals`; fixing only `tryResolveConstraints` or only
  `resolveTraitFunction` leaves the other wrong.
- **Runtime has values, not static types.** Static satisfaction must remain the
  authority for eligibility; runtime derivation performs the selected
  operation and defensive shape checks. Do not attempt to reconstruct generic
  type arguments from payload values.
- **Cycles need a tri-state cache.** A plain visited-set returning `true` can
  let a recursive branch mask a non-`Eq` leaf; no cycle guard can overflow on
  `JsonValue`/trees.
- **Exception swallowing breaks user semantics.** Separate “lookup missed”
  from “selected implementation threw.” This is observable once nested
  structural comparison delegates to explicit instances.
- **Do not disturb unrelated working-tree edits.** At preparation time,
  `docs/internal/adrs/adr_0000.md`, `docs/internal/adrs/adr_0011.md`, and
  `std/json.noo` already contain uncommitted human work. Re-read the live diff
  before implementation and preserve it.
