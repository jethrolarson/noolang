# A self-recursive binding wrapped in a type ascription loses its own recursion at runtime

Status: open

Filed 2026-08-05, found while adding type ascriptions to `std/json.noo`
(`json_stringify`, `json_equals` — both self-recursive over `JsonValue`).

## Symptom

Typechecks clean; crashes at runtime with `Undefined variable: <name>` the
moment the recursive call actually runs. Minimal repro:

```
my_f = (fn n => if n <= 0 then 0 else 1 + my_f (n - 1) : Float -> Float);
my_f 3
```

`--types-file` reports `Float -> Float` correctly. Running it: `Error:
Undefined variable: my_f`. Removing the `: Float -> Float` ascription (or
the wrapping parens plus ascription) fixes it with no other change.

## Root cause

`Evaluator.evaluateDefinition` (`src/evaluator/evaluator.ts:1568`) decides
whether a definition is self-recursive by a syntactic scan,
`containsVariable(def.value, def.name)` (`:2720`), and only pre-registers
a placeholder cell for the name (so the recursive call resolves against
itself) when that scan returns `true`. The scan is a `switch` over
`Expression.kind` with an explicit case per node type it recurses into —
`'typed'` (the ascription node, `expr : Type`) is hardcoded to `return
false` (`:2776-2777`) instead of recursing into `expr.expression`
(`TypedExpression.expression`, `src/ast.ts:372`). Every other wrapper kind
in the switch (`'definition'`, `'mutable-definition'`, `'pipeline'`, ...)
recurses into its inner expression; `'typed'` alone doesn't, so a
recursive call sitting anywhere inside an ascribed expression is invisible
to this check.

## Fix (not attempted)

One line, `src/evaluator/evaluator.ts:2776-2777`:

```ts
case 'typed':
  return this.containsVariable(expr.expression, varName);
```

## Trigger for picking this up

Any self-recursive top-level or `where`-bound function gets a type
ascription added around it, e.g. for documentation. Currently worked
around in `std/json.noo` by leaving `json_stringify`/`json_equals`
unascribed, each with a comment pointing here.
