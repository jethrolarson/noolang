# Bare `[]` literals share a hardcoded type-variable name across statements

Filed 2026-08-01, found while building `std/json.noo` (PR #165). Worked
around there with `list_filter (fn _ => False) [dummy]` in place of bare
`[]`; see `empty_json_array`/`empty_json_object` in that file.

## Symptom

A bare `[]` passed to two *different* constructors of the same recursive
variant, where the constructors' payloads are `List T` vs `List {String, T}`
(one bare, one tuple-wrapped), fails to unify — even across two unrelated
top-level bindings, order-independent. Minimal repro:

```
variant M = MA (List Float) | MO (List {String, Float});
x = MO [];
y = MA [];
x
```

```
TypeError: Cannot unify types
  Expected: Float
  Got:      (String Float)
```

Swap the definition order and the error flips to which one complains.

Confirmed boundaries:
- A **non-empty** list literal (`MO [{"", JN}]` / `MA [JN]`) never triggers
  it — same constructors, same variant, only the literal differs.
- Reusing the **same** constructor twice with `[]` (`x = MO []; y = MO []`)
  never triggers it — needs two different constructors.
- A variant with two constructors over bare `T` vs `{String, T}` **without**
  `List` (`variant M = MA Float | MO {String, Float}`) never triggers it —
  the bug is specifically in list-literal typing, not variant-application
  typing.

## Root cause

`typeList` in `src/typer/type-inference.ts`, the empty-list case:

```ts
if (expr.elements.length === 0) {
    // Empty list - we can't infer the element type
    return createPureTypeResult(listTypeWithElement(typeVariable('a')), state);
}
```

Every other placeholder-type site in this file mints a fresh type variable
via `freshTypeVariable(state)`, which returns a uniquely-named variable and
an incremented counter threaded through `state` (see lines 152-153, 432,
784, 1090, 1380/1382, 1808, 1849/1854, 1902, 1974, and the equivalent calls
in `pattern-matching.ts`/`trait-function-handling.ts`). This one site is the
exception: it hardcodes the literal name `'a'` via `typeVariable('a')`
(`src/ast.ts:639`) instead of generating a fresh one.

`state.substitution` is a single map keyed by variable *name*, threaded
through the entire top-level program (`unifyInternal` in
`src/typer/unify.ts` reads/writes it by `t.name`, e.g. `state.substitution.
get(currentVar.name)`). Because every bare `[]` produces a type variable
literally named `a`, two unrelated empty-list literals in different
top-level bindings collide on that name. Unifying `MO []` against `List
{String, Float}` binds `a ↦ {String, Float}` in the shared substitution.
That binding outlives the statement. When `MA []`'s `[]` — same literal name
`a` — later unifies against `List Float`, unify finds the stale `a ↦
{String, Float}` still in the map and fails against `Float`.

This explains every observed boundary: order-independence (whichever
binding runs first "wins" the collision and poisons the second); cross-
binding leakage (one substitution map, not scoped per statement); why
nonempty lists don't trigger it (their element type comes from real
inference, not the placeholder); why `List` is required (the bug is in
`typeList` specifically, not constructor-application typing); why two
different constructors are needed (`MO []; MO []` unifies the same payload
type both times, no conflict); and why a `List`-free variant doesn't trigger
it (no `[]` literal involved at all).

## Fix shape (not applied here — needs its own PR/review)

One-line fix, verified working during investigation for this doc (applied
temporarily, confirmed the repro above passes and infers `M` correctly,
then reverted so this bug doc's PR doesn't silently include an untested
typer change):

```ts
if (expr.elements.length === 0) {
    const [freshVar, freshState] = freshTypeVariable(state);
    return createPureTypeResult(listTypeWithElement(freshVar), freshState);
}
```

Unlike `TRAIT_SYSTEM_ARITY_BUG.md`, this does not look like a systemic
redesign — it's a single missed call to an existing helper that every
sibling call site already uses correctly. Worth a repo-wide grep for the
same `typeVariable('<literal-name>')` anti-pattern before landing the fix,
in case this isn't the only site — that sweep was out of scope for this
investigation (bounded-effort, this bug only).

## Trigger for picking this up

Any stdlib or userland code hits it incidentally the moment it uses a bare
`[]` for two differently-shaped `List`-payload constructors of one variant —
easy to hit by accident (see `std/json.noo`'s `ParseMode`/`JsonValue`, both
of which have this exact `List T` / `List {String, T}` shape). Low risk,
high value, one-line fix — good candidate for a quick standalone PR.
