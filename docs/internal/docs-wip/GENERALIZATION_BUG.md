# Generalization ignores the substitution — unsound, and not a one-liner

Found 2026-07-11 while chasing the two skipped `where`-inference tests.
**Fixed 2026-07-11** (same session, continued). See "Resolution" at the
bottom — the 205-test regression predicted below turned out to be a single
upstream cascade (stdlib failing to *load* at all breaks every test that
touches it), not 205 independent breakages.

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

## Resolution (2026-07-11)

Shipped the fix described above: `freeTypeVarsEnv` now takes the substitution,
resolves each scheme's type through it, and excludes the scheme's own
`quantifiedVars` (previously a stored polymorphic scheme's bound var names
leaked into "env vars" too, though harmlessly in practice since fresh-var
names are monotonic and never collide).

**The predicted 205-test regression was a mirage.** `stdlib.noo` failing to
*load* fails every test that touches stdlib (nearly all of them) — one root
cause, not 205. The actual failure was real, just singular: `Monad Option`'s
and `Monad Result`'s `bind` both had an "auto-wrap non-Option/Result values"
arm —

```
result = f x;
match result (
  Some y => result;
  None => result;
  _ => Some result   # auto-wrap
)
```

— which requires unifying `result`'s type (`b`, from `f x`) with `Option b`
(the wrapped fallback). That's `b ~ Option b`, an infinite type. The occurs
check firing here is **correct** — this was never sound. It only typechecked
before because the old buggy `generalize` over-generalized `b` and let each
match arm re-instantiate it independently, hiding the paradox. Confirmed by
reproducing the identical failure on `Monad Result` after fixing `Monad
Option`, proving one bug pattern, not many.

Fix, two parts:

1. `type-operations.ts` — `freeTypeVarsEnv`/`generalize` as described above.
2. `stdlib.noo` — removed the auto-wrap arm from both `bind` impls; a lawful
   `bind` requires `f` to always return the monad's own type. `Some x => f x`,
   full stop.

Removing (2) broke `|?` (safe thrush), which had been leaning on `bind`'s
auto-wrap to let a plain (non-Option-returning) right-hand function chain —
`Some 5 |? add_ten` expects `Some 15` even though `add_ten : Float -> Float`.
That coercion can't live in `bind` (same occurs-check reason), so it moved to
`|?`'s own evaluator branch (`evaluator.ts`, the `'|?'` case), which now
applies the right-hand function directly and wraps the result only if it
isn't already the monad's own constructor — mirroring logic the *typer*
already had in `handleSafeThrush`'s fallback path, which was computing the
right type all along while the evaluator silently returned the wrong
*value* (type said `Option Float`, runtime value was a bare `Float` — a
live instance of the "green and wrong" hazard).

Net: full suite green (1153 pass / 8 skip / 0 fail — 2 stale skips deleted),
typecheck clean, docs 6/6 + README 57/57. Regression tests added in
`trait-function-return-types.test.ts` for both the `where`- and
semicolon-let-bound cases.
