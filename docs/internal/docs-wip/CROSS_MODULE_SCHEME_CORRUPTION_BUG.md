# A production that typechecks fine alone can corrupt unrelated inference only when combined with another module

Filed 2026-08-01, found while building a combinator-based number parser for
`std/json.noo` (see `docs/internal/specs/std-json.md`'s implementation
notes). Not fixed here; the combinator version was reverted in favor of the
original hand-rolled `digit_run`/`json_number_p`, which doesn't trigger it.

## Symptom

A `pbind`/`take_while1`/`choice2` chain built from `std/parser` primitives
(a JSON-number grammar: optional sign, digit run with a leading-zero guard,
optional fraction, optional signed exponent — three levels of nested
`pbind`) typechecks cleanly as `std/json.noo`'s `json_number_p`, confirmed
directly via `NO_COLOR=1 bun src/cli.ts --types-file std/json.noo`. The
same file, run through `noo test` (which generates a combined program:
`std/test`'s `run_all` plus the suite module — see
`std/test-runner.noo`'s `entry_source`), fails to typecheck with:

```
TypeError: Operator type mismatch in applying operator >
  Expected: Test
  Got:      Float
  at line 5, column 10
```

Line 5 of the *generated entry file* is `exit (if failed > 0 then 1 else
0)`, where `failed` comes from destructuring `run_all`'s own return value
two lines earlier. `run_all`'s inferred return type — nothing to do with
JSON parsing — has been corrupted into something incompatible with its own
declared shape, purely as a side effect of `std/json.noo` (imported
transitively via the suite module) using this particular combinator shape
for `json_number_p`.

## Isolation performed

Swapping *only* `json_number_p`'s implementation — combinator chain vs. the
original hand-rolled `digit_run`-based version, everything else in
`std/json.noo` held constant — flips the combined program between failing
and passing. Confirmed directly by constructing the generated entry file
by hand and typechecking it standalone:

```
{@run_all} = import "std/test";
suite = import "./json.test.noo";
result = run_all [{@path "json.test.noo", @suite suite}];
{@failed failed} = result;
exit (if failed > 0 then 1 else 0)
```

— fails with the combinator `json_number_p`, passes with `digit_run`.

**Not yet reduced further.** Attempts at a smaller standalone repro
(a `number_p`-shaped chain in its own module, imported alongside `std/test`
and `run_all` called on `[]` or on a real `group`/`test_case` value, in a
file with no other `std/json.noo` content) did not reproduce the failure —
whatever triggers this needs more of `std/json.noo`'s actual surrounding
declarations (other `variant`s, `json_string_p`, `json_scalar_p`, the
`ParseMode`-tagged `parse_node`, or some combination) to be present
alongside the combinator `json_number_p`, not just the chain in isolation.
Bounded effort spent here — the isolation above (swap one production,
everything else fixed) is solid evidence of *what* triggers it in this
file, even without a minimal from-scratch repro of *why*.

## Likely cause (not traced to a fix)

Presumably the same scheme-freshening/generalization gap as #158
(import-destructure arity) and the choice-branch-pairing bug (see
`CHOICE_RECURSIVE_PAIRING_BUG.md`) — a polymorphic binding's instantiation
at one use site leaking into or colliding with an unrelated instantiation
elsewhere, this time across a module boundary (`std/json`'s internal use of
`std/parser`'s combinators vs. `std/test`'s own `run_all`, imported
separately by the entry file and by the suite module). What's novel here
compared to the other two: **neither module needs to reference the
other.** `std/json.noo`'s `json_number_p` never touches `run_all`, and vice
versa — they're only related by both being reachable from one combined
program's dependency graph. This is a materially scarier variant than
#158/the choice-pairing bug: those require a specific *local* authoring
pattern (destructuring N bindings from one import; a self-recursive
`choice` branch pairing its result) that a reader can learn to recognize
and avoid. This one requires knowing what *else* gets imported into the
same program — invisible from reading `std/json.noo` in isolation, and not
caught by typechecking it standalone.

## Impact / workaround

`std/json.noo`'s `json_number_p` stays hand-rolled (`digit_run`, an
imperative `reduce`-based character scanner) rather than combinator-built,
even though a combinator version is shorter and was confirmed correct on
its own. The empty-list constants (`empty_json_array`/`empty_json_object`,
built via `list_filter` rather than a bare `[]` literal) are also kept
as-is rather than simplified, even though the specific bug they originally
worked around (empty-list type-variable collision) is independently fixed
on `main` — "typechecks in isolation" is no longer trusted as sufficient
evidence for this file, per this finding.

## Trigger for picking this up

Any `.noo` module built from `std/parser` combinators that is a) itself
typechecked fine standalone, and b) gets imported into a `noo test` suite
(or any program that also imports `std/test`, or plausibly any two modules
each using generic/polymorphic combinators heavily) is at risk of silently
corrupting unrelated type inference elsewhere in that combined program.
Because the corruption only manifests in the combination, not in either
module typechecked alone, this can't be caught by `bun run typecheck`-ing
a `.noo` file in the stdlib — only by actually running it through `noo
test` or an equivalent combined-program scenario, which is easy to skip if
"the module typechecks" is treated as sufficient verification.
