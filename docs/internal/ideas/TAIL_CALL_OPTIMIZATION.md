# Need: tail-call optimization in the evaluator

## Problem

The evaluator is tree-walking: `Evaluator.evaluateExpression` (src/evaluator/evaluator.ts:1772)
and `evaluateApplication` (src/evaluator/evaluator.ts:2001) call each other recursively, one
JS call frame per noolang function call. No TCO, no trampoline. A self-recursive noolang
function, or a combinator built on one (`many`/`many_go` in std/parser.noo), overflows the
JS stack once call depth reaches roughly 4000.

## Evidence

std/parser.noo's `many`/`many_go` recurse once per repetition — documented as unsafe for
character-level scanning in the module's own header comment. std/json.noo's JSON string
parser used `many` per character and overflowed on 6000-char string values (caught by
`test/features/std-json-module.test.ts`, flaky on CI — smaller runner stack than local).

Fixed in PR #188 by hand-rolling a `reduce`-based state machine (`json_string_body_p`)
instead of the combinator — `reduce` is a native (JS-loop) builtin, so it costs one call
frame regardless of input length. Same shape `take_while` already used for number parsing.

## Why this is a language gap, not a stdlib design choice

json.noo exists to write idiomatic noolang and surface where the language can't express it
elegantly (see AGENTS.md, [[noolang-house-style]]). The combinator form (`many`, direct
self-recursion) *is* the idiomatic shape. The reduce-based workaround is a native-loop
escape hatch, not idiomatic code — pushing it into std/parser.noo as a reusable primitive
just relocates the workaround, it doesn't remove the need for one. Any future recursive
combinator that needs per-element state hits the same wall.

## Direction

Evaluator-level fix, not stdlib: TCO (or a trampoline) for calls in tail position, so
direct/mutual recursion in noolang is safe at unbounded depth. Entry points to look at:
`evaluateExpression` and `evaluateApplication` in src/evaluator/evaluator.ts.

## Status

Done — see ADR 8 (`docs/internal/adrs/adr_0008.md`) for the design (syntactic
tail-position trampolining, not CPS or a bytecode VM) and its scope boundaries.
Self-tail-recursive direct application is now stack-safe at unbounded depth.

Not done as part of this: reverting `std/json.noo`'s `reduce`-based
`json_string_body_p` back to the plain `many`-based combinator form, to prove
the fix actually closes the loop that motivated it. `many`/`many_go` in
std/parser.noo recurse through ordinary function application, which the fix
covers — this should now round-trip cleanly. Worth doing as a follow-up PR,
not bundled into the evaluator change.
