# Point-free `match` (Haskell `\case` equivalent)

**Implemented as `match_`.** `match_ (arms)` (scrutinee omitted, argument
moved to last position) desugars at parse time to
`fn __match_x => match __match_x (arms)`; see `parseMatchUnderscoreExpression`
in `src/parser/parser.ts`, `match_` in the keyword list in
`src/lexer/lexer.ts`, and
`test/features/pattern-matching/point_free_match.test.ts`. Documented in
`docs/language-reference.md` under "Pattern Matching and Exhaustiveness".
`match_` fits the trailing-underscore "flipped form" naming convention —
see `docs/internal/adrs/0001-trailing-underscore-flip.md` for the full
argument; this doc covers only the `match`-specific history.

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
in the hazard AGENTS.md already calls out: constraint/inference code goes
green and wrong at the same time. Not worth it for a stylistic win.

Given that, the fix has to be syntax sugar, not semantics: a pure
parse-time desugaring to a synthetic `FunctionExpression` wrapping an
ordinary `MatchExpression`. `match` itself, its typing, and its
exhaustiveness checking stay untouched either way — the only open question
was what the new surface syntax should look like.

## First attempt: `match (arms)`, reusing `match`'s own prefix — reverted

The first implementation spelled point-free match as `match (arms)`,
reusing the `match` keyword itself and disambiguating from
`match (scrutinee) (arms)` by trying to parse the arms block first and
backtracking to the scrutinee form on failure (ordered-choice parsing, the
same technique `C.choice`/`C.choice2` already use elsewhere in
`src/parser/parser.ts`).

**The parser could tell the two forms apart soundly** — this was spiked
before implementation, not assumed. `parseMatchCase` requires a literal
`=>` immediately after a syntactically valid pattern, and no valid Noolang
scrutinee expression can produce a bare top-level `=>` (lambdas need the
`fn` keyword first, and the lexer tokenizes `fn` as `KEYWORD`, never
`IDENTIFIER`, so `fn` can never itself be parsed as a pattern). Concretely:

- `match (foo) (Some x => x; None => 0)` (bare-identifier scrutinee) —
  pattern `foo` parses, next token is `)` not `=>`, arms-attempt fails,
  falls back correctly.
- `match (fn x => x) (_ => "matched")` (parenthesized single-arg lambda
  scrutinee) — `fn` isn't a valid pattern-start token, arms-attempt fails
  immediately, falls back correctly.
- `--types` on both the point-free form and its pointful
  `fn foo => match (foo) (...)` equivalent inferred the identical type,
  confirming the desugaring was faithful.

**This was reverted anyway.** Parser-soundness isn't the same bar as
reader-clarity: `match (` meant two different things depending on what
followed, resolvable only by lookahead — correct for the parser, opaque for
a human skimming the source. Both OCaml (`function arms`, a keyword
distinct from `fun`) and Haskell (`\case arms`, LambdaCase) solve the
identical problem by paying for a second, lexically distinct token instead
of overloading the first construct's own prefix — see the ADR for the full
argument. `fn match (arms)` (putting the ambiguity in `fn`'s parameter list
instead) was considered and rejected for the same reason, just relocated.

## What shipped: `match_`, a distinct keyword

`match_` is lexed as its own `KEYWORD` token, alongside `match`, in
`src/lexer/lexer.ts` — not a mode switch inside `parseMatchExpression` on
the `match` token. `parseMatchUnderscoreExpression` in
`src/parser/parser.ts` is unconditionally point-free: no backtracking, no
shared prefix, no ambiguity to resolve at any level (parser or reader).
`parseMatchExpression` itself is back to its original simple form —
`match` keyword, scrutinee, arms block, no branching.

## Scope (completed)

1. Lexer: added `match_` to the keyword list (`src/lexer/lexer.ts`).
   Confirmed safe — the lexer already reads identifiers (including a
   trailing `_`) as one token before checking the keyword list, so
   `match_` and `match` were never at risk of colliding token-wise.
2. Parser: `parseMatchUnderscoreExpression` (`src/parser/parser.ts`),
   wired into every call site that previously only listed
   `parseMatchExpression` (lambda bodies, nested match-case expressions,
   `where`-clause main expressions, the fast-dispatch keyword switch in
   `parseSequenceTerm`).
3. `docs/language-reference.md` — "Pattern Matching and Exhaustiveness"
   documents `match_` alongside the existing two-argument form.
4. Regression tests: `test/features/pattern-matching/point_free_match.test.ts`
   — the point-free form itself, inline application, higher-order use,
   wildcard catch-all, nesting inside an ordinary `match` case, and
   eta-equivalence (same result and inferred type) against the pointful
   `fn foo => match (foo) (...)` wrapper.

No stdlib or typer changes were needed.
