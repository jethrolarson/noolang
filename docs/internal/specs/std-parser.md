# `std/parser` — generic parser-combinator library

**Status: Implemented** (PR #176, alongside `std/json`, its first
consumer). User-facing usage docs live in
[`docs/language-reference.md`](../../language-reference.md#standard-library-modules).
This is a short maintainer-facing spec — `std/parser.noo`'s own header
comment is the fuller reference; this doc exists so the module has an
entry in `docs/internal/specs/` alongside `std-json.md`, not to duplicate
that comment.

This file is literate noolang: every ```` ```noolang ```` block below
actually runs, in file order, as one program — see `docs/language-
reference.md` §Literate Programming and `validate_examples.js`.

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

## Worked example: `std/json`, its real consumer

`std/json` is the actual proof this library is usable, not a toy — its
scalar productions (`null`/`true`/`false`/string) are built directly on
`std/parser`'s `choice`/`pmap`/`between`/`many`. Run here for real, against
the shipped module:

```noolang
{@json_parse json_parse, @json_stringify json_stringify} = import "std/json";

roundtrip = match (json_parse "{\"tags\":[\"a\",\"b\"],\"ok\":true}") (
  Ok v => json_stringify v;
  Err _ => "parse failed"
);
roundtrip  # => "{\"tags\":[\"a\",\"b\"],\"ok\":true}" : String
```

A second, smaller worked example built straight from this module's own
primitives — no `std/json` involved — parses a comma-separated number list
(`take_while1` for character-run scanning, `pmap` to transform a result,
`sep_by` for repetition, `char` for a single literal):

```noolang
{@is_digit is_digit, @take_while1 take_while1, @pmap pmap, @sep_by sep_by, @char char}
  = import "std/parser";

digit_to_number = fn s => reduce (fn acc ch => (
  d = match ch ("0"=>0;"1"=>1;"2"=>2;"3"=>3;"4"=>4;"5"=>5;"6"=>6;"7"=>7;"8"=>8;"9"=>9;_=>0);
  acc * 10 + d
)) 0 (chars s);

number_p = pmap digit_to_number (take_while1 "digit" is_digit);
numbers_p = sep_by number_p (char ",");

count = match (numbers_p 0 "1,22,333") (
  Ok r => toString (length (r | @value));
  Err _ => "parse failed"
);
count  # => "3" : String
```

## What's provided

Character-class predicates (`is_digit`, `is_whitespace`, `is_alpha`,
`is_alnum`), primitive parsers (`peek_char`, `satisfy`, `char`,
`string_lit`, `take_while`/`take_while1`, `skip_ws`, `lexeme`), and
combinators (`pmap`, `pbind`, `succeed`, `fail`, `choice`/`choice2`,
`optional`, `many`/`many1`, `sep_by`/`sep_by1`, `between`). `ParseError` and
`parse_error` round out error construction. Signatures below are ascribed
against the real imports, so a signature drift breaks this file:

```noolang
{@peek_char peek_char, @char char, @skip_ws skip_ws} = import "std/parser";

_peek = (peek_char : Float -> String -> Option String);
_ws   = (skip_ws : Float -> String -> Float);

# `char`/`string_lit`/etc. return `Result {@value a, @pos Float} ParseError`,
# but `ParseError` can't be ascribed by name here — it's a variant whose
# type name equals its sole constructor's name, which resolves to the
# *constructor's* function type in a type ascription, not the variant type
# (a pre-existing noolang quirk, not specific to this module). Shown by
# real use instead:
parsed = char "x" 0 "xyz";
position = match parsed (Ok r => r | @pos; Err _ => 0 - 1);
position  # => 1 : Float
```

## Known limitation

A self-recursive parser with 2+ `choice` branches breaks if any branch
pairs the recursive result with a companion value (record/tuple/variant) —
see [`CHOICE_RECURSIVE_PAIRING_BUG.md`](../docs-wip/CHOICE_RECURSIVE_PAIRING_BUG.md).
This is exactly the shape needed for idiomatic object/key-value grammar
parsing, so `std/json.noo`'s array/object repetition routes around it with
manual recursion instead of `sep_by`. A second, narrower gap surfaced
building `std/json.noo`'s number parser — see
[`CROSS_MODULE_SCHEME_CORRUPTION_BUG.md`](../docs-wip/CROSS_MODULE_SCHEME_CORRUPTION_BUG.md):
a `pbind`/`take_while1` chain that typechecks fine alone can corrupt
unrelated inference elsewhere in a program that also imports `std/test`.
Fixing either would let a future `std/json` revision lean on `std/parser`
more uniformly.

## History

Built as a forcing function one level down from `std/json` (see PR #165's
discussion): `std/json`'s original version was hand-written
recursive-descent, not combinator-style. `std/parser` is meant to be the
generic library a real combinator-style parser (like `std/json`'s current
implementation) is built on, and a real answer to "can noolang express
combinator-style parsing at all" — yes, cleanly, once packrat memoization
(#174) made parsing combinator-heavy `.noo` source itself cheap enough.
