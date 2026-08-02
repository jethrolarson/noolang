# `std/parser` — generic parser-combinator library

**Status: Implemented** (PR #176, alongside `std/json`, its first
consumer). User-facing usage docs live in
[`docs/language-reference.md`](../../language-reference.md#standard-library-modules).
This is a short maintainer-facing spec — `std/parser.noo`'s own header
comment is the fuller reference; this doc exists so the module has an
entry in `docs/internal/specs/` alongside `std-json.md`, not to duplicate
that comment.

## Shape

A "parser of `a`" is a plain function, not a wrapped/opaque type:

```
String -> Float -> Result {@value a, @pos Float} ParseError
```

i.e. given the full input and a starting character position, either the
parsed value plus the position just past what it consumed, or a
position-tagged `ParseError`. Backtracking is free — position is an
ordinary argument, not a mutated cursor, so a failed parser never advances
its caller's position.

There is deliberately no `type Parser a = ...` alias: parametric `type`
aliases parse but don't expand under unification in this codebase (see
[`PARAMETRIC_TYPE_ALIAS_BUG.md`](../docs-wip/PARAMETRIC_TYPE_ALIAS_BUG.md)),
so every combinator is a plain unannotated function and Hindley-Milner
inference carries the type parameter through, the same way `std/json.noo`
already relied on for `result_bind`/`result_map`.

## What's provided

Character-class predicates (`is_digit`, `is_whitespace`, `is_alpha`,
`is_alnum`), primitive parsers (`peek_char`, `satisfy`, `char`,
`string_lit`, `take_while`/`take_while1`, `skip_ws`, `lexeme`), and
combinators (`pmap`, `pbind`, `succeed`, `fail`, `choice`/`choice2`,
`optional`, `many`/`many1`, `sep_by`, `between`). `ParseError` and
`parse_error` round out error construction.

## Known limitation

A self-recursive parser with 2+ `choice` branches breaks if any branch
pairs the recursive result with a companion value (record/tuple/variant) —
see [`CHOICE_RECURSIVE_PAIRING_BUG.md`](../docs-wip/CHOICE_RECURSIVE_PAIRING_BUG.md).
This is exactly the shape needed for idiomatic object/key-value grammar
parsing, so `std/json.noo`'s array/object repetition routes around it with
manual recursion instead of `sep_by`. Fixing this would let a future
`std/json` revision use `sep_by` uniformly.

## History

Built as a forcing function one level down from `std/json` (see PR #165's
discussion): `std/json`'s original version was hand-written
recursive-descent, not combinator-style. `std/parser` is meant to be the
generic library a real combinator-style parser (like `std/json`'s current
implementation) is built on, and a real answer to "can noolang express
combinator-style parsing at all" — yes, cleanly, once packrat memoization
(#174) made parsing combinator-heavy `.noo` source itself cheap enough.
