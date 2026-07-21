# Trait system assumes kind `* -> *`; breaks on arity-2+ variants

Filed 2026-07-20, found while fixing `Applicative Result` in PR #156
(stdlib.noo, KNOWN WRONG comment on the `apply` implementation).

## Symptom

`variant Result a b = Ok a | Err b` is arity-2. Its `Functor`/`Applicative`
instances either silently lose the second type parameter or crash, depending
on which code path in the instance body runs:

- `map (fn x => x + 1) (Ok 2)` infers as `Result Float` — the error type `b`
  has vanished from the result type. Should be `Result Float b` (or similar).
- Writing `Applicative Result`'s `apply` the same way `Applicative Option`'s
  correctly works (`match f (Ok g => map g res; ...)`, matching the
  function-valued instance parameter) crashes stdlib load entirely:
  `Unknown ADT: Result`, thrown from `typePattern`
  (`src/typer/pattern-matching.ts:414`).

`Option` (arity-1) has the same trait instances and works — coincidentally,
because it fits the framework's hardcoded assumption, not because the
framework handles arity generally.

## Root cause (investigated 2026-07-20, Explore agent report)

The trait framework represents a trait's abstract type (`f` in `Functor f`,
`Applicative f`) with a single type-parameter slot and assumes kind `* -> *`
throughout:

- `TraitDefinition.typeParam: string` — one name, no arity
  (`src/typer/trait-system.ts:16`).
- Trait signatures only ever apply `f` to one argument: `map : (a -> b) -> f a
  -> f b` (`stdlib.noo:9-19`) — no syntax for `f a b`.
- Instance resolution hardcodes `args: []` when substituting the concrete
  type name in: `traitTypeSubstitution.set(traitDef.typeParam, { kind:
  'variant', name: resolution.typeName!, args: [] })`
  (`src/typer/trait-function-handling.ts:427-441`). Combined with the
  single-arg template kept by `substitute.ts:81-88`, only one type argument
  can ever survive.
- `typeImplementDefinition` never unifies an instance body against the
  trait's declared signature — existing TODO at
  `src/typer/type-inference.ts:1756`: "we'll trust the implementation." A
  2-arity instance body types fine in isolation until its real arity collides
  with the trait's 1-arity template mid-expression (the crash case: one
  match-case body comes from the 1-arg template, the sibling case's body is
  real 2-arg `Result t t`, `unifyVariant` rejects the arity mismatch).

## Why this wasn't fixed in PR #156

`Applicative Result::apply` is shipped with the wrong-but-non-crashing body
(matches the argument instead of the function, same shape `Option`'s bug
had) and a `KNOWN WRONG` comment, because the correct body crashes stdlib
load rather than producing a type error. Deferred tests are commented out in
`stdlib.test.noo`. Fixing it properly means fixing the trait framework, not
the instance.

## Fix shape (not attempted)

Not a one-line arity-lookup fix — moderate/broad, core trait-system plumbing:

1. `TraitDefinition` needs to carry arity (or the framework goes properly
   higher-kinded) instead of a single `typeParam: string`.
2. Both substitution sites need to stop hardcoding `args: []` —
   `trait-function-handling.ts` around L131 and L427-441.
3. Optionally close the `type-inference.ts:1756` TODO: actually unify an
   instance body's type against the trait's signature, so a
   mismatched-arity instance fails at `implement` time with a clear error
   instead of crashing later at a random call site.

Blast radius today is small — `Result` is the only arity-2 variant in
stdlib.noo — but the fix itself must be general, not a `Result`-specific
patch, or the next arity-2+ user variant hits the same wall.

## Trigger for picking this up

A second arity-2+ variant with trait instances is dogfooded, or `apply`/full
`Applicative Result` is actually needed by a program (currently unused —
deferred tests only).
