# 3. Generalization must read the environment through the current substitution

Date: 2026-07-11

## Status

Accepted (fixed)

## Context

`generalize` substituted the type being generalized but read the
environment raw:

```ts
const substitutedType = substitute(type, substitution);
const typeVars = freeTypeVars(substitutedType);
const envVars = freeTypeVarsEnv(env);          // no substitution
```

The two sides spoke different variable names. A parameter bound during body
inference (`α216 := α220`) still appeared as `α216` in the environment while
the value's type now said `α220`; `α220` looked free-in-type-but-not-in-env
and got wrongly quantified, even though it was still the function's
monomorphic parameter. Cost: binding an expression to a name inside a
function severed its type from the parameters — `fn x y => (result = x + y;
result)` inferred `a -> a -> b` (severed, `Add` dropped) instead of
`a -> a -> a given a implements Add`; the `where` form had the same bug.

## Decision

`freeTypeVarsEnv` takes the substitution, resolves each environment scheme's
type through it, and excludes each scheme's own `quantifiedVars` before
computing free variables.

The obvious version of this fix breaks 205 tests (`stdlib.noo` fails to
type-check: `Occurs check failed: α28 occurs in Option a`) by making
generalization strictly less aggressive — something that had to stay
polymorphic goes monomorphic and gets used at two types. The predicted
205-test regression turned out to be a single upstream cascade (`stdlib.noo`
failing to *load* fails every test that touches it), not 205 independent
breakages. The actual bug: `Monad Option`/`Monad Result`'s `bind` had an
"auto-wrap non-monad values" arm requiring `b ~ Option b` — an infinite
type, unsound, previously hidden because the old buggy `generalize`
over-generalized `b` and let each match arm re-instantiate it independently.
Fixed by removing the auto-wrap arm (`bind` must always return the monad's
own type) and moving the "wrap unless already the right constructor"
coercion `|?` had been leaning on into `|?`'s own evaluator branch, where it
belongs — `bind` can't express it soundly, `|?` can.

## Consequences

- `id = fn x => x; {id 1, id "a"}` still infers `{Float, String}` —
  let-polymorphism intact.
- Two skipped tests in `trait-function-return-types.test.ts` asserted an
  obsolete expectation (a `where`-bound result should carry `Add`/`Eq`
  constraints) that predates numeric literals unifying to `Float`; deleted
  rather than un-skipped, since `Float -> Bool` is the correct answer for
  both the `where` and non-`where` spellings now.
- Fixing `|?`'s coercion in the evaluator rather than `bind` closed a real
  type/value mismatch: `Some 5 |? add_ten` had typed as `Option Float` while
  evaluating to a bare `Float` — the typer's `handleSafeThrush` fallback had
  the right answer all along; the evaluator was silently wrong.
