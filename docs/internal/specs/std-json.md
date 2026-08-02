# `std/json` — JSON parse/serialize

**Status: Implemented** (PR #176). User-facing usage docs live in
[`docs/language-reference.md`](../../language-reference.md#standard-library-modules)
— this spec describes the module's design and guarantees for maintainers;
read the language reference first if you just want to use it.

## Scope

Parse + serialize, built entirely in `.noo` on top of
[`std/parser`](std-parser.md)'s combinator primitives — no native
`JSON.parse`/`JSON.stringify` wrapper. `std/json` is `std/parser`'s first
real consumer, chosen deliberately as a forcing function for whether the
combinator library is any good in practice.

## Representation: concrete `JsonValue` variant, not `Unknown`

```
variant JsonValue = JNull | JBool Bool | JNumber Float | JString String
                   | JArray (List JsonValue) | JObject (List {String, JsonValue});
```

Not `Unknown`: an earlier spike into a `schema.noo`-style decode-combinator
approach (`Schema a = Unknown -> Result a DecodeError`) found two blocking
issues specific to `Unknown` — noolang records can't be constructed with
runtime-computed keys (a JSON object's keys are only known at parse time),
and `Unknown` doesn't expose enough structure to recover a record's fields
from a successfully-decoded shape either way. A concrete variant sidesteps
both: `JObject` stores members as `List {String, JsonValue}` (an assoc
list) instead of a noolang record.

## Public API

```
json_parse      : String -> Result JsonValue JsonParseError
json_stringify  : JsonValue -> String
json_equals     : JsonValue -> JsonValue -> Bool
json_field      : String -> JsonValue -> Result JsonValue JsonError
json_index      : Float -> JsonValue -> Result JsonValue JsonError
json_as_string  : JsonValue -> Result String JsonError
json_as_number  : JsonValue -> Result Float JsonError
json_as_bool    : JsonValue -> Result Bool JsonError
json_as_array   : JsonValue -> Result (List JsonValue) JsonError
json_as_object  : JsonValue -> Result (List {String, JsonValue}) JsonError
```

Plus the `JNull`/`JBool`/`JNumber`/`JString`/`JArray`/`JObject` constructors,
re-exported so callers can build `JsonValue`s directly (e.g. to serialize
data that didn't come from `json_parse`).

Two error variants, kept separate because they're different failure modes:

```
variant JsonParseError = JsonParseError {@message String, @position Float};

variant JsonError =
    JsonExpectedString | JsonExpectedNumber | JsonExpectedBool
  | JsonExpectedArray  | JsonExpectedObject
  | JsonMissingField String | JsonIndexOutOfBounds Float;
```

`JsonParseError` is malformed *text*; `JsonError` is "value is the wrong
shape" or "key/index not found" once you already have a `JsonValue`.

**Design note — `JsonParseError` is not `std/parser`'s `ParseError`, even
though the module is combinator-based.** `json_parse` wraps `std/parser`'s
own `ParseError` into this locally-declared variant at the module boundary.
Two reasons: (1) noolang's ADT pattern-matching registry doesn't propagate
through transitive imports — a consumer importing only `"std/json"` (not
`"std/parser"` too) gets `Unknown ADT: ParseError` trying to match the
un-wrapped type directly, so re-exporting it as-is would leak an import
requirement into every consumer; (2) it keeps `std/parser` an
implementation detail — nothing about `std/json`'s public API should force
a caller to know it's combinator-based under the hood. The field shape
(`@message String, @position Float`) is identical either way, so the wrap
is a rename, not a translation.

## Documented scope limits

- **`\u`, `\b`, `\f` string escapes are rejected, not decoded.** There is
  no codepoint↔character builtin (`fromCharCode`/`charCodeAt`-equivalent)
  in noolang to decode a `\uXXXX` escape with. `json_parse` fails the parse
  on any of these rather than silently mis-decoding them (e.g. passing the
  literal letter through and dropping the backslash) — confirmed by test,
  not just by omission.
- **`-0` does not round-trip its sign.** `toString` normalizes `-0` to
  `"0"` regardless of the underlying float's sign bit, so `json_stringify`
  can't distinguish it from `0` even if parsing preserved the sign.
- **Non-finite numbers serialize to `"null"`.** `json_stringify`'s
  signature is `JsonValue -> String` with no error channel, so a
  `JNumber` holding `Infinity`/`-Infinity`/`NaN` (reachable from valid
  JSON text via arithmetic overflow, e.g. `1e400`) emits `"null"` rather
  than invalid JSON syntax — matching `JSON.stringify`'s own precedent for
  the same case.
- **Duplicate object keys: last value wins, first position kept** — matches
  `JSON.parse`'s behavior, implemented via `assoc_set`.
- **Leading zeros (`"01"`) and raw unescaped control characters in strings
  are rejected**, per RFC 8259 §6 and §7 respectively.

## Implementation notes (combinator-based, not hand-rolled)

Scalars (`null`/`true`/`false`/string/number) are genuinely combinator-built
on `std/parser`'s `choice`/`pmap`/`between`/`many`. Array/object
*repetition* is not — it's threaded through an explicit `ParseMode` tag and
one self-recursive `parse_node` function using manual index-passing,
instead of `sep_by`. This is a deliberate workaround for a typer bug (see
[`CHOICE_RECURSIVE_PAIRING_BUG.md`](../docs-wip/CHOICE_RECURSIVE_PAIRING_BUG.md)):
a self-recursive parser with 2+ `choice` branches breaks when any branch
pairs the recursive result with a companion value, which is exactly
object-member parsing's natural shape (`sep_by (pbind (fn key => pmap (fn v
=> {key, v}) value_p) key_p) sep`).

Two other typer bugs surfaced during development, both since fixed on
`main`: an import-destructure arity bug (#158/#159 — see the comment at the
top of `std/json.noo`'s `std/parser` import) and an empty-list
type-variable collision bug that motivated using
`list_filter (fn _ => False) [...]` instead of a bare `[]` literal for
`JArray`/`JObject`'s empty-accumulator constants (workaround kept even
though the underlying bug is fixed, since it's harmless and already
verified).

## History: why combinator-based, not hand-rolled

The module shipped once already as PR #165, hand-rolled recursive-descent
in pure `.noo` with no `std/parser` dependency (that library didn't exist
yet). That choice was forced, not stylistic: an early attempt at a
combinator-based rewrite typechecked ~17x slower (see
[`PARSER_COMBINATOR_SIZE_COST.md`](../docs-wip/PARSER_COMBINATOR_SIZE_COST.md)),
a cost specific to noolang's own then-unmemoized parser backtracking on
combinator-heavy source, not to JSON parsing itself. Packrat memoization
(#174) fixed that mechanism; re-measured, the combinator-based version now
typechecks in the same ~20-30ms band as the hand-rolled one, so the
original perf reason to hand-roll no longer holds. PR #176 replaced the
hand-rolled version with this one; the public API is unchanged between the
two (confirmed by running PR #165's own TS test suite, unmodified, against
this implementation).
