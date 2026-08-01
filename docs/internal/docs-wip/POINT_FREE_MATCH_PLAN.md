# Point-free `match` (Haskell `\case` equivalent)

Scoping note, not yet implemented. Raised while looking at `find_todos.noo`:
`fn foo => match (foo) (...)` can't be eta-reduced to point-free form, because
`match` is special syntax (`match <scrutinee> (<arms>)`), not a curried
function value — there's nothing to eta-reduce *to*.

## Why not make `match` a real function value

The tempting "real" fix — give `match` a genuine curried type so
`match (arms)` is just partial application — was considered and rejected.
Exhaustiveness checking currently runs against the scrutinee's known type at
the match site; making `match` a first-class value means deferring that
check to wherever the resulting function gets applied, which could be a
different module entirely. That's a real typer redesign, and lands squarely
in the hazard CLAUDE.md already calls out: constraint/inference code goes
green and wrong at the same time. Not worth it for a stylistic win.

## The actual fix: syntax sugar, not semantics

Same category as operator sectioning (#133, `src/parser/parser.ts` around
line 336, `parseOperatorSection`): a pure parse-time desugaring, no typer
changes. That precedent synthesizes a lambda with fresh params
(`__section_a`, `__section_b`) wrapping a `BinaryExpression` that references
them.

Same shape here: `match (arms)` with the scrutinee omitted desugars to
`fn __match_x => match __match_x (arms)` — a synthetic `FunctionExpression`
wrapping an ordinary `MatchExpression`. `match` itself, its typing, and its
exhaustiveness checking are all untouched; only the parser changes.

Current grammar, for reference (`src/parser/parser.ts:1855-1878`,
`parseMatchExpression`): `match` keyword, then a required scrutinee via
`parseThrush`, then `(`, semicolon-separated `pattern => expr` cases, `)`.
The scrutinee is not optional today — this is the one production that needs
a new branch.

## The real risk: `match (` is ambiguous

`match (foo) (arms)` — a parenthesized scrutinee — and the proposed
`match (arms)` — point-free, no scrutinee — both start with `match (`. The
parser can't tell which it's looking at from the `(` alone; it has to look
inside.

Proposed disambiguation: after `match`, attempt to parse
`( sepBy(pattern => expr, ;) )` first (the arms form). If that succeeds,
it's point-free. If it fails, backtrack and parse the existing
`scrutinee (arms)` form. This is ordinary PEG-style ordered-choice
backtracking, consistent with how this parser already uses `C.choice`/
`C.lazy` elsewhere — not a new parsing technique.

Where this could still collide: a parenthesized scrutinee whose first
token could also start a pattern. Patterns start with constructor names,
literals, identifiers, wildcards, or destructuring syntax — normal
expressions mostly don't start the same way `pattern =>` does, since `=>`
isn't a general infix operator outside `fn`/`match`. No concrete collision
found by inspection, but this needs an actual spike — write both forms
side by side, including deliberately adversarial cases (e.g. a scrutinee
that's itself a bare identifier or a parenthesized single-arg lambda) —
before implementation, not asserted confidently here.

## Scope if this goes ahead

1. Spike the ambiguity above first — if a real collision turns up, this
   whole approach needs rethinking (e.g. a different point-free spelling
   that doesn't share `match (`'s prefix).
2. Parser: new branch in `parseMatchExpression`, desugaring to a
   `FunctionExpression` per the operator-sectioning precedent.
3. `docs/language-reference.md` — "Pattern Matching and Exhaustiveness"
   section (line ~504) needs the new form documented alongside the
   existing one.
4. Regression tests mirroring `operator-sectioning`'s test file, plus a
   case exercising the ambiguity spike found in step 1.

No stdlib or typer changes anticipated — confirm that stays true once the
spike is done.
