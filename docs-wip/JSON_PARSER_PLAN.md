# JSON Parser Plan

A JSON parser/serializer for noolang, as the next stdlib-gap forcing function
(same pattern as word-count → string primitives, find_todos → &&/||, the test
runner → exec hardening). Confirmed via spike (2026-07-23): no prerequisite
work needed, representation decided, not yet implemented.

## Scope

Parse + serialize, hand-written recursive-descent in pure `.noo` — not a
native builtin wrapping JS `JSON.parse`. A native wrapper would be correct
immediately but defeats the point: this exercise exists to find real stdlib
gaps (the way word-count found missing string primitives), and a native
implementation papers over exactly the gaps it would otherwise surface.

## Representation: concrete `JsonValue` variant, not `Unknown`

```
variant JsonValue = JNull | JBool Bool | JNumber Float | JString String
                   | JArray (List JsonValue) | JObject (List {String, JsonValue});
```

This was not the first design considered — worth recording why, since the
detour surfaces real constraints on `Unknown` that matter beyond this task.

### Why not `Unknown` (the `schema.noo` approach)

A deleted prototype, `schema.noo` (removed in #129, recoverable via
`git show 076e4bb^:schema.noo`), built a decode-combinator layer:
`Schema a = Unknown -> Result a DecodeError`, with `string_schema`/
`list_schema`/etc. on top of the `isString`/`isNumber`/`isBool`/`isList`
refinement builtins. Initial plan was to reuse it directly: parse JSON text
into `Unknown`, decode with schema-style combinators.

Spiking that plan found two blocking issues:

1. **Records can't be constructed with runtime-computed keys.**
   `k = "a"; {@k 1}` types the field literally as `k`, not as the value of
   `k` — noolang record literals only support statically-known field names.
   JSON object keys are only known at parse time, so a JSON object can never
   become a noolang record in the first place, `Unknown`-wrapped or not.
   Arrays don't have this problem (`List` doesn't need static per-element
   declaration), so this only blocks objects — see `assoc_get`/`assoc_set`
   (#130) for the existing `List {String, a}` answer to "map with runtime
   keys," which was the fallback considered.

2. **`Unknown` can't recover tuple/record shapes at all.** Only
   `isString`/`isNumber`/`isBool`/`isList` exist as refinement builtins — no
   `isTuple`, no `isRecord`. So even the `List {String, Unknown}` fallback
   for objects has no way to decode back out of `Unknown` once wrapped; only
   4 of JSON's 6 kinds round-trip through it. A JSON value recurses in every
   direction (object-of-array, array-of-object, ...) and needs one uniform
   recursive type — `Unknown` only uniformly covers part of that.

The deeper realization, once both of those surfaced: **`Unknown` and a
hand-rolled parser are solving different problems, not competing solutions
to the same one.** `Unknown`'s actual job (see
[[ffi-abandoned-exec-is-escape-hatch]] in project memory) is blessing a value
that arrives *already shaped* from outside noolang's type checker — FFI,
`exec` output, a hypothetical native `JSON.parse` builtin — into safe typed
data via `forget` (erase) + refinement (recover). A hand-written `.noo`
parser never crosses that boundary: nothing foreign hands it a shape, it
*constructs* the shape itself, from text, entirely under noolang's own typed
construction rules. There's nothing to erase, so there's nothing for
`Unknown` to be doing.

`schema.noo` was correct for what it was built for and stays parked for that
purpose (do not revive it for this task). Its *pattern* — `Result`-returning
validators, a `DecodeError` variant, composable extractors — still informs a
clean query/extraction API over `JsonValue` once parsed; only the erase/
recover machinery underneath it doesn't apply here.

## Spike findings (2026-07-23) — no prerequisite work needed

Confirmed all buildable in current noolang, no new builtins required:

- Recursion works (`fn n => if n == 0 then ... else 1 + rec (n - 1)`).
- `chars : String -> List String`, `substring`, `indexOf` sufficient for
  char-by-char scanning (no `Char` type — 1-char strings stand in).
- `Monad`/`Functor` instances exist for `Result`, `Option`, `List` — parser
  combinators (sequencing, mapping over parse results) are viable now.
- `list_get`/`at`, `assoc_get`/`assoc_set` (#130) available if a
  `List {String, JsonValue}` needs dict-like lookup during extraction.

## Also considered and parked

A `.noo`-native source-code formatter was raised as an alternative forcing
function during scoping. Parked, not related to JSON — it needs
comment-preserving lexer trivia (currently `skipComment()` discards comments
outright, never producing a token) and an AST-as-value builtin design before
a formatter is buildable in userland at all. Real future work, but a
multi-session prerequisite chain, not this task.

## Where to start

1. Tokenizer: JSON text → token stream (or straight to recursive-descent
   parse, tokenizer may be unnecessary at this grammar's size).
2. Parser: tokens/text → `JsonValue`, `Result JsonValue ParseError`.
3. Serializer: `JsonValue -> String`, handling string escaping and number
   formatting.
4. Extraction API over `JsonValue`, `schema.noo`-flavored (`Result`-based,
   composable), for pulling typed values out of a parsed object/array.

Naming: stdlib is standardizing on `snake_case` (issue #131, decided
2026-07-23, not yet executed as a rename pass) — new JSON functions should
follow that from the start rather than adding to the inconsistency.
