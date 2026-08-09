# Parenthesized expressions don't extend their AST location through the enclosing parens

Status: open

Filed 2026-08-08, found building the LSP "infer type annotation" code
action (`lsp/extension/server/src/annotation-refactor.ts`, PR #182): it
needs an expression's accurate end position to splice a type annotation
after it, and #181/#183 fixed the composite-expression location bugs that
blocked that — except this one.

## Symptom

Any expression wrapped in `(...)` reports a `location.end` that stops at
the end of the *inner* expression, short of the closing `)`. Minimal
repro:

```
pow10 = fn n => if n <= 0 then 1 else 10 * pow10 (n - 1);
```

`pow10`'s function-body location ends at column 56 — the position of the
closing `)` of `(n - 1)` itself, not one past it. The whole chain (binary
`*` → application `pow10 (n - 1)` → its arg) correctly propagates up to
that inner boundary per #181/#183's fixes; the paren just never gets
added on top.

## Root cause

`parseParenExpr` (`src/parser/parser.ts`, around the "Parenthesized
Expressions" section) parses `(`, delegates to `parseSequence` for the
inner expression, parses `)`, and returns the inner expression **as-is**:

```ts
([_open, expr, _close]) =>
  expr.kind === 'binary' && expr.operator === ';'
    ? { ...expr, parenthesized: true }
    : expr
```

Only the `;`-sequence case gets a `parenthesized: true` tag (unrelated to
location); every other case returns `expr` completely unchanged, carrying
whatever location it already had from parsing the inner content alone —
never extended to cover the `(` / `)` tokens.

## Practical impact

Affects any tool that trusts an expression's end position to splice or
bound source text. The annotation-refactor code action already defends
against it: `planInferAnnotationEdit`'s safety guard peeks at the
character right after the AST-reported end and declines (rather than
inserts/corrupts) when it isn't what a safe splice expects — so this
doesn't corrupt files, but it does silently decline the action for any
function whose body ends in a parenthesized sub-expression (extremely
common — any trailing function call or grouped expression, e.g.
`json_as_string`'s `match v (...)`, `pow10`'s `pow10 (n - 1)`).

## Fix (not attempted)

In `parseParenExpr`, extend the returned expression's location to span
from the `(` token's start to the `)` token's end, e.g.:

```ts
([open, expr, close]) =>
  expr.kind === 'binary' && expr.operator === ';'
    ? { ...expr, parenthesized: true, location: createLocation(open.location.start, close.location.end) }
    : { ...expr, location: createLocation(open.location.start, close.location.end) }
```

Needs a `parser-locations.test.ts` case confirming a paren-wrapped
expression's end reaches past the `)`, plus a check that this doesn't
regress anything relying on the *inner* expression's location (e.g. error
messages that currently point inside the parens rather than at the whole
group — decide whether that's the right behavior to keep separately).

## Trigger for picking this up

Broadening "infer type annotation" coverage — right now it silently
declines for most real-world functions in `std/json.noo` because their
bodies end in a parenthesized call.
