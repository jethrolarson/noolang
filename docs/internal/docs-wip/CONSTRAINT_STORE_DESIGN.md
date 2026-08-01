# Structural constraint store — design note

Status: **landed**, except where noted below. Written 2026-07-11 after PRs #121
and #122; delivered by #123 (store), #124 (composition), #125 (error messages)
and #126 (cleanup).

What shipped, against the plan below:

- Steps 1–2 (store, then composition driven from it): done, #123 and #124.
  `generateDepthFirstConstraints` is deleted.
- Step 3 (`constraint-resolution` reads the store): done in the form that
  mattered — unification now collects constraints from the store as well as the
  objects, and the `findResultVariable` trap described under Hazards is deleted.
- Step 4 (remove constraint mutation from `unify`; drop `.constraints` from
  variable objects): **not done, deliberately.** The store is authoritative and
  enforcement reads both sources, so identity divergence can no longer drop a
  constraint — the bug this was meant to prevent. Actually removing the object
  path means rewiring the type printer and `propagateConstraintToTypeVariable`
  for zero behavioural gain, in an area that goes green and wrong. Worth doing
  only alongside a reason to touch those two.

One landmine remains, unreached: nested structures cannot arrive at unification
today (composed constraints live on function types, not on variables), so the
recursive validator added in #126 is exercised by direct unit tests rather than
by any expression. If a future change routes a composed constraint through
`unifyVariable`, that path is ready — but nothing proves it end to end.

The rest of this note is the original proposal, kept for the reasoning.

## The goal

Make chained accessors infer:

```
fn p => getCity (getAddress p)
  want:  a -> b given a has {@address {@city b}}
  today: a -> b            (constraint lost entirely)
```

And make the inline form stop lying:

```
fn obj => @name (@user obj)
  want:  a -> b given a has {@user {@name b}}
  today: a -> b given a has {@user {@name c}}     ← c is a RANDOM var, unrelated to b
```

## How structural constraints work today

Three facts, each verified against the code:

**1. Constraints live on type-variable objects, and propagate by mutation.**
`typeAccessor` (`type-inference.ts:1337`) attaches a `has` constraint to the
accessor's own parameter variable object. When the accessor is applied, `unify`
merges that constraint into the argument's variable object
(`unify.ts:466-472`). Propagation is therefore a side effect on a shared object,
keyed by **object identity**, not by variable name.

**2. `TypeState.constraints` is dead.** The field is declared
(`types.ts:48`) and initialised to `[]` (`type-operations.ts:402,413`). Nothing
ever writes to it or reads it. There is **no name-keyed constraint store**.

**3. `constraint-composition.ts` is a dead module.** It exports
`composeStructuralConstraints` (nests an outer constraint's structure into the
inner constraint's connecting field) and `extractResultTypeVar` (finds the leaf
variable). Both are correct. Both are unit-tested in isolation by
`__tests__/constraint-composition.test.ts`. **Neither is imported by the typer.**

Instead, `generateDepthFirstConstraints` (`type-inference.ts` ~L2008)
reimplements composition — badly:

- it pattern-matches only the *syntactic* shape `@outer (@inner param)`, so a
  chain through let-bound accessors (`getCity (getAddress p)`) never composes at
  all; and
- it mints the result variable with `Math.random()`, so the composed
  constraint's leaf is disconnected from the function's actual return variable.
  That is the `c` in the "today" line above.

## Why this is now actively fragile

Identity-keyed propagation was survivable while nothing copied constraint
structures. PR #121 added `freshenRecordStructure` (`type-operations.ts`), which
deep-copies a constraint's field types on instantiation — correctly, to keep the
leaf variable linked to the freshened return type. But it means a constraint's
`α216` and the `α216` that `unify` later mutates can now be **different
objects**. The scheme depends on an invariant that the code no longer maintains.

