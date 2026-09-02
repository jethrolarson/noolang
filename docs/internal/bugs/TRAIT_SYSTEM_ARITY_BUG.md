# Trait system assumes kind `* -> *`; breaks on arity-2+ variants

Status: open, partially fixed

Filed 2026-07-20, found while fixing `Applicative Result` in PR #156
(stdlib.noo, KNOWN WRONG comment on the `apply` implementation).

## Update 2026-09-01 (PR #191)

Fixed the symptom described below under "Symptom" bullet 1 and the
`Unknown ADT: Result` crash under bullet 2 — `unify.ts`
(`tryUnifyConstrainedVariant`) was storing a higher-kinded trait
placeholder's *entire* concrete arg list under one substitution key
instead of just the args beyond what the trait's own signature models;
`substitute.ts` then rebuilt each occurrence from its own (shorter)
textual arg count, silently truncating. Fixed by storing only the
concrete constructor's extra trailing args in `unify.ts` and re-appending
them in `substitute.ts`. Design writeup: `docs/internal/adrs/adr_0009.md`
(proposed follow-up: name the modeled slot explicitly at each `implement`
site instead of assuming it's always the leading argument — this fix
still makes that assumption, just no longer silently).

Concretely, now working: `map (fn x => x + 1) (Ok 2)` infers `Result
Float a` (previously `Result Float`, second param vanished). `bind` on
`Result` works and preserves arity (`src/typer/__tests__/monad-result-
arity.test.ts`). `Applicative Result`'s `apply` now has a correct,
non-crashing direct implementation (`stdlib.noo`, nested match on `f`
then `res` — no longer `KNOWN WRONG`).

**Still open** — two confirmed repros past this fix:

1. The `map g res` form inside a hand-written `apply`-shaped function
   still trips `Variant arity mismatch: Result has 1 vs 2 type arguments`
   (not the old `Unknown ADT: Result` crash, but still wrong):
   ```
   apply = fn f res => match f (Ok g => map g res; Err e => Err e);
   apply (Ok (fn x => x + 1)) (Ok 2)
   ```
   This is why `stdlib.noo`'s `Applicative Result::apply` uses the longer
   nested-match form instead.
2. Wrapping *any* trait-generic function — not just `apply`-shaped code —
   in a plain new lambda loses the wrapped function's polymorphism, with
   the same error message:
   ```
   my_bind = fn res f => bind res f;
   my_bind (Ok 1) (fn x => Ok (x + 1))
   ```
   fails with the same `Variant arity mismatch`; a bare rebind with no
   wrapper (`b2 = bind; b2 (Ok 1) (fn x => Ok (x + 1))`) works. Blocks a
   `bind_ = flip bind` pipe-friendly form (ADR 1's flip convention) that
   would otherwise be a real readability win in combinator-heavy code like
   `std/json.noo`.

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

Partially overtaken by events: `Applicative Result::apply` is used and
tested now (`stdlib.test.noo`, `src/typer/__tests__/monad-result-
arity.test.ts`), not deferred-only. Remaining trigger for the two "still
open" repros above: a second arity-2+ variant with trait instances is
dogfooded (raises the odds of hitting the `map`-inside-a-wrapper or
wrap-any-trait-method-in-a-lambda shape by accident), or someone attempts
the `bind_`/flip-based pipe-chaining style blocked by repro 2.
