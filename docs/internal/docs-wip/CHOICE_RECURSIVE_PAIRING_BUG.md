# Self-recursive `choice` branches break when one pairs the recursive result with a companion value

Filed 2026-08-01, found while reconstructing `std/json.noo` on top of
`std/parser.noo` for the packrat-memoization stress test (see
`PARSER_COMBINATOR_SIZE_COST.md`'s "combinator-style rewrite" section).
Routed around in the shipped file, not fixed here.

## Symptom

A self-recursive top-level function `value_p` with two (or more) `choice`
branches that each call `value_p` again typechecks fine — as long as no
branch combines `value_p`'s own result with a companion value inside a
record/tuple/variant. The moment one branch does that (the natural shape
for parsing an object member: a string key paired with a recursively-parsed
value), the whole function's inferred type breaks with a nonsensical
unification error, even though every individual branch is well-typed in
isolation.

## Minimal repro

```
{ @char char, @pmap pmap, @pbind pbind, @choice choice, @satisfy satisfy,
  @sep_by sep_by, @between between, @many many } = import "std/parser";

variant JsonValue = JNull | JArray (List JsonValue) | JObject (List {String, JsonValue});

null_p = pmap (fn _ => JNull) (char "n");
key_p = pmap (fn cs => join "" cs) (many (satisfy "k" (fn c => not (c == "\""))));

value_p = fn pos s => choice [
  null_p,
  pmap (fn items => JArray items) (between (char "[") (char "]") (sep_by value_p (char ","))),
  pmap (fn pairs => JObject pairs) (between (char "{") (char "}") (sep_by (pbind (fn k => pmap (fn v => {k, v}) value_p) key_p) (char ",")))
] pos s;

value_p
```

fails with:

```
TypeError: Cannot unify types
  Expected: JsonValue
  Got:      (String JsonValue)
  at line 8, column 1
```

`(String JsonValue)` is the `{k, v}` tuple from the object branch's pairing
— the error is reported against the whole `value_p` binding (line 8, its
closing `] pos s;`), not against either individual branch, and neither
branch references the other's local names.

## Isolation

Both of the following typecheck cleanly on their own (confirmed directly,
not just inferred from the failure above):

- **Array branch alone** (drop the `JObject`/object-with-pairing branch,
  keep `null_p` + the array branch that calls `value_p` inside `sep_by`
  with no pairing): typechecks, `Float -> String -> Result { @value
  JsonValue, @pos Float } ParseError`.
- **Object branch alone** (drop the array branch, keep only `null_p` + the
  object branch that pairs `value_p`'s recursive result with `key_p` via
  `pbind`/`pmap`): *also* typechecks cleanly by itself.

Only the combination — two-or-more `choice` branches that both recurse,
where at least one of them additionally pairs the recursive result with a
companion — reproduces the failure. This rules out "pairing a recursive
call is never safe" (the object-branch-alone case disproves that) and rules
out "two recursive choice branches is never safe" (an all-`sep_by`,
no-pairing two-branch version — see `PARSER_COMBINATOR_SIZE_COST.md`'s note
that `sep_by f sep` in both branches is fine). It's specifically the
*combination* of multiple recursive choice branches plus a pairing shape in
at least one of them.

## Likely cause (not traced to a fix)

Probably the same class of bug as the import-destructure arity bug
(#158/#159, fixed) and the empty-list type-variable collision bug (fixed,
see `git log` for `typeList`'s freshening fix) — a scheme-freshening gap
where a polymorphic binding used more than once ends up sharing type
variables across the uses instead of getting a fresh instantiation each
time. Here the "binding used more than once" is `value_p` calling itself
from two different `choice` branches, and the reused-scheme corruption
shows up as the pairing branch's tuple type leaking into (or colliding
with) the type expected by the unpaired branch's recursive call. Not
traced to a specific line in `src/typer/` — the fixes for the other two
instances of this bug class (`freshTypeVariable` in `typeList`;
"freshen envDiff schemes on merge" for import-destructure) are the
concrete starting points for whoever picks this up, since this looks like
a sibling gap in the same area rather than a new mechanism.

## Impact / workaround

`std/json.noo`'s array/object repetition is threaded through an explicit
`ParseMode` tag and one self-recursive `parse_node` function using manual
index-passing instead of `sep_by`/`choice` for the recursive cases — see
`parse_node` in `std/json.noo`. This sidesteps the bug (no `choice` branch
pairs a recursive `sep_by`/`choice`-combinator call with a companion value)
at the cost of losing the idiomatic combinator style for exactly the
productions (array/object repetition) that would otherwise showcase it
best. Scalar productions (null/bool/string/number) are unaffected and stay
genuinely combinator-built.

## Trigger for picking this up

Any grammar with mutually-referential-looking-but-actually-self-recursive
productions where one alternative pairs the recursive value with something
else — record/object parsing being the canonical case, but also e.g.
labeled-tree or key-value-list grammars generally. `std/parser.noo`'s own
docs/tests don't currently exercise this shape (its test suite avoids
object-like pairing in its own self-recursive examples), so it's easy to
hit only once a real consumer (like JSON) reaches for it.