This is the mechanism behind the chained-accessor failure: in
`getCity (getAddress p)` the connecting variables end up **unbound**, and the
return variable is never linked to the city field.

## Proposed design

Replace identity-keyed mutation with a name-keyed store, then wire the
composition primitive that already exists.

**1. Give `TypeState.constraints` a real type and use it.**

```ts
constraints: Map<string, Constraint[]>   // type-variable name -> its constraints
```

Resolve a variable's constraints by walking the substitution to the variable's
representative name, then reading the map. Object-identity divergence stops
mattering, because nothing depends on identity any more.

**2. Record constraints by name.** `typeAccessor` registers
`recordVar.name -> has {field: fieldVar}` in the store. `unify`, when binding
variable `x := y`, unions `x`'s constraints into `y`'s entry (names, not
objects).

**3. Compose transitively at function-type construction.** For a parameter
variable `P`, walk its constraint's fields; for a field whose type is a variable
`V` that itself has a `has` constraint in the store, nest via the existing
`composeStructuralConstraints`. Recurse. The leaf variable is then genuinely the
body's result variable — no random var, and it works for let-bound chains
because it follows the constraint graph rather than the syntax tree.

**4. Delete `generateDepthFirstConstraints`.** Step 3 subsumes it. Its only
reason to exist was the absence of a constraint graph to walk.

**5. Keep the `buildNormalFunctionType` lift guard from #122** — a constraint is
lifted onto the function type only when its leaf variable *is* the function's
return variable. With real composition, `extractResultTypeVar` is exactly the
predicate needed.

## Migration — incremental, each step green

The store can be introduced alongside the existing mechanism and cut over once,
rather than in a big bang:

1. Add the name-keyed store and populate it in `typeAccessor` and `unify`,
   **without** removing the object-level constraints. Behaviour unchanged; assert
   in tests that store and objects agree.
2. Switch `buildNormalFunctionType`'s lift to read the store and compose via
   `composeStructuralConstraints`. Chained accessors should start resolving.
   Delete `generateDepthFirstConstraints`.
3. Switch `constraint-resolution.ts` to read the store.
4. Remove constraint mutation from `unify` and the `.constraints` field from
   variable objects, once nothing reads them.

Steps 3 and 4 are optional cleanup; the inference win lands at step 2.

## Hazards

**Constraint code goes green and wrong at the same time.** This area has no test
coverage that defends correctness of the *inferred type* — only that inference
does not crash. The first attempt at PR #122 lifted partial constraints and made
`fn person => getCity (getAddress person)` infer the **address record** instead
of the city `String`: a confidently wrong type where the prior behaviour was an
honest unresolved variable. It was caught only because two pre-existing tests
happened to pin the old shape.

Rules:

- **Prefer incomplete over incorrect.** `List a` is an acceptable outcome. A
  wrong concrete type is not.
- Never lift or resolve a *partial* structural constraint. Only a constraint
  whose leaf variable is the function's return variable determines the result.
  Note `findResultVariable` in `constraint-resolution.ts` binds a bare return
  variable to the **first** substituted field variable — for a partial
  constraint that is simply the wrong field. It is a trap; the composition work
  should aim to retire it.
- Verify by reading inferred types, not by watching the suite pass:
  `NO_COLOR=1 bun src/cli.ts --types '<expr>'`.

## Done means

These probes, checked as type strings — not merely "tests pass":

```
fn obj => @name (@user obj)                        a -> b given a has {@user {@name b}}
getAddr = @address; getCity = @city;
  fn p => getCity (getAddr p)                      a -> b given a has {@address {@city b}}
p = {@name "A", @address {@city "NYC"}};
  getCity (getAddr p)                              String
map @name [{@name "bob"}]                          List String     (must not regress, #121)
map (fn p => @age p) [{@age 3}]                    List Float      (must not regress, #122)
```

Plus: suite green, `bun run typecheck` clean, `node validate_examples.js` exit 0.
