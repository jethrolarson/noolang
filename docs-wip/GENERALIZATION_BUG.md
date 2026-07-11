# Generalization ignores the substitution — unsound, and not a one-liner

Found 2026-07-11 while chasing the two skipped `where`-inference tests. Not
fixed. Attempted, reverted, written down instead.

## The bug

`generalize` (`type-operations.ts`) substitutes the type it is about to
generalize, but reads the environment **raw**:

```ts
const substitutedType = substitute(type, substitution);
const typeVars = freeTypeVars(substitutedType);
const envVars = freeTypeVarsEnv(env);          // ← no substitution
```

The two sides therefore speak different names. A parameter variable bound during
body inference (`α216 := α220`) still appears as `α216` in the environment, while
the value's type now says `α220`. So `α220` looks free-in-type-but-not-in-env and
gets quantified — even though it *is* the function's parameter, and is still
monomorphic. Textbook Hindley-Milner says free variables of the environment must
be computed under the current substitution.

## What it costs

Binding an expression to a name inside a function severs its type from the
parameters:

```
fn x y => x + y                        a -> a -> a given a implements Add   correct
fn x y => (result = x + y; result)     a -> a -> b                          wrong: severed, Add dropped
fn x y => result where (result = x+y)  a -> a -> b given b implements Add   wrong: b unlinked
```

This is what the two skipped tests in `trait-function-return-types.test.ts` were
circling, though they assert the wrong thing about it — see below.

## Why the obvious fix does not work

Passing the substitution into `freeTypeVarsEnv` (resolving each environment
variable through it, and excluding each scheme's own quantified variables) fixes
the three cases above and keeps let-polymorphism working
(`id = fn x => x; {id 1, id "a"}` still infers `{Float, String}`).

It also **breaks 205 tests**, starting with `stdlib.noo` failing to type-check at
line 160:

```
TypeError: Occurs check failed: α28 occurs in Option a
```

The change makes generalization strictly less aggressive across the board. Some
definition that must stay polymorphic goes monomorphic, gets used at two types,
and the occurs check fires. Diagnosing *which* environment entries are wrongly
contributing free variables — and whether the real fault is stale schemes
lingering in the environment — is the actual work here. It is a day, not an
afternoon, and it destabilises the whole typer while in flight.

Deliberately not shipped as a half-fix.

## Note on the two skipped tests

`trait-function-return-types.test.ts` skips two `where` tests expecting
`fn x => result where (y = x + 1; result = y == 42)` to infer a **constrained**
type carrying `Add` and `Eq`. That expectation is obsolete: numeric literals are
all `Float` now (Int was removed), so `x + 1` genuinely pins `x` to `Float` and
`Float -> Bool` is the correct answer. The non-`where` spelling agrees:

```
fn x => (x + 1) == 42                            Float -> Bool
fn x => result where (y = x + 1; result = y==42) Float -> Bool
```

So `where` is not broken in the way those tests claim, and un-skipping them as
written would be wrong. Rewrite them against the real bug above — a `where`
binding whose type must stay linked to the enclosing function's parameters —
or delete them.
