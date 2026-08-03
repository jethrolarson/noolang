# 1. Trailing underscore names the flipped form

Date: 2026-08-01

## Status

Accepted

## Context

`fn foo => match (foo) (arms)` can't eta-reduce — `match` is syntax, not a
curried value, so there's nothing to reduce to. A parser-sugar fix was tried
(`match (arms)`, scrutinee omitted, backtracking to disambiguate from
`match (scrutinee) (arms)`). It worked — no real parser collision — but
reused `match`'s own prefix for two different meanings, resolvable only by
lookahead. Correct for the parser, opaque for a reader: the same two
characters mean different things depending on what follows, with no local
signal. A same-keyword fix inside `fn`'s parameter-list position (`fn match
(arms)`) has the identical problem, relocated: `match` becomes magic in
argument position instead.

Both OCaml (`function arms`, distinct from `fun`) and Haskell (`\case arms`,
LambdaCase) solve this the same way: pay for a second, lexically distinct
token rather than overload the first one's prefix. No backtracking, no
argument-position magic.

Separately: `match (arms)` is semantically `flip match`, in the sense of the
`flip` combinator (`flip f x y = f y x`) — swap which argument comes first.
That's not special to `match`. Any two-argument construct can have a
"first argument supplied last" form, and for an ordinary function this
already needs no new syntax (`foo_ = fn b a => foo a b`, or generically
`foo_ = flip foo`). `match` only needs new syntax because it's parser-level
special form, not a bound value — there's no `match` to flip.

## Decision

A trailing underscore on a name denotes its flipped form: the first argument
moves to last position.

- For an ordinary function, this is exactly `flip`: `foo_ = flip foo`. No
  language change — a naming convention for a stdlib-expressible operation.
- For special syntax with no runtime value to flip, each construct needs its
  own dedicated grammar production, named with the same trailing-`_`
  convention. `match_ (arms)` is the first instance: sugar for
  `fn x => match x (arms)`, parsed as a distinct keyword — not a mode
  switch on `match`'s own prefix, so no lookahead/backtracking is needed to
  tell the two apart.

## Consequences

- `match_` must be lexed as a whole, distinct keyword (confirmed: this
  lexer already matches keywords as complete identifier tokens, so adding
  `match_` doesn't collide with `match`).
- Future special-syntax constructs wanting a point-free/flipped form follow
  the same naming pattern instead of each inventing its own spelling.
- Does not by itself introduce a general placeholder (`_` in expression
  position) or partial-application sectioning for ordinary named functions —
  those are separate, larger features this ADR takes no position on. If
  `flip` isn't already in stdlib, adding it is a small, independent
  follow-up, not required by this decision.
