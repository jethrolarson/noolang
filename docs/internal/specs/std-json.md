# `std/json` — JSON parse/serialize

**Status: Implemented** (PR #176). User-facing usage docs live in
[`docs/language-reference.md`](../../language-reference.md#standard-library-modules)
— this spec describes the module's design and guarantees for maintainers;
read the language reference first if you just want to use it.

This file is literate noolang (see `docs/language-reference.md` §Literate
Programming): every ```` ```noolang ```` block below actually runs, in file
order, as one program. If the module's real API ever drifts from what this
doc claims, this file stops typechecking or its assertions fail — see
`validate_examples.js`.

## Scope

Parse + serialize, built entirely in `.noo` on top of
[`std/parser`](std-parser.md)'s combinator primitives — no native
`JSON.parse`/`JSON.stringify` wrapper. `std/json` is `std/parser`'s first
real consumer, chosen deliberately as a forcing function for whether the
combinator library is any good in practice.

Representation is a concrete `JsonValue` variant, not `Unknown`:

```
variant JsonValue = JNull | JBool Bool | JNumber Float | JString String
                   | JArray (List JsonValue) | JObject (List {String, JsonValue});
```

(Illustrative — this is declared inside `std/json.noo` itself, not
redeclared here.) Not `Unknown`: an earlier spike into a `schema.noo`-style
decode-combinator approach (`Schema a = Unknown -> Result a DecodeError`)
found two blocking issues specific to `Unknown` — noolang records can't be
constructed with runtime-computed keys (a JSON object's keys are only known
at parse time), and `Unknown` doesn't expose enough structure to recover a
record's fields from a successfully-decoded shape either way. `JObject`
stores members as `List {String, JsonValue}` (an assoc list) instead of a
noolang record for the same reason.

## Public API, exercised end to end

```noolang
{@json_parse json_parse, @json_stringify json_stringify, @json_equals json_equals,
 @json_field json_field, @json_index json_index, @json_as_number json_as_number}
  = import "std/json";

doc = json_parse "{\"name\":\"Ada\",\"scores\":[1,2,3]}";

summary = match doc (
  Ok v => (
    name = match (json_field "name" v) (Ok n => json_stringify n; Err _ => "?");
    first_score = match (json_index 0 v) (
      Ok s => match (json_as_number s) (Ok n => toString n; Err _ => "?");
      Err _ => "?"
    );
    name + " " + first_score
  );
  Err _ => "parse failed"
);
summary  # => "\"Ada\" 1" : String
```

Signatures, ascribed against the real imports so a drift breaks this file
(not just asserted in prose):

```noolang
{@json_stringify json_stringify, @json_field json_field, @json_index json_index,
 @json_as_string json_as_string, @json_as_number json_as_number, @json_as_bool json_as_bool,
 @json_as_array json_as_array, @json_as_object json_as_object, @json_equals json_equals}
  = import "std/json";

_stringify  = (json_stringify : JsonValue -> String);
_field      = (json_field : String -> JsonValue -> Result JsonValue JsonError);
_index      = (json_index : Float -> JsonValue -> Result JsonValue JsonError);
_as_string  = (json_as_string : JsonValue -> Result String JsonError);
_as_number  = (json_as_number : JsonValue -> Result Float JsonError);
_as_bool    = (json_as_bool : JsonValue -> Result Bool JsonError);
_as_array   = (json_as_array : JsonValue -> Result (List JsonValue) JsonError);
_as_object  = (json_as_object : JsonValue -> Result (List {String, JsonValue}) JsonError);
_equals     = (json_equals : JsonValue -> JsonValue -> Bool);
"signatures check out"  # => "signatures check out" : String
```

`json_parse`'s own signature isn't ascribed the same way: `JsonParseError`
is a variant whose type name equals its sole constructor's name, which
resolves to the *constructor's* function type in a type ascription, not the
variant type — a separate, pre-existing noolang quirk, not something this
module can route around. Demonstrated by real use instead:

```noolang
{@json_parse json_parse} = import "std/json";

bad = json_parse "not json";
error_message = match bad (
  Ok _ => "unexpected success";
  Err e => match e (JsonParseError info => (info | @message))
);
error_message  # => "unexpected character 'n'" : String
```

Plus the `JNull`/`JBool`/`JNumber`/`JString`/`JArray`/`JObject` constructors,
re-exported so callers can build `JsonValue`s directly (e.g. to serialize
data that didn't come from `json_parse`).

Two error variants, kept separate because they're different failure modes —
`JsonParseError` is malformed *text*; `JsonError` is "value is the wrong
shape" or "key/index not found" once you already have a `JsonValue`:

```
variant JsonParseError = JsonParseError {@message String, @position Float};

variant JsonError =
    JsonExpectedString | JsonExpectedNumber | JsonExpectedBool
  | JsonExpectedArray  | JsonExpectedObject
  | JsonMissingField String | JsonIndexOutOfBounds Float;
```

(Illustrative — declared inside `std/json.noo`.)

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
  in noolang to decode a `\uXXXX` escape with — rejected rather than
  silently mis-decoded (e.g. passing the literal letter through and
  dropping the backslash).

  ```noolang
  {@json_parse json_parse} = import "std/json";
  is_err = fn r => match r (Ok _ => False; Err _ => True);
  is_err (json_parse "\"\\u0041\"")  # => True
  ```
- **`-0` does not round-trip its sign.** `toString` normalizes `-0` to
  `"0"` regardless of the underlying float's sign bit, so `json_stringify`
  can't distinguish it from `0` even if parsing preserved the sign.
- **Non-finite numbers serialize to `"null"`.** `json_stringify`'s
  signature is `JsonValue -> String` with no error channel, so a
  `JNumber` holding `Infinity`/`-Infinity`/`NaN` (reachable from valid
  JSON text via arithmetic overflow) emits `"null"` rather than invalid
  JSON syntax — matching `JSON.stringify`'s own precedent for the same
  case.

  ```noolang
  {@json_parse json_parse, @json_stringify json_stringify} = import "std/json";
  overflowed = match (json_parse "1e400") (Ok v => json_stringify v; Err _ => "parse failed");
  overflowed  # => "null" : String
  ```
- **Duplicate object keys: last value wins, first position kept** — matches
  `JSON.parse`'s behavior, implemented via `assoc_set`.

  ```noolang
  {@json_parse json_parse, @json_stringify json_stringify} = import "std/json";
  deduped = match (json_parse "{\"a\":1,\"b\":2,\"a\":3}") (Ok v => json_stringify v; Err _ => "parse failed");
  deduped  # => "{\"a\":3,\"b\":2}" : String
  ```
- **Leading zeros (`"01"`) and raw unescaped control characters in strings
  are rejected**, per RFC 8259 §6 and §7 respectively.

## Implementation notes (combinator-based throughout)

`null`/`true`/`false`/string/array/object are all genuinely combinator-built
on `std/parser`'s `choice`/`pmap`/`between`/`sep_by`/`pbind`. Numbers use
`take_while` for digit runs, with sign/fraction/exponent explicitly
position-threaded rather than chained through `pbind` — each is optional
but, once its leading character is seen, requires at least one digit to
follow, a hard-fail-after-partial-match shape `choice`/`optional` can't
express without backtracking past an already-consumed character.

Two productions were hand-rolled workarounds for typer bugs
(`CROSS_MODULE_SCHEME_CORRUPTION_BUG`, `CHOICE_RECURSIVE_PAIRING_BUG` —
both fixed by the `generalize`/constraint-quantification fix landed
alongside #179) until both were rewritten back to combinator style once the
bugs were confirmed fixed: array/object repetition self-recurses through
`json_value_p` directly (a bare self-reference passed to `sep_by`/`pbind`,
not a second top-level binding — noolang's environment is strictly
sequential, so two separately-named functions can't call each other
forward), including the object-member `pbind`-pairing shape that used to
break it.

## History: why combinator-based, not hand-rolled

The module shipped once already as PR #165, hand-rolled recursive-descent
in pure `.noo` with no `std/parser` dependency (that library didn't exist
yet). That choice was forced, not stylistic: an early attempt at a
combinator-based rewrite typechecked ~17x slower, a cost specific to
noolang's own then-unmemoized parser backtracking on
combinator-heavy source, not to JSON parsing itself. Packrat memoization
(#174) fixed that mechanism; re-measured, the combinator-based version now
typechecks in the same ~20-30ms band as the hand-rolled one, so the
original perf reason to hand-roll no longer holds. PR #176 replaced the
hand-rolled version with this one; the public API is unchanged between the
two (confirmed by running PR #165's own TS test suite, unmodified, against
this implementation).
