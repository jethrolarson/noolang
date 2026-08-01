# Point-free `match` (Haskell `\case` equivalent)

**Implemented.** `match (arms)` (scrutinee omitted) desugars at parse time to
`fn __match_x => match __match_x (arms)`; see `parseMatchExpression` in
`src/parser/parser.ts` and `test/features/pattern-matching/point_free_match.test.ts`
(the ambiguity spike below and its adversarial cases are captured there as
regression tests). Documented in `docs/language-reference.md` under "Pattern
Matching and Exhaustiveness". The rest of this doc is kept as the design
record for why the ordered-choice approach was judged safe to implement.

Raised while looking at `find_todos.noo`:
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
isn't a general infix operator outside `fn`/`match`.

## Spike result: no real collision

Confirmed by inspecting the grammar (`parsePattern`, `parseMatchCase` in
`src/parser/parser.ts`) and by constructing the adversarial cases named
above:

- Every match case requires a literal `=>` immediately after a
  syntactically valid pattern (`parseMatchCase` is `parsePattern,
  operator('=>'), expr`).
- No valid Noolang scrutinee expression can produce a bare top-level `=>`.
  Lambdas require the `fn` keyword first, and the lexer tokenizes `fn` as
  `KEYWORD`, never `IDENTIFIER` — so `fn` can never itself be parsed as a
  pattern (patterns only start from identifiers, literals, `_`, `{`, or a
  constructor name).
- Therefore a parenthesized scrutinee can never be mistaken for an arms
  block: either the first token inside the parens isn't a valid pattern
  start at all (the `fn` case), or it parses as a pattern but the next
  token isn't `=>` (the bare-identifier/constructor case) — either way the
  arms-only parse attempt fails and backtracks cleanly to the scrutinee
  form.

Verified concretely, both by direct CLI probes against the pre-implementation
grammar and as permanent regression tests post-implementation
(`test/features/pattern-matching/point_free_match.test.ts`):

- `match (foo) (Some x => x; None => 0)` (bare-identifier scrutinee) —
  pattern `foo` parses, next token is `)` not `=>`, arms-attempt fails,
  falls back correctly.
- `match (fn x => x) (_ => "matched")` (parenthesized single-arg lambda
  scrutinee) — `fn` isn't a valid pattern-start token, arms-attempt fails
  immediately, falls back correctly.
- `--types` on both the point-free form and its pointful
  `fn foo => match (foo) (...)` equivalent infer the identical type
  (`Option Float -> Float`), confirming the desugaring is faithful.

## Scope (completed)

1. ~~Spike the ambiguity~~ — done above, no collision found.
2. Parser: new branch in `parseMatchExpression`
   (`src/parser/parser.ts`), desugaring to a `FunctionExpression` per the
   operator-sectioning precedent. Implemented via ordered-choice: try
   `parseMatchArms` (the `( pattern => expr ; ... )` block) right after the
   `match` keyword; on success, wrap it as
   `fn __match_x => match __match_x (arms)`; on failure, backtrack to
   parsing a scrutinee followed by the arms block.
3. `docs/language-reference.md` — "Pattern Matching and Exhaustiveness"
   section now documents the point-free form alongside the existing one.
4. Regression tests: `test/features/pattern-matching/point_free_match.test.ts`,
   covering the point-free form itself plus both adversarial collision
   cases from the spike.

No stdlib or typer changes were needed — confirmed by the identical
`--types` output above.
